"""
Train XGBoost on StockHistory (Postgres).
Uses time-based validation, scale-free features, and 5-day forward-return labels.
"""
import os
import sys

from dotenv import load_dotenv

load_dotenv()

import joblib
import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    roc_auc_score,
)

from ml_features import (
    FEATURE_COLUMNS,
    LABEL_HORIZON_DAYS,
    LABEL_THRESHOLD,
    build_training_frame,
)

DATABASE_URL = os.environ.get("DATABASE_URL", "")
MODEL_PATH = os.path.join(os.path.dirname(__file__), "models", "xgboost_stock_model.pkl")
TRAIN_TEST_RATIO = 0.8


def load_from_db():
    if not DATABASE_URL:
        return None
    try:
        from sqlalchemy import create_engine, text

        engine = create_engine(DATABASE_URL)
        with engine.connect() as conn:
            result = conn.execute(
                text(
                    """
                SELECT sh.date, sh.open, sh.high, sh.low, sh.close, sh.volume, s.ticker
                FROM "StockHistory" sh
                JOIN "Stock" s ON sh."stockId" = s.id
                ORDER BY s.ticker, sh.date
            """
                )
            )
            rows = result.fetchall()
        if not rows:
            return None
        df = pd.DataFrame(
            rows, columns=["date", "open", "high", "low", "close", "volume", "ticker"]
        )
        df["date"] = pd.to_datetime(df["date"])
        print(f"Loaded {len(df)} rows from database across {df['ticker'].nunique()} tickers")
        return df
    except Exception as e:
        print(f"DB load failed: {e}")
        return None


def make_synthetic_data(n=2000):
    print("WARNING: Using synthetic data — not valid for production.")
    np.random.seed(42)
    prices = 1000 + np.cumsum(np.random.randn(n) * 10)
    dates = pd.date_range("2020-01-01", periods=n, freq="B")
    return pd.DataFrame(
        {
            "date": dates,
            "ticker": "SYNTH.NS",
            "close": prices,
            "open": prices * (1 + np.random.randn(n) * 0.005),
            "high": prices * (1 + np.abs(np.random.randn(n)) * 0.01),
            "low": prices * (1 - np.abs(np.random.randn(n)) * 0.01),
            "volume": np.random.randint(100_000, 5_000_000, n).astype(float),
        }
    )


def time_based_split(frame: pd.DataFrame, train_ratio: float = TRAIN_TEST_RATIO):
    """Chronological split — no future leakage into training."""
    frame = frame.sort_values("date").reset_index(drop=True)
    cut = int(len(frame) * train_ratio)
    if cut < 100 or len(frame) - cut < 30:
        raise ValueError(f"Not enough samples for time split (n={len(frame)})")
    train = frame.iloc[:cut]
    test = frame.iloc[cut:]
    return train, test


def print_metrics(name: str, y_true, y_pred, y_prob):
    print(f"\n--- {name} ---")
    print(f"Accuracy: {accuracy_score(y_true, y_pred):.4f}")
    try:
        print(f"ROC-AUC:  {roc_auc_score(y_true, y_prob):.4f}")
    except ValueError:
        print("ROC-AUC:  n/a (single class in split)")
    print("Confusion matrix:\n", confusion_matrix(y_true, y_pred))
    print(classification_report(y_true, y_pred, digits=3, zero_division=0))


def train_model():
    raw = load_from_db()
    if DATABASE_URL and (raw is None or raw.empty):
        print("ERROR: DATABASE_URL is set but no StockHistory rows found.")
        print("Run: cd server && npm run seed && npm run import-history")
        sys.exit(1)

    if raw is None or raw.empty:
        if DATABASE_URL:
            sys.exit(1)
        raw = make_synthetic_data()

    frame = build_training_frame(raw)
    if len(frame) < 200:
        print(f"ERROR: Only {len(frame)} training rows after feature engineering (need ~200+).")
        sys.exit(1)

    print(
        f"Label: {LABEL_HORIZON_DAYS}-day forward return > {LABEL_THRESHOLD * 100:.1f}% "
        f"(positive rate {frame['target'].mean():.2%})"
    )

    train_df, test_df = time_based_split(frame)
    X_train = train_df[FEATURE_COLUMNS]
    y_train = train_df["target"]
    X_test = test_df[FEATURE_COLUMNS]
    y_test = test_df["target"]

    pos = int((y_train == 1).sum())
    neg = int((y_train == 0).sum())
    scale_pos_weight = neg / max(pos, 1)

    print(f"Training XGBoost on {len(X_train)} samples (time-based split)...")
    model = xgb.XGBClassifier(
        n_estimators=300,
        learning_rate=0.05,
        max_depth=4,
        subsample=0.8,
        colsample_bytree=0.8,
        min_child_weight=5,
        reg_alpha=0.1,
        reg_lambda=1.0,
        scale_pos_weight=scale_pos_weight,
        random_state=42,
        eval_metric="logloss",
    )

    model.fit(
        X_train,
        y_train,
        eval_set=[(X_test, y_test)],
        verbose=False,
    )

    y_pred_train = model.predict(X_train)
    y_pred_test = model.predict(X_test)
    y_prob_train = model.predict_proba(X_train)[:, 1]
    y_prob_test = model.predict_proba(X_test)[:, 1]

    print_metrics("Train (in-sample)", y_train, y_pred_train, y_prob_train)
    print_metrics("Test (forward time)", y_test, y_pred_test, y_prob_test)

    # High-confidence subset (matches /predict thresholds)
    mask = y_prob_test >= 0.55
    if mask.sum() > 10:
        prec = accuracy_score(y_test[mask], y_pred_test[mask])
        print(f"\nHigh-confidence BUY (prob>=0.55): n={mask.sum()}, accuracy={prec:.4f}")

    os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
    bundle = {
        "model": model,
        "feature_columns": FEATURE_COLUMNS,
        "label_horizon_days": LABEL_HORIZON_DAYS,
        "label_threshold": LABEL_THRESHOLD,
        "version": 2,
    }
    joblib.dump(bundle, MODEL_PATH)
    print(f"\nModel bundle saved to {MODEL_PATH}")


if __name__ == "__main__":
    train_model()
