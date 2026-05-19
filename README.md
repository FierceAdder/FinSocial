# FinSocial — Community-Driven Virtual Brokerage

FinSocial is a demo-ready social paper-trading platform for the Indian market (NSE/BSE). Users trade with virtual money, follow ML signals, chat in Tribe rooms, ask questions on the forum, and get help from FinBot — with real-time updates over WebSockets.

## Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 19, Vite, Tailwind CSS 4, Recharts, Socket.IO client, Zustand |
| **Core API** | Node.js **22+**, Express 5, Prisma 5, PostgreSQL + pgvector, Bull/Redis, Socket.IO |
| **ML service** | Flask, XGBoost (v2 features), optional FinBERT on local Docker |
| **Gen-AI service** | FastAPI, Google Gemini, sentence-transformers (RAG over pgvector) |
| **Local infra** | Docker Compose, Nginx reverse proxy |
| **Production** | Vercel (SPA), Render (API + ML + Gen-AI), managed Postgres + Redis |

## Repository layout

```
├── client/           React SPA (Vercel)
├── server/           Core API, Prisma, Bull workers, Socket.IO
├── ml-service/       XGBoost inference + training
├── gen-ai-service/   FinBot, RAG, news summaries
├── nginx/            Local gateway (:9999)
├── docs/             ER diagram & user flows
└── docker-compose.yml
```

## Quick start (Docker)

### Prerequisites

- Docker and Docker Compose
- Node.js **22+** (only if you run services outside Docker)

### 1. Environment files

```bash
cp server/.env.example server/.env
cp ml-service/.env.example ml-service/.env
cp gen-ai-service/.env.example gen-ai-service/.env
cp client/.env.example client/.env
```

Minimum for local Docker:

| File | Required |
|------|----------|
| `server/.env` | `JWT_SECRET` (64+ random chars), `DATABASE_URL` is set by Compose |
| `gen-ai-service/.env` | `GEMINI_API_KEY` for real FinBot replies (keyword fallback without it) |

Optional: `NEWSAPI_KEY`, `SENDGRID_API_KEY`, `ALPHAVANTAGE_API_KEY` on the server.

### 2. Start the stack

```bash
docker compose up --build
```

First boot can take a few minutes (ML image may install NLP extras via `INSTALL_NLP=true`).

### 3. Seed the database

```bash
docker exec finsocial_core_api npm run seed
```

Creates demo users, ~25 NSE stocks, Tribe channels, forum Q&A, sample signals, and leaderboard snapshots.

**Demo login:** `vikram@demo.com` / `Demo@1234` (Verified Trader)

### 4. Import real price history (recommended)

Charts, Time Machine, and ML training need Yahoo OHLCV — not the synthetic prices in seed metadata alone:

```bash
docker exec finsocial_core_api npm run import-history
```

Takes a few minutes for all tickers.

### 5. Open the app

| Service | URL |
|---------|-----|
| **App (via Nginx)** | http://localhost:9999 |
| **API** | http://localhost:9999/api |
| **ML health** | http://localhost:9999/ml/health |
| **Gen-AI health** | http://localhost:9999/ai/health |

---

## Features

### Trading & portfolio

- **Virtual portfolio** — ₹10L starting balance; BUY/SELL at live or cached NSE prices (Yahoo Finance / optional Alpha Vantage).
- **Watchlist** — Server-backed with localStorage fallback.
- **Copy trading** — Mirror community trades from the feed.

### Dashboard

- **Configurable chart** — Pick any listed stock; choice is saved per user in `localStorage` and survives reload.
- **Signal board** — Random sample of 5 latest ML signals; **Generate signals** runs `/predict` for all stocks on demand.
- **Active signals stat** — Counts **all** stocks’ latest signals (BUY / SELL / HOLD), not only the 5 on the board.
- **Trending strip** — Top movers; **market news** with manual refresh.
- **Community feed & leaderboard** — Weekly / monthly / all-time.

### ML signals

- **XGBoost v2** — Scale-free features, 5-day forward-return label, time-based train/test split (`ml_features.py`, `train_model.py`).
- **Auto-refresh** — Bull cron every **5 minutes** (requires Redis + running workers).
- **Manual refresh** — `POST /api/feed/signals/refresh` from the dashboard button.
- **Retrain** — Not automatic; run `train_model.py` after `import-history` and redeploy ml-service.

### Social & AI

- **Tribe** — Real-time channels; polls (`/poll Buy/Sell/Hold TICKER?`); FinBot in-channel.
- **Forum** — Voting, accepted answers, AI-suggested replies.
- **FinBot** — Gemini + RAG; server-side keyword fallback if Gen-AI is unreachable.
- **Sentiment** — Per-stock community votes.
- **Time Machine** — Replay a historical date and estimate P&amp;L.

### Background jobs (core-api)

| Job | Schedule |
|-----|----------|
| ML signal refresh | Every **5** minutes |
| Leaderboard snapshot | Hourly |
| News fetch | Every 30 minutes (+ once after startup) |
| Daily AI stock pick | 9:00 AM IST |

---

## Architecture

### Local (Docker Compose)

```
Browser → Nginx :9999
  /api/       → core-api (Express)     ← Postgres, Redis
  /socket.io/ → core-api
  /ml/        → ml-service (Flask)
  /ai/        → gen-ai-service (FastAPI)
  /           → React static build
```

### Production (split hosting)

```
Browser → Vercel (SPA)
            ├─ /api/*  → Render core-api (HTTP rewrite)
            └─ Socket.IO → Render core-api directly (VITE_BACKEND_URL)

Render: core-api, ml-service, gen-ai-service
        Postgres + Redis add-ons
```

