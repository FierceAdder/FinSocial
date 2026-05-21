const YahooFinance = require('yahoo-finance2').default;
const prisma = require('./prisma');
const logger = require('./logger');
const { getApiKey, fetchIntradaySeries, fetchDailySeries } = require('../providers/alphavantage');
const historyCache = require('./historyCache');
const { upsertDailyHistory } = require('./stockHistoryUpsert');
const { marketDayKey, serializeHistoryBar } = require('./marketTime');

const yf = new YahooFinance();

const VALID_RANGES = new Set(['1d', '1w', '1m', '3m', '1y', '2y', '5y', '10y']);

/** Max daily bars per range (~trading days). */
const TRADING_DAY_TAKE = {
  '1w':  7,
  '1m':  22,
  '3m':  66,
  '1y':  252,
  '2y':  560,
  '5y':  1260,
  '10y': 2520,
};

function normalizeRange(raw) {
  if (!raw || typeof raw !== 'string') return '2y';
  const key = raw.trim().toLowerCase().replace(/\s+/g, '');
  const aliases = {
    '1day':    '1d',
    '1week':   '1w',
    '1wk':     '1w',
    '1month':  '1m',
    '1mo':     '1m',
    '3month':  '3m',
    '3months': '3m',
    '3mo':     '3m',
    '1year':   '1y',
    '1yr':     '1y',
    '2year':   '2y',
    '2years':  '2y',
    '2yr':     '2y',
    '5year':   '5y',
    '5years':  '5y',
    '5yr':     '5y',
    '10year':  '10y',
    '10years': '10y',
    '10yr':    '10y',
  };
  const mapped = aliases[key] || key;
  return VALID_RANGES.has(mapped) ? mapped : '2y';
}

function latestSessionBars(quotes, ticker) {
  const valid = (quotes || []).filter(
    (q) => q?.date && Number.isFinite(q.open) && Number.isFinite(q.close),
  );
  if (!valid.length) return [];
  const sorted = [...valid].sort((a, b) => new Date(a.date) - new Date(b.date));
  const lastKey = marketDayKey(sorted[sorted.length - 1].date, ticker);
  let session = sorted.filter((q) => marketDayKey(q.date, ticker) === lastKey);
  
  if (session.length < 2) {
    const prevValid = sorted.filter((q) => marketDayKey(q.date, ticker) !== lastKey);
    if (prevValid.length) {
      const prevKey = marketDayKey(prevValid[prevValid.length - 1].date, ticker);
      session = sorted.filter((q) => marketDayKey(q.date, ticker) === prevKey);
    }
  }
  return session;
}

function mapHistoryResponse(bars) {
  return (bars || []).map(serializeHistoryBar);
}

function sliceDailyBars(bars, range) {
  const take = TRADING_DAY_TAKE[range] || TRADING_DAY_TAKE['2y'];
  return bars.slice(-take);
}

async function fetchYahooIntraday(ticker) {
  const cacheKey = `yahoo:intraday:${ticker}`;
  const cached = historyCache.get(cacheKey);
  if (cached) return cached;

  const period2 = new Date();
  const period1 = new Date();
  period1.setDate(period1.getDate() - 7);

  for (const interval of ['5m', '15m', '30m', '1h']) {
    try {
      const chart = await yf.chart(ticker, { period1, period2, interval });
      const session = latestSessionBars(chart?.quotes, ticker);
      if (session.length >= 2) {
        const mapped = session.map((q) => ({
          date: new Date(q.date),
          open: q.open,
          high: q.high ?? q.open,
          low: q.low ?? q.open,
          close: q.close,
          volume: q.volume ?? 0,
        }));
        historyCache.set(cacheKey, mapped);
        return mapped;
      }
    } catch (e) {
      logger.warn('Intraday chart fetch failed', { ticker, interval, error: e.message });
    }
  }
  return null;
}

async function fetchAvIntradayCached(ticker) {
  if (!getApiKey()) return null;
  const cacheKey = `intraday:ist:${ticker}`;
  const cached = historyCache.get(cacheKey);
  if (cached) return cached;

  const bars = await fetchIntradaySeries(ticker, '5min');
  if (!bars?.length) return null;

  const session = latestSessionBars(bars, ticker);
  if (session.length) {
    historyCache.set(cacheKey, session);
    return session;
  }
  return null;
}

async function fetchDbHistory(stockId, range) {
  const take = TRADING_DAY_TAKE[range] || TRADING_DAY_TAKE['2y'];
  const desc = await prisma.stockHistory.findMany({
    where: { stockId },
    orderBy: { date: 'desc' },
    take,
  });
  return desc.reverse();
}

async function fetchAvDailyForRange(stockId, ticker, range) {
  if (!getApiKey()) return null;

  const cacheKey = `daily:${ticker}:${range}`;
  const cached = historyCache.get(cacheKey);
  if (cached) return cached;

  const full = await fetchDailySeries(ticker, 'full');
  if (!full?.length) return null;

  const sliced = sliceDailyBars(full, range);
  historyCache.set(cacheKey, sliced, 5 * 60_000);

  upsertDailyHistory(stockId, full.slice(-30)).catch((e) => {
    logger.warn('Background history upsert failed', { ticker, error: e.message });
  });

  return sliced;
}

/**
 * @returns {Promise<{ history: object[], interval: '1d'|'intraday', range: string, historySource: string }>}
 */
async function fetchHistoryForRange(stockId, ticker, rangeInput) {
  const range = normalizeRange(rangeInput);

  if (range === '1d') {
    const avIntra = await fetchAvIntradayCached(ticker);
    if (avIntra?.length) {
      return {
        history: mapHistoryResponse(avIntra),
        interval: 'intraday',
        range: '1d',
        historySource: 'alphavantage',
      };
    }

    const yahooIntra = await fetchYahooIntraday(ticker);
    if (yahooIntra?.length) {
      return {
        history: mapHistoryResponse(yahooIntra),
        interval: 'intraday',
        range: '1d',
        historySource: 'yahoo',
      };
    }

    const fallback = await fetchDbHistory(stockId, '1w');
    return {
      history: mapHistoryResponse(fallback.slice(-1)),
      interval: '1d',
      range: '1d',
      historySource: 'db',
    };
  }

  // For long ranges, skip external APIs — only the DB has 5–10yr of history
  const isLongRange = range === '5y' || range === '10y';

  const avDaily = isLongRange ? null : await fetchAvDailyForRange(stockId, ticker, range);
  if (avDaily?.length) {
    return {
      history: mapHistoryResponse(avDaily),
      interval: '1d',
      range,
      historySource: 'alphavantage',
    };
  }

  const dbHistory = await fetchDbHistory(stockId, range);
  if (dbHistory.length) {
    return { history: mapHistoryResponse(dbHistory), interval: '1d', range, historySource: 'db' };
  }

  return { history: [], interval: '1d', range, historySource: 'none' };
}

module.exports = {
  normalizeRange,
  fetchHistoryForRange,
  VALID_RANGES,
  TRADING_DAY_TAKE,
};
