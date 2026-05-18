# FinSocial — Community-Driven Virtual Brokerage

FinSocial is a production-lite, demo-ready social stock trading platform for the Indian market (NSE/BSE). It combines virtual trading, community intelligence, AI-powered signals, and real-time collaboration.

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite, Tailwind CSS 4, Recharts, Socket.IO Client, Zustand |
| Backend | Node.js 20, Express 5, Prisma 5, PostgreSQL (pgvector), Bull/Redis, Socket.IO |
| ML Service | Flask, XGBoost, PyPortfolioOpt, FinBERT (Transformers) |
| Gen-AI Service | FastAPI, LangChain, Google Gemini 1.5 Flash, sentence-transformers (RAG) |
| Infrastructure | Docker Compose, Nginx, GitHub Actions CI/CD |
| Deployment | Vercel (client), Render (API + ML + AI), managed Postgres + Redis |

## Quick Start (Local)

### 1. Prerequisites
- Docker + Docker Compose
- Node.js 20+ (for local dev)

### 2. Setup environment files

```bash
cp server/.env.example server/.env
cp ml-service/.env.example ml-service/.env
cp gen-ai-service/.env.example gen-ai-service/.env
cp client/.env.example client/.env
```

Edit each `.env` file:
- `server/.env`: Set `JWT_SECRET` (64+ char random string) and external API keys
- `gen-ai-service/.env`: Set `GEMINI_API_KEY`
- `server/.env`: Set `NEWSAPI_KEY`, `SENDGRID_API_KEY` (optional but recommended)

### 3. Start everything

```bash
docker compose up --build
```

Wait ~2 minutes for all services to initialize (ML service downloads models).

### 4. Seed the database

```bash
docker exec finsocial_core_api npm run seed
```

This creates:
- 8 demo users (2 verified mentors)
- 25 NSE stocks with sector/industry data
- 5 Tribe channels with starter messages
- 8 Q&A questions with expert answers
- Initial ML signals and leaderboard data

### 5. Access the app

| Service | URL |
|---------|-----|
| Frontend | http://localhost:9999 |
| API | http://localhost:9999/api |
| ML Health | http://localhost:9999/ml/health |
| AI Health | http://localhost:9999/ai/health |

**Demo login:** `vikram@demo.com` / `Demo@1234` (Verified Trader)

## Import Historical Stock Data

For charts and Time Machine feature, import 2 years of OHLCV data:

```bash
docker exec finsocial_core_api npm run import-history
```

This fetches data via Yahoo Finance for all 25 seeded stocks (~5 minutes).

## Features

### Core Platform
- **Virtual Portfolio** — ₹10L starting balance, BUY/SELL with real NSE prices
- **Signal Board** — XGBoost ML predictions with RSI/MACD/BB indicators, refreshed every 15 min
- **Community Feed** — Real-time anonymized trade activity stream
- **Sentiment Meter** — Community vote (Bullish/Neutral/Bearish) per stock
- **Tribe Rooms** — Real-time Discord-style chat with 5 curated channels
- **Q&A Forum** — Stack Overflow-style with voting, accepted answers, AI Suggest
- **Leaderboard** — Weekly/Monthly/All-time rankings from real portfolio performance

### Creative Features
- **Time Machine** — Replay any historical date, calculate how your trade would have performed
- **Copy Trading** — Copy any community member's trade with one click
- **Trade Reasoning Tags** — Add a "why" to each trade; aggregated per stock
- **Tribe Polls** — `/poll Buy/Sell/Hold RELIANCE?` in any Tribe room, live results via Socket.IO
- **Mentor Match** — Connect beginners with verified traders
- **FinBot Chatbot** — Floating AI assistant powered by Gemini + RAG over community knowledge

### Technical Highlights
- pgvector RAG for FinBot (sentence-transformers → 384-dim embeddings)
- FinBERT sentiment analysis on news headlines
- Bull job queues: signals (15min), leaderboard (hourly), news (30min), notifications
- Socket.IO rooms: per-user notifications, tribe channels, real-time feed
- Fail-fast env loader: app refuses to start with missing secrets
- PWA manifest + service worker for offline portfolio view

## Architecture

```
Browser → Nginx :9999
  /api/      → core-api (Express)   ← Postgres + Redis
  /socket.io → core-api
  /ml/       → ml-service (Flask)   ← XGBoost + FinBERT
  /ai/       → gen-ai-service (FastAPI) ← Gemini + pgvector
  /          → React SPA (static)
```

## Testing

```bash
# Server
cd server && npm test

# Client
cd client && npm test

# ML service
cd ml-service && pytest test_health.py -v

# Gen-AI service
cd gen-ai-service && pytest test_health.py -v
```

## Deployment

### Render (API + ML + AI)

1. Create 3 Web Services on Render pointing to this repo
2. Set build/start commands:
   - **core-api**: `cd server && npm install && npx prisma generate` / `cd server && sh entrypoint.sh`
   - **ml-service**: `cd ml-service && pip install -r requirements.txt` / `cd ml-service && python app.py`
   - **gen-ai-service**: `cd gen-ai-service && pip install -r requirements.txt` / `cd gen-ai-service && python app.py`
3. Set required environment variables (see `.env.example` files)
4. Add Render Postgres and Redis add-ons

### Vercel (Client)

```bash
cd client && npm run build
npx vercel --prod
```

### GitHub Actions Secrets

| Secret | Description |
|--------|-------------|
| `VERCEL_TOKEN` | Vercel personal access token |
| `VERCEL_ORG_ID` | Vercel organization ID |
| `VERCEL_PROJECT_ID` | Vercel project ID |
| `RENDER_API_KEY` | Render API key |
| `RENDER_SERVICE_ID_API` | Render service ID for core-api |
| `VITE_SENTRY_DSN` | Sentry DSN for frontend |

## Environment Variables

See individual `.env.example` files in each service directory.

Required:
- `server/.env`: `JWT_SECRET`, `DATABASE_URL`
- `gen-ai-service/.env`: `GEMINI_API_KEY` (for real AI; fallback works without it)

Optional but recommended:
- `NEWSAPI_KEY` — for live news feed
- `SENDGRID_API_KEY` — for email notifications

