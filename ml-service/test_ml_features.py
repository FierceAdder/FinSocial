"""Feature row extraction for /predict."""
import numpy as np
import pandas as pd

from ml_features import latest_feature_row, prepare_ohlcv_history


def _synthetic_ohlcv(n: int = 120) -> pd.DataFrame:
    dates = pd.date_range("2024-01-01", periods=n, freq="B")
    close = 1000 + np.cumsum(np.random.default_rng(0).normal(0, 5, n))
    return pd.DataFrame(
        {
            "date": dates,
            "open": close - 2,
            "high": close + 5,
            "low": close - 5,
            "close": close,
            "volume": np.full(n, 1_000_000.0),
        }
    )


def test_latest_feature_row_with_clean_history():
    row = latest_feature_row(_synthetic_ohlcv())
    assert row is not None
    assert row.isna().sum() == 0


def test_prepare_ohlcv_drops_invalid_last_bar():
    df = _synthetic_ohlcv()
    # Corrupt last bar: low > close (bad import)
    df.loc[df.index[-1], ["close", "high", "low"]] = [1335.9, 1338.0, 1339.0]
    row = latest_feature_row(df)
    assert row is not None


def test_prepare_ohlcv_dedupes_dates():
    df = _synthetic_ohlcv(80)
    dup = df.iloc[-1:].copy()
    dup["date"] = df["date"].iloc[-1]
    dup["close"] = np.nan
    combined = pd.concat([df, dup], ignore_index=True)
    cleaned = prepare_ohlcv_history(combined)
    assert len(cleaned) == len(df)
