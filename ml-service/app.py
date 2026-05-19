import os
import logging
from datetime import datetime, timedelta

import joblib
import numpy as np
import pandas as pd
from flask import Flask, request, jsonify
from sqlalchemy import create_engine, text

from ml_features import (
    FEATURE_COLUMNS,
    add_ml_features,
    display_technicals,
    latest_feature_row,
    normalize_ohlcv,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# ── Model loading ──────────────────────────────────────────────────────────────
MODEL_PATH = os.path.join(os.path.dirname(__file__), "models", "xgboost_stock_model.pkl")
model = None
model_bundle = None
if os.path.exists(MODEL_PATH):
    try:
        loaded = joblib.load(MODEL_PATH)
        if isinstance(loaded, dict) and "model" in loaded:
            model_bundle = loaded
            model = loaded["model"]
            logger.info(
                "XGBoost bundle v%s loaded (%d features)",
                loaded.get("version", "?"),
                len(loaded.get("feature_columns", FEATURE_COLUMNS)),
            )
        else:
            model = loaded
            logger.warning("Legacy model pickle — retrain with train_model.py for v2 features")
    except Exception as e:
        logger.warning("Could not load XGBoost model: %s", e)
else:
    logger.warning("Model file not found at %s — using heuristic predictions", MODEL_PATH)

# ── FinBERT loading (lazy) ─────────────────────────────────────────────────────
finbert_pipeline = None
_finbert_load_attempted = False

def get_finbert():
    global finbert_pipeline, _finbert_load_attempted
    if finbert_pipeline is not None:
        return finbert_pipeline
    if _finbert_load_attempted:
        return None
    _finbert_load_attempted = True
    try:
        from transformers import pipeline as hf_pipeline
        finbert_pipeline = hf_pipeline(
            "text-classification",
            model="ProsusAI/finbert",
            top_k=1,
        )
        logger.info("FinBERT loaded successfully")
    except Exception as e:
        logger.warning("FinBERT not available: %s — using mock sentiment", e)
    return finbert_pipeline

# ── Database ───────────────────────────────────────────────────────────────────
DATABASE_URL = os.environ.get("DATABASE_URL", "")
db_engine = None
if DATABASE_URL:
    try:
        db_engine = create_engine(DATABASE_URL, pool_pre_ping=True)
        logger.info("Database connected")
    except Exception as e:
        logger.warning("DB connection failed: %s", e)


def load_close_panel(tickers: list, lookback_days: int = 730) -> pd.DataFrame:
    """Wide DataFrame of closing prices (columns = tickers), from Postgres only."""
    if not db_engine or not tickers:
        return pd.DataFrame()
    safe = [str(t) for t in tickers if t and isinstance(t, str)]
    if len(safe) < 1:
        return pd.DataFrame()
    since = datetime.utcnow() - timedelta(days=lookback_days)
    placeholders = ", ".join(":" + f"t{i}" for i in range(len(safe)))
    params = {f"t{i}": safe[i] for i in range(len(safe))}
    params["since"] = since
    query = text(f"""
        SELECT s.ticker AS ticker, sh.date AS d, sh.close AS close
        FROM "StockHistory" sh
        JOIN "Stock" s ON s.id = sh."stockId"
        WHERE s.ticker IN ({placeholders}) AND sh.date >= :since
        ORDER BY sh.date ASC
    """)
    try:
        with db_engine.connect() as conn:
            rows = conn.execute(query, params).fetchall()
    except Exception as e:
        logger.warning("load_close_panel query failed: %s", e)
        return pd.DataFrame()
    if not rows:
        return pd.DataFrame()
    df = pd.DataFrame(rows, columns=["ticker", "d", "close"])
    df["d"] = pd.to_datetime(df["d"])
    wide = df.pivot(index="d", columns="ticker", values="close")
    return wide.sort_index().ffill()


def get_stock_history(ticker: str, days: int = 90) -> pd.DataFrame:
    """Fetch OHLCV from Postgres StockHistory, fallback to yfinance."""
    if db_engine:
        try:
            since = datetime.utcnow() - timedelta(days=days)
            query = text("""
                SELECT sh.date, sh.open, sh.high, sh.low, sh.close, sh.volume
                FROM "StockHistory" sh
                JOIN "Stock" s ON s.id = sh."stockId"
                WHERE s.ticker = :ticker AND sh.date >= :since
                ORDER BY sh.date ASC
                LIMIT 800
            """)
            with db_engine.connect() as conn:
                rows = conn.execute(query, {"ticker": ticker, "since": since}).fetchall()
            if rows:
                df = pd.DataFrame(rows, columns=["Date", "Open", "High", "Low", "Close", "Volume"])
                df["Date"] = pd.to_datetime(df["Date"])
                df.set_index("Date", inplace=True)
                return df
        except Exception as e:
            logger.warning("DB history fetch failed for %s: %s", ticker, e)

    # Fallback: yfinance
    try:
        import yfinance as yf
        stock = yf.Ticker(ticker)
        df = stock.history(period="3mo")
        if not df.empty:
            return df
    except Exception as e:
        logger.warning("yfinance fallback failed for %s: %s", ticker, e)

    return pd.DataFrame()


# ── Endpoints ──────────────────────────────────────────────────────────────────

@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "service": "ml-service",
        "model_loaded": model is not None,
        "model_version": model_bundle.get("version") if model_bundle else (1 if model else None),
        "feature_columns": model_bundle.get("feature_columns", FEATURE_COLUMNS) if model_bundle else FEATURE_COLUMNS,
        "model_path": MODEL_PATH,
        "model_file_exists": os.path.exists(MODEL_PATH),
        "database_connected": db_engine is not None,
        "finbert_loaded": finbert_pipeline is not None or not _finbert_load_attempted,
        "hint": (
            "POST /predict and check model_used:true for live XGBoost signals. "
            "If model_loaded is false, run train_model.py (needs StockHistory in DB) and redeploy ml-service."
        ),
    })


