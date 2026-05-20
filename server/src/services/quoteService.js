const YahooFinance = require('yahoo-finance2').default;
const { fetchGlobalQuote } = require('../providers/alphavantage');
const prisma = require('../utils/prisma');
const logger = require('../utils/logger');
const { evaluatePriceAlertsForStock } = require('./priceAlertService');

const yf = new YahooFinance();

async function quoteFromYahoo(ticker) {
  const quote = await yf.quote(ticker);
  const price = quote.regularMarketPrice;
  if (!Number.isFinite(price)) {
    throw new Error('Yahoo quote missing price');
  }
  return {
    price,
    change: quote.regularMarketChange ?? 0,
    changePct: quote.regularMarketChangePercent ?? 0,
    mcap: quote.marketCap ? Number(quote.marketCap) : null,
    pe: quote.trailingPE ?? null,
    high52: quote.fiftyTwoWeekHigh ?? null,
    low52: quote.fiftyTwoWeekLow ?? null,
    volume: quote.regularMarketVolume ?? null,
    displayTicker:
      ticker.replace(/\.NS$|\.BO$/i, '') ||
      (quote.symbol && String(quote.symbol).includes(':')
        ? String(quote.symbol).split(':').pop()
        : quote.symbol),
    name: quote.shortName || quote.longName || ticker,
    sector: null,
    industry: null,
    source: 'yahoo',
  };
}

async function fetchBestEffortQuote(ticker) {
  const avKey = process.env.ALPHAVANTAGE_API_KEY;
  if (avKey && avKey.trim()) {
    try {
      const q = await fetchGlobalQuote(avKey.trim(), ticker);
      if (q && Number.isFinite(q.price)) return q;
    } catch (e) {
      logger.warn('Alpha Vantage fetch failed', { ticker, error: e.message });
    }
  }

  try {
    return await quoteFromYahoo(ticker);
  } catch (e) {
    logger.warn('Yahoo Finance fetch failed', { ticker, error: e.message });
    return null;
  }
}

async function persistQuoteUpdate(ticker, q) {
  if (!q || !Number.isFinite(q.price)) return;

  const existing = await prisma.stock.findUnique({ where: { ticker } });
  const previousPrice = existing?.price;

  if (!existing) {
    await prisma.stock.create({
      data: {
        ticker,
        displayTicker: q.displayTicker || ticker.replace(/\.NS$|\.BO$/i, ''),
        name: q.name || q.displayTicker || ticker,
        sector: q.sector || 'Unknown',
        industry: q.industry ?? null,
        price: q.price,
        change: q.change ?? 0,
        changePct: q.changePct ?? 0,
        mcap: q.mcap ?? null,
        pe: q.pe ?? null,
        high52: q.high52 ?? null,
        low52: q.low52 ?? null,
        volume: q.volume ?? null,
      },
    });
    return;
  }

  await prisma.stock.update({
    where: { ticker },
    data: {
      price: q.price,
      change: q.change ?? 0,
      changePct: q.changePct ?? 0,
      ...(q.volume != null && Number.isFinite(q.volume) ? { volume: q.volume } : {}),
      ...(q.mcap != null && Number.isFinite(q.mcap) ? { mcap: q.mcap } : {}),
      ...(q.pe != null && Number.isFinite(q.pe) ? { pe: q.pe } : {}),
      ...(q.high52 != null && Number.isFinite(q.high52) ? { high52: q.high52 } : {}),
      ...(q.low52 != null && Number.isFinite(q.low52) ? { low52: q.low52 } : {}),
      lastUpdated: new Date(),
    },
  });

  if (Number.isFinite(previousPrice) && previousPrice !== q.price) {
    try {
      await evaluatePriceAlertsForStock(existing.id, previousPrice, q.price);
    } catch (err) {
      logger.warn('[PriceAlert] Evaluation failed', { ticker, error: err.message });
    }
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

let rotateIndex = 0;

/**
 * Refresh quotes for a rotating batch (AV rate-limit friendly).
 * @param {number} batchSize
 */
async function refreshQuotesBatch(batchSize = 3) {
  const stocks = await prisma.stock.findMany({
    orderBy: { ticker: 'asc' },
    select: { id: true, ticker: true },
  });
  if (!stocks.length) return { updated: 0, total: 0 };

  const batch = [];
  for (let i = 0; i < batchSize; i++) {
    batch.push(stocks[(rotateIndex + i) % stocks.length]);
  }
  rotateIndex = (rotateIndex + batchSize) % stocks.length;

  let updated = 0;
  for (const stock of batch) {
    const q = await fetchBestEffortQuote(stock.ticker);
    if (q) {
      await persistQuoteUpdate(stock.ticker, q);
      updated += 1;
    }
    await sleep(13_000);
  }

  return { updated, batch: batch.map((s) => s.ticker), rotateIndex };
}

module.exports = {
  fetchBestEffortQuote,
  persistQuoteUpdate,
  refreshQuotesBatch,
};
