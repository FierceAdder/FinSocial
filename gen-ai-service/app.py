"""
FinSocial Gen-AI Service
FastAPI + Google Gen AI SDK (google-genai) + pgvector RAG
"""
import os
import asyncio
import logging
from typing import Optional
from datetime import datetime
from contextlib import asynccontextmanager

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import json

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3-flash-preview")
DATABASE_URL = os.environ.get("DATABASE_URL", "")
# Explicit key (Docker / local .env). SDK also recognizes GOOGLE_API_KEY in some setups.
GEMINI_API_KEY = (
    (os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY") or "").strip()
)

try:
    from google.genai import types as genai_types

    GEMINI_GEN_CONFIG = genai_types.GenerateContentConfig(temperature=0.4)
except Exception:
    GEMINI_GEN_CONFIG = None

# ── Embedding model (sentence-transformers, 384d) ──────────────────────────────
embedder = None
try:
    from sentence_transformers import SentenceTransformer
    embedder = SentenceTransformer("all-MiniLM-L6-v2")
    logger.info("Sentence transformer loaded")
except Exception as e:
    logger.warning("Could not load sentence-transformers: %s", e)

# ── pgvector store ─────────────────────────────────────────────────────────────
vector_store = None
if DATABASE_URL and embedder:
    try:
        from langchain_postgres import PGVector
        from langchain_community.embeddings import HuggingFaceEmbeddings

        lc_embedder = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
        vector_store = PGVector(
            embeddings=lc_embedder,
            collection_name="documents",
            connection=DATABASE_URL,
            use_jsonb=True,
        )
        logger.info("pgvector store connected")
    except Exception as e:
        logger.warning("pgvector store unavailable: %s", e)

# ── LLM: google-genai Client (API key from GEMINI_API_KEY) ───────────────────
gemini_client = None


def _generate_kwargs(contents: str):
    kw = {"model": GEMINI_MODEL, "contents": contents}
    if GEMINI_GEN_CONFIG is not None:
        kw["config"] = GEMINI_GEN_CONFIG
    return kw


def _response_text(response) -> str:
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


@asynccontextmanager
async def lifespan(app: FastAPI):
    global gemini_client
    gemini_client = None
    if GEMINI_API_KEY:
        try:
            from google import genai

            gemini_client = genai.Client(api_key=GEMINI_API_KEY)
            logger.info("Gemini client initialized (model=%s)", GEMINI_MODEL)
        except Exception as e:
            logger.warning("Gemini client failed to initialize: %s", e)
    else:
        logger.warning(
            "No GEMINI_API_KEY or GOOGLE_API_KEY — /chat and related routes will use canned fallbacks. "
            "Add GEMINI_API_KEY to gen-ai-service/.env for live Gemini."
        )
    yield


app = FastAPI(title="FinSocial Gen-AI Service", lifespan=lifespan)


def get_context(query: str, k: int = 5) -> str:
    """Retrieve top-k relevant documents from pgvector."""
    if vector_store:
        try:
            docs = vector_store.similarity_search(query, k=k)
            return "\n\n".join([d.page_content for d in docs])
        except Exception as e:
            logger.warning("Vector search failed: %s", e)
    return ""


# ── Request schemas ────────────────────────────────────────────────────────────

class IngestRequest(BaseModel):
    content: str
    source: str = "forum"
    sourceId: Optional[str] = None
    ticker: Optional[str] = None
    tickerTags: list[str] = []


class ChatRequest(BaseModel):
    message: str
    history: list = []
    stream: bool = False


class SuggestAnswerRequest(BaseModel):
    questionTitle: str
    questionBody: str
    tags: list[str] = []


class SummarizeNewsRequest(BaseModel):
    title: str
    description: Optional[str] = None
    content: Optional[str] = None
    url: Optional[str] = None


class TribeBotRequest(BaseModel):
    message: str
    channelName: str = "general"
    history: list = []


# ── Endpoints ──────────────────────────────────────────────────────────────────

@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": "gen-ai-service",
        "embedder_loaded": embedder is not None,
        "vector_store_ready": vector_store is not None,
        "llm_ready": gemini_client is not None,
        "gemini_key_configured": bool(GEMINI_API_KEY),
        "gemini_model": GEMINI_MODEL,
    }