def compute_signal(ticker: str, *, require_model: bool = False) -> dict:
    """XGBoost + technicals on DB OHLCV. Used by /predict and /optimize (no random mocks)."""
    if require_model and model is None:
        raise RuntimeError("XGBoost model not loaded — cannot run ML portfolio optimization")

    df = get_stock_history(ticker, days=380)
    if df.empty or len(df) < 60:
        raise ValueError(f"Insufficient history for {ticker}")

    feat_row = latest_feature_row(df)
    tech = display_technicals(df)
    enriched = add_ml_features(normalize_ohlcv(df))
    latest = enriched.iloc[-1]
    rsi = float(latest["rsi"])
    macd = float(latest["macd"])
    macd_signal = float(latest["macd_signal"])

    buy_prob = None
    model_used = False

    if model is not None and feat_row is not None:
        cols = model_bundle.get("feature_columns", FEATURE_COLUMNS) if model_bundle else FEATURE_COLUMNS
        features = pd.DataFrame([feat_row[cols].astype(float)])
        buy_prob = float(model.predict_proba(features)[0][1])
        confidence = int(max(50, min(95, buy_prob * 100)))
        verdict = "BUY" if buy_prob > 0.55 else ("SELL" if buy_prob < 0.45 else "HOLD")
        model_used = True
    else:
        if model is not None and feat_row is None:
            logger.warning("Model loaded but features incomplete for %s — using heuristics", ticker)
        close = float(latest["close"])
        sma50 = float(latest["sma_50"])
        score = 0
        if rsi < 40:
            score += 1
        elif rsi > 70:
            score -= 1
        if macd > macd_signal:
            score += 1
        else:
            score -= 1
        if close > sma50:
            score += 1
        confidence = min(90, max(50, 65 + score * 8))
        verdict = "BUY" if score >= 1 else ("SELL" if score <= -1 else "HOLD")
        buy_prob = 0.55 if verdict == "BUY" else (0.45 if verdict == "SELL" else 0.5)

    reasoning_parts = []
    if model_used:
        horizon = model_bundle.get("label_horizon_days", 5) if model_bundle else 5
        reasoning_parts.append(
            f"XGBoost {horizon}d-ahead buy probability {buy_prob * 100:.1f}%"
        )
    if rsi < 30:
        reasoning_parts.append(f"RSI {rsi:.1f} oversold")
    elif rsi > 70:
        reasoning_parts.append(f"RSI {rsi:.1f} overbought")
    else:
        reasoning_parts.append(f"RSI {rsi:.1f} neutral")
    if macd > macd_signal:
        reasoning_parts.append("MACD bullish")
    else:
        reasoning_parts.append("MACD bearish")

    return {
        "ticker": ticker,
        "verdict": verdict,
        "confidence": confidence,
        "buy_prob": round(buy_prob, 4),
        "model_used": model_used,
        "reasoning": ". ".join(reasoning_parts) + ".",
        "technicals": tech,
    }


