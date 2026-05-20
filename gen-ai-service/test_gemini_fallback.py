"""Tests for Gemini model fallback chain (no live API)."""
import importlib
import os
from unittest.mock import MagicMock

import pytest

os.environ.setdefault("GEMINI_API_KEY", "")
os.environ.setdefault("DATABASE_URL", "")


@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from app import app

    return TestClient(app)


def test_gemini_model_chain_default(monkeypatch):
    monkeypatch.delenv("GEMINI_MODEL", raising=False)
    monkeypatch.delenv("GEMINI_MODEL_FALLBACKS", raising=False)

    import gemini_llm

    importlib.reload(gemini_llm)

    chain = gemini_llm.gemini_model_chain()
    assert chain == ["gemini-3-flash-preview", "gemini-3.1-flash-lite"]


def test_gemini_model_chain_custom(monkeypatch):
    monkeypatch.setenv("GEMINI_MODEL", "gemini-3-flash-preview")
    monkeypatch.setenv("GEMINI_MODEL_FALLBACKS", "gemini-3.1-flash-lite,gemini-3-flash-preview")

    import gemini_llm

    importlib.reload(gemini_llm)

    chain = gemini_llm.gemini_model_chain()
    assert chain == ["gemini-3-flash-preview", "gemini-3.1-flash-lite"]


def test_source_for_model():
    import gemini_llm

    chain = ["gemini-3-flash-preview", "gemini-3.1-flash-lite"]
    assert gemini_llm.source_for_model("gemini-3-flash-preview", chain) == "gemini"
    assert gemini_llm.source_for_model("gemini-3.1-flash-lite", chain) == "gemini-fallback"


def test_generate_text_fallback_on_empty_then_success(monkeypatch):
    monkeypatch.setenv("GEMINI_MODEL", "primary-model")
    monkeypatch.setenv("GEMINI_MODEL_FALLBACKS", "fallback-model")

    import gemini_llm

    importlib.reload(gemini_llm)

    client = MagicMock()
    empty_resp = MagicMock()
    empty_resp.text = ""
    good_resp = MagicMock()
    good_resp.text = "Hello from fallback"

    client.models.generate_content.side_effect = [empty_resp, good_resp]

    text, model = gemini_llm.generate_text(client, "test prompt")
    assert text == "Hello from fallback"
    assert model == "fallback-model"
    assert client.models.generate_content.call_count == 2


def test_generate_text_non_retryable_raises(monkeypatch):
    monkeypatch.setenv("GEMINI_MODEL", "primary-model")
    monkeypatch.setenv("GEMINI_MODEL_FALLBACKS", "")

    import gemini_llm

    importlib.reload(gemini_llm)

    client = MagicMock()
    err = Exception("permission denied")
    err.status_code = 403
    client.models.generate_content.side_effect = err

    with pytest.raises(Exception):
        gemini_llm.generate_text(client, "test")


def test_health_includes_model_chain(client):
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert "gemini_model_chain" in data
    assert isinstance(data["gemini_model_chain"], list)
    assert len(data["gemini_model_chain"]) >= 1