@app.post("/ingest")
async def ingest(req: IngestRequest):
    """Embed a document and store in pgvector for RAG retrieval."""
    if not vector_store:
        raise HTTPException(status_code=503, detail="Vector store not available")

    try:
        from langchain_core.documents import Document
        doc = Document(
            page_content=req.content,
            metadata={
                "source": req.source,
                "sourceId": req.sourceId or "",
                "ticker": req.ticker or "",
                "tickerTags": json.dumps(req.tickerTags),
                "createdAt": datetime.utcnow().isoformat(),
            },
        )
        vector_store.add_documents([doc])
        return {"success": True}
    except Exception as e:
        logger.error("Ingest failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/chat")
async def chat(req: ChatRequest):
    """Main FinBot chat endpoint. Streams if req.stream=True."""
    context = get_context(req.message)

    system_prompt = """You are FinBot, an expert AI assistant for FinSocial — a community-driven virtual brokerage platform focused on Indian stock markets (NSE/BSE).

You help users with:
- Stock analysis (fundamental & technical)
- Portfolio management and optimization
- Understanding market concepts (candlesticks, RSI, MACD, Bollinger Bands, P/E, etc.)
- Community signals interpretation
- Indian market specifics (SEBI, NSE, BSE, Nifty, Sensex)

Rules:
- Be concise but educational
- Always mention that trades are virtual/simulated
- Never give real financial advice; always clarify these are educational insights
- Use ₹ for Indian Rupees
- Reference specific FinSocial features (Signal Board, Tribe Rooms, etc.) when relevant"""

    if context:
        system_prompt += f"\n\n## Relevant context from community:\n{context}"

    history_text = ""
    for h in req.history[-6:]:  # Keep last 3 turns
        role = h.get("role", "user")
        content = h.get("content", "")
        history_text += f"\n{role.capitalize()}: {content}"

    full_prompt = f"{system_prompt}\n\nConversation:{history_text}\n\nUser: {req.message}\nFinBot:"

    if gemini_client:
        try:
            if req.stream:
                def _stream_chunks():
                    parts = []
                    stream_fn = getattr(gemini_client.models, "generate_content_stream", None)
                    if stream_fn:
                        for chunk in stream_fn(**_generate_kwargs(full_prompt)):
                            piece = _response_text(chunk)
                            if piece:
                                parts.append(f"data: {json.dumps({'delta': piece})}\n\n")
                    else:
                        resp = gemini_client.models.generate_content(**_generate_kwargs(full_prompt))
                        body = _response_text(resp)
                        if body:
                            parts.append(f"data: {json.dumps({'delta': body})}\n\n")
                    parts.append("data: [DONE]\n\n")
                    return parts

                chunks = await asyncio.to_thread(_stream_chunks)
                return StreamingResponse(iter(chunks), media_type="text/event-stream")

            def _once():
                return gemini_client.models.generate_content(**_generate_kwargs(full_prompt))

            response = await asyncio.to_thread(_once)
            reply_text = _response_text(response)
            if reply_text:
                return {"reply": reply_text, "source": "gemini"}
            logger.warning(
                "Gemini returned empty text for /chat (model=%s). Check API key, quota, model id, or blocked content.",
                GEMINI_MODEL,
            )
        except Exception as e:
            logger.error("Gemini chat error: %s", e)

    # Keyword fallback when LLM is unavailable
    msg = req.message.lower()
    if any(w in msg for w in ["portfolio", "optimize", "rebalance"]):
        reply = "For portfolio optimization, I recommend reviewing your sector allocation. Head to the Portfolio page and click 'Optimize' to get AI-powered rebalancing suggestions based on Modern Portfolio Theory."
    elif any(w in msg for w in ["reliance", "reli"]):
        reply = "Reliance Industries (RELIANCE.NS) is in the Energy sector. Check the Signal Board on the Stocks page for the latest ML-generated BUY/SELL signal with technical reasoning."
    elif any(w in msg for w in ["rsi", "macd", "bollinger", "sma"]):
        reply = "RSI (14-period) measures momentum: below 30 = oversold (buy signal), above 70 = overbought (sell signal). MACD tracks trend strength. All these indicators are computed live on the Stocks page!"
    elif any(w in msg for w in ["beginner", "start", "new"]):
        reply = "Welcome to FinSocial! Start with the Beginner's Lounge Tribe Room to ask questions. Check the Signal Board for trade ideas, and begin with small quantities to understand the platform."
    else:
        reply = "I'm FinBot! I can help with stock analysis, portfolio questions, market concepts, or explain any FinSocial feature. What would you like to know?"

    return {"reply": reply, "source": "fallback"}


