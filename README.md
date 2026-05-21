# FinSocial — Community-Driven Virtual Brokerage

FinSocial is a demo-ready social paper-trading platform for the Indian market (NSE/BSE). Users trade with virtual money, follow ML signals, chat in Tribe rooms, ask questions on the forum, and get help from FinBot — with real-time updates over WebSockets.

The **landing page** uses a scroll-driven product tour (Hub → Flow → Tools → Voices → FAQ → Start), a 3D candlestick hero scene, and a glass presentation deck with a curved timeline progress rail.

## Live demo


**Web app (Vercel)** | https://fin-social-eight.vercel.app


## Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 19, Vite, Tailwind CSS 4, **TradingView Lightweight Charts**, Recharts, React Three Fiber, Socket.IO client, Zustand |
| **Core API** | Node.js **22+**, Express 5, Prisma 5, PostgreSQL + pgvector, Bull/Redis, Socket.IO |
| **ML service** | Flask, XGBoost **v5** (3-class, 19 features, ±1.5% labels), ADX + Stochastic + ATR feature set |
| **Gen-AI service** | FastAPI, Google Gemini, sentence-transformers (RAG over pgvector) |
| **Local infra** | Docker Compose, Nginx reverse proxy |
| **Production** | Vercel (SPA), Render (API + ML + Gen-AI), managed Postgres + Redis |

## Repository layout