**Important:** Vercel cannot proxy WebSockets. Set `VITE_BACKEND_URL` on Vercel to your Render API origin (e.g. `https://your-api.onrender.com`). See `client/.env.example`.

More detail: [docs/DATABASE_ER_AND_USER_FLOW.md](docs/DATABASE_ER_AND_USER_FLOW.md)

---

## Development without Docker

```bash
# Terminal 1 — Postgres + Redis (or use Compose for only those services)
docker compose up postgres redis

# Terminal 2 — API
cd server && npm ci && npx prisma db push && npm run dev

# Terminal 3 — ML
cd ml-service && pip install -r requirements.txt && python app.py

# Terminal 4 — Gen-AI
cd gen-ai-service && pip install -r requirements.txt && python app.py

# Terminal 5 — Client
cd client && npm ci && npm run dev
```

Point `client/.env` `VITE_DEV_BACKEND` at `http://localhost:5000` or the Nginx URL.

---

## Retrain XGBoost

Uses real `StockHistory` from Postgres. The committed `ml-service/models/xgboost_stock_model.pkl` is used on Render’s slim image (no train at build).

```bash
cd server
npm run seed
npm run import-history

cd ../ml-service
DATABASE_URL="postgresql://..." python3 train_model.py
```

Redeploy **ml-service**. Check `GET /health` → `model_version: 2`, `model_loaded: true`. Predictions should return `model_used: true`.

---

## Testing & CI

GitHub Actions on `main` / PRs: server Jest, client ESLint + Vitest, ML/Gen-AI health tests, optional Docker build.

```bash
cd server && npm test
cd client && npm run lint && npm test
cd ml-service && pytest test_health.py -v
cd gen-ai-service && pytest test_health.py -v
```

---

## Production deployment

### Render — core-api

- **Build:** `cd server && npm ci && npx prisma generate`
- **Start:** `cd server && sh entrypoint.sh` (`db push`, tribe channel bootstrap, then `node server.js`)
- **Add-ons:** Postgres, Redis

### Render — ml-service

- Uses `requirements-render.txt` and prebuilt `xgboost_stock_model.pkl` for **512MB** instances.
- Set `DISABLE_FINBERT=1` (default in slim Dockerfile). Use `INSTALL_NLP=true` only on larger instances or local Compose.
- Env: `DATABASE_URL`

### Render — gen-ai-service

- Env: `DATABASE_URL`, `GEMINI_API_KEY`, optional `GEMINI_MODEL`

### Vercel — client

- **Root directory:** `client` (project setting — not `client/client`).
- **Env:** `VITE_BACKEND_URL` = public Render API URL (for Socket.IO).
- `vercel.json` rewrites `/api/*` to Render; adjust the destination URL to match your service.

### Post-deploy checklist

1. Run **`npm run import-history`** against production DB (Render shell or one-off job).
2. Optionally **`python train_model.py`** on ml-service, then redeploy ml-service.
3. Set env vars below on each service.
4. Run **`npm run seed`** once if the DB is empty (not required on every deploy — `entrypoint.sh` does not seed).

### GitHub Actions secrets (optional CD)

| Secret | Purpose |
|--------|---------|
| `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | Deploy client |
| `RENDER_API_KEY`, `RENDER_SERVICE_ID_API` | Trigger API deploy |
| `VITE_SENTRY_DSN` | Frontend error reporting |

---

## Environment variables (production)

### core-api (`server/.env`)

| Variable | Required | Notes |
|----------|----------|--------|
| `DATABASE_URL` | Yes | Postgres connection string |
| `JWT_SECRET` | Yes | 64+ char random string |
| `REDIS_URL` | Yes | Bull queues + workers |
| `CORS_ORIGIN` | Yes | Vercel URL, or `*` (API reflects request origin) |
| `ML_SERVICE_URL` | Yes | Public Render ML URL |
| `GEN_AI_SERVICE_URL` | Yes | Public Render Gen-AI URL (not `localhost`); FinBot proxy |
| `NEWSAPI_KEY` | Recommended | Live news feed |

### gen-ai-service

| Variable | Required |
|----------|----------|
| `DATABASE_URL` | Yes |
| `GEMINI_API_KEY` | Yes for real AI |

### ml-service

| Variable | Required |
|----------|----------|
| `DATABASE_URL` | For DB-backed features / training |
| `DISABLE_FINBERT` | `1` on 512MB Render |

### Vercel client

| Variable | Required |
|----------|----------|
| `VITE_BACKEND_URL` | Yes — Render API origin for WebSockets |

See each service’s `.env.example` for the full list.

---

## Troubleshooting

| Symptom | Likely fix |
|---------|------------|
| Login 500 with `CORS_ORIGIN=*` | Deploy latest API (`corsOrigins` reflects browser origin). |
| Tribe stuck on “Loading” | Ensure `entrypoint.sh` ran; channels auto-created on startup. |
| FinBot generic / 503 | Set `GEN_AI_SERVICE_URL` on API and `GEMINI_API_KEY` on gen-ai. |
| Signals never update | Redis + core-api workers running; `ML_SERVICE_URL` reachable. |
| Socket.IO fails on Vercel | Set `VITE_BACKEND_URL` to Render API; do not rely on `/socket.io` rewrite. |
| Charts flat / Time Machine empty | Run `npm run import-history`. |
| ML always heuristic | Retrain model; confirm `/ml/health` shows v2 model loaded. |

---

## License

ISC (per package manifests). Built as a hackathon / portfolio demo — not financial advice.
