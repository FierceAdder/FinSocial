/**
 * One-time script: import 2 years of OHLCV history from Yahoo Finance
 * for all stocks in the database.
 *
 * Run: npm run import-history
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const YahooFinance = require('yahoo-finance2').default;
const yf = new YahooFinance({ suppressNotices: ['ripHistorical'] });

const prisma = new PrismaClient();

/** DB ticker → Yahoo symbol when they differ */
const YAHOO_TICKER_ALIASES = {
  'KOTAK.NS': 'KOTAKBANK.NS',
};

function yahooSymbol(dbTicker) {
  return YAHOO_TICKER_ALIASES[dbTicker] || dbTicker;
}

function normalizeQuote(q) {
  const close = q.close ?? q.adjclose;
  if (!q.date || !Number.isFinite(close)) return null;

  const open = Number.isFinite(q.open) ? q.open : close;
  const high = Number.isFinite(q.high) ? q.high : Math.max(open, close);
  const low = Number.isFinite(q.low) ? q.low : Math.min(open, close);
  const volume = Number.isFinite(q.volume) ? q.volume : 0;

  return {
    date: q.date,
    open,
    high,
    low,
    close,
    volume,
  };
}

async function fetchOhlcv(dbTicker, period1, period2) {
  const symbol = yahooSymbol(dbTicker);

  try {
    const chart = await yf.chart(symbol, { period1, period2, interval: '1d' });
    const quotes = chart?.quotes || [];
    const rows = quotes.map(normalizeQuote).filter(Boolean);
    if (rows.length) return rows;
  } catch (e) {
    console.warn(`    chart() failed for ${symbol}: ${e.message}`);
  }

  try {
    const rows = await yf.historical(symbol, { period1, period2, interval: '1d' });
    const normalized = (rows || []).map(normalizeQuote).filter(Boolean);
    if (normalized.length) return normalized;
  } catch (e) {
    console.warn(`    historical() failed for ${symbol}: ${e.message}`);
  }

  return [];
}

async function importHistory() {
  const stocks = await prisma.stock.findMany({ select: { id: true, ticker: true, displayTicker: true } });
  console.log(`Importing history for ${stocks.length} stocks...`);

  const period1 = new Date();
  period1.setFullYear(period1.getFullYear() - 2);
  const period2 = new Date();

  let ok = 0;
  let skipped = 0;

  for (const stock of stocks) {
    try {
      const yahoo = yahooSymbol(stock.ticker);
      console.log(`  Fetching ${stock.ticker}${yahoo !== stock.ticker ? ` (Yahoo: ${yahoo})` : ''}...`);
      const result = await fetchOhlcv(stock.ticker, period1, period2);

      if (!result || result.length === 0) {
        console.log(`  No data for ${stock.ticker}, skipping (existing DB rows kept).`);
        skipped += 1;
        continue;
      }

      const records = result.map((row) => ({
        stockId: stock.id,
        date: new Date(row.date),
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        volume: row.volume,
      }));

      const deleted = await prisma.stockHistory.deleteMany({ where: { stockId: stock.id } });
      const inserted = await prisma.stockHistory.createMany({ data: records });
      console.log(
        `  ✓ ${inserted.count} Yahoo rows for ${stock.displayTicker}` +
          (deleted.count ? ` (replaced ${deleted.count} old rows)` : ''),
      );
      ok += 1;

      await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      console.error(`  Error for ${stock.ticker}: ${err.message}`);
      skipped += 1;
    }
  }

  console.log(`\nDone importing history. Updated: ${ok}, skipped: ${skipped}.`);
}

importHistory()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