```
├── client/           React SPA (Vercel) — landing, dashboard, Tribe, forum, charts
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

Optional: `NEWSAPI_KEY`, `SENDGRID_API_KEY`, `ALPHAVANTAGE_API_KEY` on the server (enables live quotes + chart OHLC from Alpha Vantage when set; Yahoo/DB fallback otherwise).

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

Charts, Hindsight, and ML training need Yahoo OHLCV — not the synthetic prices in seed metadata alone:

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

### Landing & onboarding

- **Hero** — 3D candlestick scene with parallax; stats marquee; scroll hint on the first viewport.
- **Presentation deck** — Six pinned slides (Hub, Flow, Tools, Voices, FAQ, Start) in one explore panel: left timeline with curved progress, right glass detail card.
- **Wheel-driven tour** — Scroll down from Trust into the deck and through slides; scroll up to reverse; exit at Hub (hero) or Start (footer).
- **Trust strip** — Social proof pills before the product tour.

### Trading & portfolio

- **Virtual portfolio** — ₹10L starting balance; BUY/SELL at live or cached NSE prices (Yahoo Finance / optional Alpha Vantage).
- **Watchlist** — Server-backed with localStorage fallback.
- **Copy trading** — Mirror community trades from the feed.

### Dashboard

- **Market chart** — [TradingView Lightweight Charts](https://www.tradingview.com/lightweight-charts/) (`lightweight-charts`) with type switcher (candles, bars, line, area) and volume histogram; OHLC from Alpha Vantage when `ALPHAVANTAGE_API_KEY` is set (Yahoo/DB fallback). **1D** range polls every ~90s for the active ticker.
- **Configurable symbol** — Pick any listed stock; choice is saved per user in `localStorage` and survives reload.
- **Chart requests** — Dashboard chart fetches use `skipQuote=1` so reloads do not hammer live quote APIs.
- **Signal board** — Random sample of 5 latest ML signals; **Generate signals** runs `/predict` for all stocks on demand.
- **Active signals stat** — Counts **all** stocks’ latest signals (BUY / SELL / HOLD), not only the 5 on the board.
- **Signal refresh** — One latest `Signal` row per stock (`deleteMany` then `create`); Socket.IO emits a single debounced `signals:refreshed` event (not per-stock storms).
- **Trending strip** — Top movers; **market news** with manual refresh.
- **Community feed & leaderboard** — Weekly / monthly / all-time; leaderboard rows link to user profiles (`userId`).

### Client caching (stale-while-revalidate)

- In-memory cache (~3 min TTL, per user) in `client/src/utils/appCache.js` for **Home**, **Stocks**, **Portfolio**, **Forum**, **Tribe**, and **Hindsight**.
- Revisiting a page shows the last payload immediately while refreshing in the background.
- Chart OHLC is shared per ticker across Home, Stocks, and Hindsight.
- Cache clears on **logout**. See [client/README.md](client/README.md).

### Auth & navigation

- **Landing** (`/`) — Marketing site; unauthenticated users are sent here (not `/auth`) when opening protected routes.
- **Sign-in / sign-up** — Show/hide password toggle; wrong credentials stay on the form (401 does not trigger a global logout redirect).
- **Logout** — Clears session and returns to `/`.
- **Deep links** — `/app/stocks?ticker=RELIANCE.NS` opens stock detail; profile holdings use the full API ticker; leaderboard opens `/app/profile/:userId`.

### ML signals

- **XGBoost v5 — 3-class classifier (SELL / HOLD / BUY)** trained on 10 years of NSE OHLCV history across 25 tickers (`ml_features.py`, `train_model.py`).
- **19 scale-free features:** 1d/5d/10d/20d returns, lagged returns, ROC-10, volume ratio, 5d volume surge, RSI, Stochastic %K, MACD line/signal/histogram slope, ADX (trend strength), distance from SMA-20/50, Bollinger %B, BB width ratio, ATR ratio.
- **Label thresholds:** BUY = 5-day forward return > **+1.5%**, SELL < **−1.5%**, HOLD otherwise. Wider band produces purer labels vs the original ±1%.
- **Class-balanced training** via inverse-frequency sample weights — prevents majority-class collapse.
- **Inference:** `buy_prob`, `hold_prob`, `sell_prob` (softmax outputs) exposed in every `/predict` response and stored in the `Signal` table (`buyProb`, `holdProb`, `sellProb` columns).
- **UX bias:** A small configurable `ML_BUY_BIAS` (default `0.04`) nudges borderline 3-class decisions toward BUY; a confidence floor rejects sub-random BUYs (buy_prob < 0.333).
- **Legacy bundles:** If the loaded pickle is an older **binary** model (`num_class: 2`), inference uses BUY > 0.52 / SELL < 0.42 / else HOLD with verdict-specific confidence scaling.
- **Probability tooltip:** Hover any Signal badge in the Stocks table to see a live BUY / HOLD / SELL probability bar breakdown.
- **Auto-refresh:** Bull cron every **5 minutes** (requires Redis + running workers).
- **Manual refresh:** `POST /api/feed/signals/refresh` from the dashboard button.
- **Retrain:** Not automatic; run `train_model.py` after `import-history` and redeploy ml-service.

### Social & AI

- **Profiles** — View any user at `/app/profile/:userId`; follow/unfollow; public holdings (ticker + display name).
- **Leaderboard** — Weekly / monthly / all-time ranks; click a row to open that user’s profile.
- **Holdings → Stocks** — Click a holding on a profile to open `/app/stocks?ticker=…` for that symbol.
- **Tribe** — Real-time channels; polls (`/poll Buy/Sell/Hold TICKER?`); FinBot in-channel.
- **Forum** — Voting, accepted answers; shows an empty/error state on API failure (no mock fallback data).
- **FinBot** — Gemini + RAG; model chain (`gemini-3-flash-preview` → `gemini-3.1-flash-lite`); keyword fallback if all models fail.
- **Sentiment** — Per-stock community votes; blended into stored signal confidence (70% ML / 30% community).
- **Hindsight** — Replay a historical date and estimate P&amp;L.

### Background jobs (core-api)

| Job | Schedule |
|-----|----------|
| ML signal refresh | Every **5** minutes |
| Leaderboard snapshot | Hourly |
| News fetch | Every 30 minutes (+ once after startup) |
| Stock quote refresh | Every **5** minutes (rotating batch, AV/Yahoo) |
| Daily history upsert | Hourly (one symbol per run when AV key set) |
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

**Important:** Vercel cannot proxy WebSockets. Set `VITE_BACKEND_URL` on Vercel to `https://finsocial-core-api-latest.onrender.com` (or your Render API origin). See `client/.env.example`.

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

Redeploy **ml-service**. Check `GET /health` → `model_version: 5`, `model_loaded: true`. Predictions return `model_used: true` and include `buy_prob`, `hold_prob`, `sell_prob`.

> **Note:** After retraining, run `POST /api/feed/signals/refresh` to populate the new `buyProb`/`holdProb`/`sellProb` columns on the latest Signal rows before the UI will display probability tooltips.

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
- **Env:** `VITE_BACKEND_URL` = `https://finsocial-core-api-latest.onrender.com` (for Socket.IO).
- `vercel.json` rewrites `/api/*` to the same Render host.

### Post-deploy checklist

1. Run **`npm run import-history`** against production DB (Render shell or one-off job).
2. Optionally **`python train_model.py`** on ml-service, then redeploy ml-service.
3. Set env vars below on each service.
4. Run **`npm run seed`** once if the DB is empty (not required on every deploy — `entrypoint.sh` does not seed).

### GitHub Actions secrets (optional CD)