def aligned_price_matrix(tickers: list, lookback_days: int = 730):
    """Daily closes from Postgres, forward-filled for portfolio math."""
    wide = load_close_panel(tickers, lookback_days)
    available = [t for t in tickers if t in wide.columns]
    if len(available) < 2:
        raise ValueError(
            "Need OHLC history for at least 2 holdings in the database. "
            "Run: docker compose exec core-api npm run import-history"
        )
    prices = wide[available].ffill().bfill()
    prices = prices.loc[prices.notna().any(axis=1)]
    if len(prices) < 60:
        raise ValueError(f"Only {len(prices)} trading days overlap — import more history")
    return prices, available


def ml_tilt_expected_returns(mu: pd.Series, signals: dict) -> pd.Series:
    """Tilt historical expected returns using XGBoost buy probabilities."""
    strength = float(os.environ.get("OPTIMIZE_ML_TILT", "0.35"))
    tilted = mu.copy()
    for t in tilted.index:
        sig = signals.get(t)
        if not sig:
            continue
        bp = float(sig.get("buy_prob", 0.5))
        factor = 1.0 + strength * (2.0 * (bp - 0.5))
        tilted[t] = float(tilted[t]) * factor
    return tilted


@app.route("/predict", methods=["POST"])
def predict():
    data = request.json or {}
    ticker = data.get("ticker", "RELIANCE.NS")

    try:
        return jsonify(compute_signal(ticker, require_model=False))
    except Exception as e:
        logger.warning("Predict error for %s: %s", ticker, e)
        return jsonify({"error": str(e), "ticker": ticker}), 422


