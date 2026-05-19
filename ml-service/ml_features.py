"""
Shared feature engineering for train_model.py and app.py (inference).
Keep training and /predict in sync.
"""
from __future__ import annotations

import os

import numpy as np
import pandas as pd

# Label: forward return over N days exceeds threshold (fraction, e.g. 0.01 = +1%)
LABEL_HORIZON_DAYS = int(os.environ.get("ML_LABEL_HORIZON_DAYS", "5"))
LABEL_THRESHOLD = float(os.environ.get("ML_LABEL_THRESHOLD", "0.01"))

FEATURE_COLUMNS = [
    "ret_1d",
    "ret_5d",
    "ret_20d",
    "vol_ratio",
    "rsi",
    "macd",
    "macd_signal",
    "macd_hist",
    "dist_sma20",
    "dist_sma50",
    "bb_position",
    "range_pct",
]


def normalize_ohlcv(df: pd.DataFrame) -> pd.DataFrame:
    """Standardize column names to lowercase open/high/low/close/volume (+ optional date)."""
    out = df.copy()
    mapping = {
        "Open": "open",
        "High": "high",
        "Low": "low",
        "Close": "close",
        "Volume": "volume",
        "Date": "date",
    }
    out = out.rename(columns={k: v for k, v in mapping.items() if k in out.columns})
    if "date" not in out.columns and isinstance(out.index, pd.DatetimeIndex):
        out = out.reset_index()
        if out.columns[0] != "date":
            out = out.rename(columns={out.columns[0]: "date"})
    return out


def calculate_technical_indicators(df: pd.DataFrame) -> pd.DataFrame:
    df = normalize_ohlcv(df)
    df = df.copy()
    close = df["close"].astype(float)

    df["sma_20"] = close.rolling(20).mean()
    df["sma_50"] = close.rolling(50).mean()

    delta = close.diff()
    gain = delta.where(delta > 0, 0.0).rolling(14).mean()
    loss = (-delta.where(delta < 0, 0.0)).rolling(14).mean()
    rs = gain / loss.replace(0, np.nan)
    df["rsi"] = 100 - (100 / (1 + rs))

    ema12 = close.ewm(span=12, adjust=False).mean()
    ema26 = close.ewm(span=26, adjust=False).mean()
    df["macd"] = ema12 - ema26
    df["macd_signal"] = df["macd"].ewm(span=9, adjust=False).mean()

    bb_mid = close.rolling(20).mean()
    bb_std = close.rolling(20).std()
    df["bb_upper"] = bb_mid + 2 * bb_std
    df["bb_lower"] = bb_mid - 2 * bb_std

    return df


def add_ml_features(df: pd.DataFrame) -> pd.DataFrame:
    """Scale-free features for XGBoost."""
    df = calculate_technical_indicators(df)
    close = df["close"].astype(float)
    vol = df["volume"].astype(float).replace(0, np.nan)

    df["ret_1d"] = close.pct_change(1)
    df["ret_5d"] = close.pct_change(5)
    df["ret_20d"] = close.pct_change(20)
    df["vol_ratio"] = vol / vol.rolling(20).mean()

    df["macd_hist"] = df["macd"] - df["macd_signal"]
    df["dist_sma20"] = (close - df["sma_20"]) / df["sma_20"]
    df["dist_sma50"] = (close - df["sma_50"]) / df["sma_50"]

    bb_width = (df["bb_upper"] - df["bb_lower"]).replace(0, np.nan)
    df["bb_position"] = (close - df["bb_lower"]) / bb_width

    df["range_pct"] = (df["high"] - df["low"]) / close

    return df


def add_target(df: pd.DataFrame, horizon: int = LABEL_HORIZON_DAYS, threshold: float = LABEL_THRESHOLD) -> pd.DataFrame:
    df = df.copy()
    fwd = df["close"].shift(-horizon) / df["close"] - 1.0
    df["target"] = (fwd > threshold).astype(int)
    return df


def build_training_frame(raw_df: pd.DataFrame, horizon: int = LABEL_HORIZON_DAYS, threshold: float = LABEL_THRESHOLD) -> pd.DataFrame:
    """Per-ticker feature rows with date, target, and FEATURE_COLUMNS."""
    raw_df = normalize_ohlcv(raw_df)
    parts = []

    groups = raw_df.groupby("ticker") if "ticker" in raw_df.columns else [(None, raw_df)]
    for _ticker, grp in groups:
        grp = grp.sort_values("date") if "date" in grp.columns else grp.reset_index(drop=True)
        grp = add_ml_features(grp)
        grp = add_target(grp, horizon=horizon, threshold=threshold)
        grp = grp.iloc[:-horizon]
        parts.append(grp)

    if not parts:
        return pd.DataFrame()

    combined = pd.concat(parts, ignore_index=True)
    combined = combined.dropna(subset=FEATURE_COLUMNS + ["target"])
    return combined


def latest_feature_row(df: pd.DataFrame) -> pd.Series | None:
    """Last row's model features from OHLCV history (for /predict)."""
    enriched = add_ml_features(normalize_ohlcv(df))
    if enriched.empty:
        return None
    row = enriched.iloc[-1]
    if row[FEATURE_COLUMNS].isna().any():
        return None
    return row[FEATURE_COLUMNS]


def display_technicals(df: pd.DataFrame) -> dict:
    """Human-readable RSI/MACD/close for API responses."""
    enriched = add_ml_features(normalize_ohlcv(df))
    if enriched.empty:
        return {}
    latest = enriched.iloc[-1]
    return {
        "rsi": round(float(latest["rsi"]), 2),
        "macd": round(float(latest["macd"]), 4),
        "close": round(float(latest["close"]), 2),
    }
