# FinSocial — Client

React 19 + Vite SPA for FinSocial.

**Live app:** https://fin-social-eight.vercel.app

See the [root README](../README.md) for Docker setup, ML/Gen-AI services, deployment, and credits.

## Scripts

```bash
npm ci
npm run dev      # http://localhost:5173 (set VITE_DEV_BACKEND in .env)
npm run build
npm run lint
npm test
```

## Routes

| Path | Page |
|------|------|
| `/` | Landing (public) |
| `/auth` | Sign-in / sign-up |
| `/app` | Dashboard (Home) |
| `/app/stocks` | Stock list |
| `/app/stocks?ticker=RELIANCE.NS` | Stock detail (query param) |
| `/app/profile/:userId` | User profile |
| `/app/portfolio`, `/app/forum`, `/app/tribe`, `/app/hindsight` | Other app sections |

Unauthenticated visits to `/app/*` redirect to `/`. Logout clears auth and returns to `/`.

## Charts

Dashboard and stock detail OHLC use [TradingView Lightweight Charts™](https://www.tradingview.com/lightweight-charts/). See [Acknowledgments](../README.md#acknowledgments--third-party-credits) in the root README.

## App cache

In-memory **stale-while-revalidate** cache (~3 minutes, per user) in `client/src/utils/appCache.js`:

- **Home** — signals, news, leaderboard, chart ticker data
- **Stocks** — list, watchlist, per-ticker detail + sentiment
- **Portfolio**, **Forum**, **Tribe**, **Hindsight** — last successful API payloads

Revisiting a page shows cached data immediately, then refreshes in the background. Chart OHLC is shared per ticker across Home, Stocks, and Hindsight. **`clearAppCache()`** runs on logout.

Home also persists a subset via `dashboardCache.js` (wrapper over `appCache`).

## Auth API client

`src/api/client.js` — on 401, redirects to landing unless:

- Request is `POST /auth/login` or `POST /auth/register`, or
- Config sets `skipAuthRedirect: true` (used by Auth form and FinBot).

## Deep linking

- **Leaderboard** (Home) — row links to `/app/profile/:userId`
- **Profile holdings** — chips link to `/app/stocks?ticker=<full ticker>`
- **Portfolio / news** — same `?ticker=` pattern for Stocks detail view
