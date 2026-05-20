# FinSocial — Client

React 19 + Vite SPA for FinSocial.

**Live app:** https://fin-social-eight.vercel.app

See the [root README](../README.md) for setup, deployment, and credits.

## Scripts

```bash
npm ci
npm run dev      # http://localhost:5173 (set VITE_DEV_BACKEND in .env)
npm run build
npm run lint
npm test
```

## Charts

Dashboard OHLC charts use [TradingView Lightweight Charts™](https://www.tradingview.com/lightweight-charts/). See [Acknowledgments](../README.md#acknowledgments--third-party-credits) in the root README.

## App cache

In-memory stale-while-revalidate cache (~3 minutes, `client/src/utils/appCache.js`) for Home, Stocks, Portfolio, Forum, Tribe, and Hindsight. Navigating between app routes shows the last data immediately while refreshing in the background. Shared chart history is cached per ticker across pages. Cache is cleared on logout.
