/**
 * One-time script: import 2 years of OHLCV history from Yahoo Finance
 * for all stocks in the database.
 *
 * Run: npm run import-history
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const YahooFinance = require('yahoo-finance2').default;
const yf = new YahooFinance();

const prisma = new PrismaClient();

async function fetchOhlcv(ticker, period1, period2) {
  try {
    const rows = await yf.historical(ticker, {
      period1,
      period2,
      interval: '1d',
    });
    if (rows?.length) return rows;
  } catch (e) {
    console.warn(`    historical() failed for ${ticker}: ${e.message}`);
  }

  try {
    const chart = await yf.chart(ticker, { period1, period2, interval: '1d' });
    const quotes = chart?.quotes || [];
    if (quotes.length) {
      return quotes.map((q) => ({
        date: q.date,
        open: q.open,
        high: q.high,
        low: q.low,
        close: q.close,
        volume: q.volume,
      }));
    }
  } catch (e) {
    console.warn(`    chart() failed for ${ticker}: ${e.message}`);
  }

  return [];
}

async function importHistory() {
  const stocks = await prisma.stock.findMany({ select: { id: true, ticker: true, displayTicker: true } });
  console.log(`Importing history for ${stocks.length} stocks...`);

  const period1 = new Date();
  period1.setFullYear(period1.getFullYear() - 2);
  const period2 = new Date();

  for (const stock of stocks) {
    try {
      console.log(`  Fetching ${stock.ticker}...`);
      const result = await fetchOhlcv(stock.ticker, period1, period2);

      if (!result || result.length === 0) {
        console.log(`  No data for ${stock.ticker}, skipping.`);
        continue;
      }

      const records = result
        .filter((row) => row.date && Number.isFinite(row.close))
        .map((row) => ({
          stockId: stock.id,
          date: new Date(row.date),
          open: row.open || 0,
          high: row.high || 0,
          low: row.low || 0,
          close: row.close || 0,
          volume: row.volume || 0,
        }));

      // Replace any synthetic/seed rows so Yahoo OHLCV is authoritative
      const deleted = await prisma.stockHistory.deleteMany({ where: { stockId: stock.id } });
      const inserted = await prisma.stockHistory.createMany({ data: records });
      console.log(
        `  ✓ ${inserted.count} Yahoo rows for ${stock.displayTicker}` +
          (deleted.count ? ` (replaced ${deleted.count} old rows)` : ''),
      );

      // Respect rate limits
      await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      console.error(`  Error for ${stock.ticker}: ${err.message}`);
    }
  }

  console.log('\nDone importing history.');
}

importHistory()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