| Secret | Purpose |
|--------|---------|
| `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | Deploy client |
| `RENDER_API_KEY` | Render deploy hook (all backend services) |
| `RENDER_SERVICE_ID_API` | core-api service ID |
| `RENDER_SERVICE_ID_ML` | ml-service service ID |
| `RENDER_SERVICE_ID_GENAI` | gen-ai-service service ID |
| `VITE_SENTRY_DSN` | Frontend error reporting |

---

## Environment variables (production)

### core-api (`server/.env`)

| Variable | Required | Notes |
|----------|----------|--------|
| `DATABASE_URL` | Yes | Postgres connection string |
| `JWT_SECRET` | Yes | 64+ char random string |
| `REDIS_URL` | Yes | Bull queues + workers |
| `CORS_ORIGIN` | Yes | `https://fin-social-eight.vercel.app` (comma-separated if several) |
| `ML_SERVICE_URL` | Yes | Public Render ML URL |
| `GEN_AI_SERVICE_URL` | Yes | Public Render Gen-AI URL (not `localhost`); FinBot proxy |
| `NEWSAPI_KEY` | Recommended | Live news feed |

### gen-ai-service

| Variable | Required |
|----------|----------|
| `DATABASE_URL` | Yes |
| `GEMINI_API_KEY` | Yes for real AI |
| `GEMINI_MODEL` | Primary model (default `gemini-3-flash-preview`) |
| `GEMINI_MODEL_FALLBACKS` | Comma-separated backup (default `gemini-3.1-flash-lite`) |

### ml-service

| Variable | Required | Notes |
|----------|----------|-------|
| `DATABASE_URL` | Yes | For DB-backed feature engineering and training |
| `ML_BUY_BIAS` | No | Nudge bias added to `buy_prob` before argmax (default `0.04`). Increase to show more BUY signals; decrease for stricter calls. |
| `ML_LABEL_THRESHOLD` | No | Forward-return threshold for BUY label (default `0.015` = 1.5%). |
| `ML_LABEL_SELL_THRESHOLD` | No | Forward-return threshold for SELL label (default `-0.015`). |
| `DISABLE_FINBERT` | No | Set `1` on 512MB Render instances. |

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
| FinBot preview model fails | Set `GEMINI_MODEL_FALLBACKS=gemini-3.1-flash-lite` on gen-ai; check `/health` → `gemini_model_chain`. |
| Signals never update | Redis + core-api workers running; `ML_SERVICE_URL` reachable. |
| Socket.IO fails on Vercel | Set `VITE_BACKEND_URL` to Render API; do not rely on `/socket.io` rewrite. |
| Charts flat / Hindsight empty | Run `npm run import-history`. |
| ML always heuristic | Retrain model; confirm `/ml/health` shows `model_version: 5, model_loaded: true`. |
| Probability tooltip missing | Run `POST /api/feed/signals/refresh` — old Signal rows predate `buyProb`/`holdProb`/`sellProb` columns. |
| Leaderboard click does nothing | Hard refresh once (stale dashboard cache); ensure API returns `userId` on each row; client links use `userId` or `user.id`. |
| Profile holding opens stock list only | Restart core-api after profile API change; holdings need `stock.ticker` (fallback: `displayTicker.NS`). |
| Wrong password sends you to landing | Deploy latest client (`skipAuthRedirect` on `/auth/login` and `/auth/register`). |
| Logout lands on `/auth` | Deploy latest client — logout and protected-route redirect go to `/`. |
| Landing deck scroll stuck | Hard refresh; ensure you are on latest client build. |

---

## Acknowledgments & third-party credits

### TradingView — Lightweight Charts

**Market and stock charts** in the FinSocial dashboard (and related OHLC visualizations) are built with **[TradingView Lightweight Charts™](https://www.tradingview.com/lightweight-charts/)** ([`lightweight-charts`](https://www.npmjs.com/package/lightweight-charts) on npm).

Copyright © [TradingView, Inc.](https://www.tradingview.com/)  
Licensed under the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0).

FinSocial is not affiliated with, sponsored by, or endorsed by TradingView. TradingView and Lightweight Charts are trademarks of TradingView, Inc.

### Other notable libraries

- [React](https://react.dev/), [Vite](https://vitejs.dev/), [Tailwind CSS](https://tailwindcss.com/)
- [Three.js](https://threejs.org/) / [@react-three/fiber](https://docs.pmnd.rs/react-three-fiber) — landing hero 3D scene
- [Recharts](https://recharts.org/) — portfolio analytics charts
- [Socket.IO](https://socket.io/) — real-time Tribe and notifications
- Market data via [Yahoo Finance](https://finance.yahoo.com/) and optional [Alpha Vantage](https://www.alphavantage.co/)

---

## License

ISC (per package manifests). Third-party components are subject to their own licenses (see **Acknowledgments** above).

Built as a hackathon / portfolio demo — **not financial advice.**