@app.post("/suggest-answer")
async def suggest_answer(req: SuggestAnswerRequest):
    """AI-powered answer suggestion for Q&A Forum."""
    context = get_context(f"{req.questionTitle} {req.questionBody}", k=5)

    prompt = f"""You are an expert Indian stock market educator helping answer a community question on FinSocial.

Question: {req.questionTitle}

Details: {req.questionBody}

Tags: {', '.join(req.tags) if req.tags else 'None'}

{("Relevant community context:" + context) if context else ""}

Provide a helpful, educational answer (3-5 sentences). Be specific, use examples where possible, and explain any jargon. Focus on practical, actionable insights for Indian markets."""

    if gemini_client:
        try:
            def _once():
                return gemini_client.models.generate_content(**_generate_kwargs(prompt))

            response = await asyncio.to_thread(_once)
            text = _response_text(response)
            if text:
                return {"suggestion": text}
            logger.warning("Empty suggestion from Gemini (model=%s)", GEMINI_MODEL)
        except Exception as e:
            logger.error("AI suggest error: %s", e)

    # Fallback
    return {
        "suggestion": f"Based on the question about {req.questionTitle[:50]}, here is a general perspective: Focus on understanding the fundamentals first, then look at technical signals for timing. The FinSocial Signal Board can provide additional context. Check the Beginner's Lounge Tribe Room for community perspectives on this topic."
    }


@app.post("/summarize-news")
async def summarize_news(req: SummarizeNewsRequest):
    """Summarize a news article and identify affected tickers."""
    text = f"{req.title}. {req.description or ''} {req.content or ''}"[:2000]

    prompt = f"""Summarize this financial news article in exactly 2 concise sentences for retail investors. Then list any NSE/BSE stock tickers affected (use NSE format like RELIANCE.NS). Return JSON only.

Article: {text}

Return format: {{"summary": "...", "tickers": ["TICKER.NS", ...]}}"""

    if gemini_client:
        try:
            def _once():
                return gemini_client.models.generate_content(**_generate_kwargs(prompt))

            response = await asyncio.to_thread(_once)
            content = _response_text(response).strip()
            if content:
                if content.startswith("{"):
                    data = json.loads(content)
                else:
                    import re
                    match = re.search(r'\{.*\}', content, re.DOTALL)
                    data = json.loads(match.group()) if match else {"summary": content, "tickers": []}
                return data
            logger.warning("Empty summarize response from Gemini (model=%s)", GEMINI_MODEL)
        except Exception as e:
            logger.error("News summarization error: %s", e)

    return {
        "summary": f"{req.title}. Market participants are monitoring this development for potential impact on related sectors.",
        "tickers": [],
    }


@app.post("/tribe-bot")
async def tribe_bot(req: TribeBotRequest):
    """FinBot response for @finbot mentions in Tribe rooms."""
    context = get_context(req.message, k=3)

    prompt = f"""You are FinBot in the FinSocial Tribe room '{req.channelName}'. A user mentioned you with: "{req.message}"

{("Context from knowledge base:" + chr(10) + context) if context else ""}

Respond briefly (2-3 sentences max) and helpfully. This is a live chat, so be conversational."""

    if gemini_client:
        try:
            def _once():
                return gemini_client.models.generate_content(**_generate_kwargs(prompt))

            response = await asyncio.to_thread(_once)
            rt = _response_text(response)
            if rt:
                return {"reply": rt}
            logger.warning("Empty tribe-bot reply from Gemini (model=%s)", GEMINI_MODEL)
        except Exception as e:
            logger.error("Tribe bot error: %s", e)

    return {
        "reply": f"Thanks for mentioning me in {req.channelName}! I can help with stock analysis, portfolio questions, and market concepts. What would you like to know?"
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5002, log_level="info")
