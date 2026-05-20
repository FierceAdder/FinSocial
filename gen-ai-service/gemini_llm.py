"""
Gemini generation with ordered model fallback (primary → fallbacks).
"""
from __future__ import annotations

import json
import logging
import os
from typing import Any, Optional

logger = logging.getLogger(__name__)

GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3-flash-preview")
GEMINI_MODEL_FALLBACKS_RAW = os.environ.get(
    "GEMINI_MODEL_FALLBACKS", "gemini-3.1-flash-lite"
)

try:
    from google.genai import types as genai_types

    GEMINI_GEN_CONFIG = genai_types.GenerateContentConfig(temperature=0.4)
except Exception:
    GEMINI_GEN_CONFIG = None


def parse_fallback_models(raw: str) -> list[str]:
    return [p.strip() for p in (raw or "").split(",") if p.strip()]


def gemini_model_chain() -> list[str]:
    """Primary model first, then fallbacks; deduped."""
    primary = (GEMINI_MODEL or "").strip()
    fallbacks = parse_fallback_models(GEMINI_MODEL_FALLBACKS_RAW)
    chain: list[str] = []
    seen: set[str] = set()
    for model in [primary, *fallbacks]:
        if model and model not in seen:
            seen.add(model)
            chain.append(model)
    return chain


def source_for_model(model_used: str, chain: list[str] | None = None) -> str:
    chain = chain or gemini_model_chain()
    if not chain or model_used == chain[0]:
        return "gemini"
    return "gemini-fallback"


def _generate_kwargs(contents: str, model: str) -> dict[str, Any]:
    kw: dict[str, Any] = {"model": model, "contents": contents}
    if GEMINI_GEN_CONFIG is not None:
        kw["config"] = GEMINI_GEN_CONFIG
    return kw


def response_text(response) -> str:
    if response is None:
        return ""
    t = getattr(response, "text", None)
    if t and str(t).strip():
        return str(t).strip()
    try:
        candidates = getattr(response, "candidates", None) or []
        if candidates:
            content = getattr(candidates[0], "content", None)
            parts = getattr(content, "parts", None) if content else None
            if parts:
                blobs = []
                for p in parts:
                    txt = getattr(p, "text", None)
                    if txt:
                        blobs.append(txt)
                merged = "".join(blobs).strip()
                if merged:
                    return merged
    except Exception:
        pass
    fb = getattr(response, "prompt_feedback", None)
    if fb is not None:
        logger.warning("Gemini response had no extractable text; prompt_feedback=%s", fb)
    return ""


def _error_status_code(err: Exception) -> Optional[int]:
    for attr in ("status_code", "code"):
        val = getattr(err, attr, None)
        if isinstance(val, int):
            return val
    return None


def is_retryable(err: Exception) -> bool:
    """Whether to try the next model in the chain."""
    code = _error_status_code(err)
    if code in (401, 403):
        return False
    if code in (404, 429, 500, 502, 503, 504):
        return True
    msg = str(err).lower()
    if any(x in msg for x in ("401", "403", "permission denied", "invalid api key", "api key")):
        return False
    if any(
        x in msg
        for x in ("quota", "rate limit", "unavailable", "timeout", "deadline", "404", "not found")
    ):
        return True
    return True


def generate_text(client, prompt: str) -> tuple[Optional[str], Optional[str]]:
    """
    Try each model in chain. Returns (text, model_id) or (None, None).
    """
    if not client:
        return None, None

    chain = gemini_model_chain()
    for model in chain:
        try:
            resp = client.models.generate_content(**_generate_kwargs(prompt, model))
            text = response_text(resp)
            if text:
                logger.info("Gemini success model=%s", model)
                return text, model
            logger.warning("Gemini empty text model=%s; trying next", model)
        except Exception as e:
            if not is_retryable(e):
                logger.error("Gemini non-retryable error model=%s: %s", model, e)
                raise
            logger.warning(
                "Gemini attempt failed model=%s reason=%s; trying next",
                model,
                e,
            )

    return None, None


def generate_stream_sse_lines(client, prompt: str) -> tuple[list[str], Optional[str]]:
    """
    Build SSE lines (data: ... + [DONE]) using stream or sync fallback per model.
    Returns (lines, model_id).
    """
    if not client:
        return [], None

    chain = gemini_model_chain()
    for model in chain:
        try:
            parts: list[str] = []
            stream_fn = getattr(client.models, "generate_content_stream", None)
            if stream_fn:
                for chunk in stream_fn(**_generate_kwargs(prompt, model)):
                    piece = response_text(chunk)
                    if piece:
                        parts.append(f"data: {json.dumps({'delta': piece})}\n\n")
            if parts:
                parts.append("data: [DONE]\n\n")
                logger.info("Gemini stream success model=%s", model)
                return parts, model

            resp = client.models.generate_content(**_generate_kwargs(prompt, model))
            body = response_text(resp)
            if body:
                parts = [
                    f"data: {json.dumps({'delta': body})}\n\n",
                    "data: [DONE]\n\n",
                ]
                logger.info("Gemini stream-via-sync success model=%s", model)
                return parts, model

            logger.warning("Gemini stream empty model=%s; trying next", model)
        except Exception as e:
            if not is_retryable(e):
                logger.error("Gemini stream non-retryable model=%s: %s", model, e)
                raise
            logger.warning(
                "Gemini stream failed model=%s reason=%s; trying next",
                model,
                e,
            )

    return [], None


def gemini_result_payload(text: str, model: str, reply_key: str = "reply") -> dict[str, Any]:
    """Standard JSON fields for a successful Gemini generation."""
    chain = gemini_model_chain()
    return {
        reply_key: text,
        "source": source_for_model(model, chain),
        "gemini_model": model,
    }