@app.route("/optimize", methods=["POST"])
def optimize():
    """
    ML + quant portfolio optimization:
    - Historical returns & Ledoit-Wolf covariance from Postgres OHLCV (~2y)
    - Expected returns tilted by XGBoost buy probability per holding
    - PyPortfolioOpt max-Sharpe (min-volatility fallback if numerically unstable)
    """
    data = request.json or {}
    holdings = data.get("holdings", [])

    if not holdings:
        return jsonify({"optimizedPortfolio": [], "mode": "no_holdings"})

    if model is None:
        return jsonify({
            "error": "XGBoost model not loaded in ml-service. Rebuild the ml-service image.",
            "optimizedPortfolio": [],
        }), 503

    if not db_engine:
        return jsonify({
            "error": "ml-service has no DATABASE_URL — cannot load price history.",
            "optimizedPortfolio": [],
        }), 503

    tickers = [str(h["ticker"]) for h in holdings if h.get("ticker")]
    current_alloc = {str(h["ticker"]): float(h.get("currentAlloc", 0)) for h in holdings}

    try:
        from pypfopt import EfficientFrontier, expected_returns
        from pypfopt.risk_models import CovarianceShrinkage

        prices, available = aligned_price_matrix(tickers, lookback_days=730)

        signals = {}
        for t in available:
            signals[t] = compute_signal(t, require_model=True)

        mu_hist = expected_returns.mean_historical_return(prices, frequency=252)
        mu = ml_tilt_expected_returns(mu_hist, signals)
        S = CovarianceShrinkage(prices, frequency=252).ledoit_wolf()

        risk_free = float(os.environ.get("RISK_FREE_RATE", "0.06"))
        ef = EfficientFrontier(mu, S, weight_bounds=(0.0, 1.0))
        try:
            ef.max_sharpe(risk_free_rate=risk_free)
            opt_method = "max_sharpe"
        except Exception as sharpe_err:
            logger.warning("max_sharpe failed (%s), using min_volatility", sharpe_err)
            ef = EfficientFrontier(mu, S, weight_bounds=(0.0, 1.0))
            ef.min_volatility()
            opt_method = "min_volatility"

        weights = dict(ef.clean_weights())
        perf = ef.portfolio_performance(verbose=False, risk_free_rate=risk_free)
        port_return, port_vol, sharpe = perf[0], perf[1], perf[2]

        optimized = []
        for t in tickers:
            wt = float(weights.get(t, 0.0))
            target = wt * 100.0
            cur = current_alloc.get(t, 0.0)
            diff = target - cur
            action = "BUY" if diff > 2 else ("SELL" if diff < -2 else "HOLD")
            short = t.replace(".NS", "").replace(".BO", "")
            sig = signals.get(t, {})
            bp = sig.get("buy_prob", 0.5)
            ann_ret = float(mu_hist[t]) if t in mu_hist.index else 0.0
            ann_vol = float(np.sqrt(S.loc[t, t])) if t in S.index else 0.0

            optimized.append({
                "ticker": t,
                "action": action,
                "currentAlloc": round(cur, 1),
                "targetAlloc": round(target, 1),
                "reason": (
                    f"{short}: {opt_method.replace('_', ' ')} target {target:.1f}% (now {cur:.1f}%). "
                    f"XGBoost {sig.get('verdict', '—')} ({bp * 100:.0f}% buy prob, conf {sig.get('confidence', 0)}%). "
                    f"Hist ann. return {ann_ret * 100:.1f}%, vol {ann_vol * 100:.1f}% from {len(prices)} DB days."
                ),
                "mlVerdict": sig.get("verdict"),
                "mlBuyProb": bp,
                "mlConfidence": sig.get("confidence"),
            })

        return jsonify({
            "optimizedPortfolio": optimized,
            "mode": "ml_max_sharpe",
            "modelLoaded": True,
            "optimization": {
                "method": opt_method,
                "historyDays": len(prices),
                "portfolioExpectedReturn": round(float(port_return), 4),
                "portfolioVolatility": round(float(port_vol), 4),
                "sharpeRatio": round(float(sharpe), 3),
                "riskFreeRate": risk_free,
            },
        })

    except ValueError as e:
        logger.warning("Optimize validation failed: %s", e)
        return jsonify({"error": str(e), "optimizedPortfolio": []}), 422
    except Exception as e:
        logger.error("Optimize failed: %s", e, exc_info=True)
        return jsonify({"error": str(e), "optimizedPortfolio": []}), 500


@app.route("/sentiment-batch", methods=["POST"])
def sentiment_batch():
    data = request.json or {}
    texts = data.get("texts", [])

    if not texts:
        return jsonify({"results": []})

    results = []
    fb = get_finbert()
    if fb:
        try:
            predictions = fb(texts[:32], truncation=True, max_length=512)
            for pred in predictions:
                label = pred[0]["label"].lower()  # positive | negative | neutral
                score = pred[0]["score"]
                mapped = "bullish" if label == "positive" else ("bearish" if label == "negative" else "neutral")
                results.append({"label": mapped, "score": round(score, 4)})
            return jsonify({"results": results})
        except Exception as e:
            logger.warning("FinBERT inference failed: %s", e)

    # Mock fallback
    for text in texts:
        text_lower = text.lower()
        if any(w in text_lower for w in ["gain", "surge", "bull", "up", "profit", "rally"]):
            results.append({"label": "bullish", "score": 0.75})
        elif any(w in text_lower for w in ["fall", "drop", "bear", "down", "loss", "crash"]):
            results.append({"label": "bearish", "score": 0.72})
        else:
            results.append({"label": "neutral", "score": 0.60})

    return jsonify({"results": results})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=False)
