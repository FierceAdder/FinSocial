/** In-memory stale-while-revalidate cache for app pages (cleared on logout). */

export const CACHE_TTL_MS = 3 * 60 * 1000;

const emptyCache = () => ({
  userId: null,
  chartByTicker: {},
  home: {
    fetchedAt: 0,
    chartStockOptions: [],
    trendingTickers: [],
    topStock: null,
    chartTicker: null,
    portfolioStats: null,
    feedItems: [],
    chartBaseHistory: [],
    chart1dHistory: [],
    chartInterval: '1d',
    chartRange: '2y',
    signals: [],
    signalStats: null,
    signalsReady: false,
    newsArticles: [],
    leaderboardData: {},
  },
  stocks: {
    listFetchedAt: 0,
    list: [],
    watchlistFetchedAt: 0,
    watchlist: [],
  },
  stockDetail: {},
  portfolio: {
    fetchedAt: 0,
    data: null,
    tradeHistoryFetchedAt: 0,
    tradeHistory: [],
  },
  forum: {
    fetchedAt: 0,
    questions: [],
  },
  forumDetail: {},
  tribe: {
    channelsFetchedAt: 0,
    channels: [],
    messagesByChannel: {},
  },
  hindsight: {
    tickersFetchedAt: 0,
    tickers: [],
    historyByTicker: {},
  },
});

let cache = emptyCache();

function isFreshTimestamp(fetchedAt, userId, ttlMs = CACHE_TTL_MS) {
  if (!fetchedAt) return false;
  if (userId && cache.userId && cache.userId !== userId) return false;
  return Date.now() - fetchedAt < ttlMs;
}

export function getAppCache() {
  return cache;
}

export function clearAppCache() {
  cache = emptyCache();
}

export function touchAppCacheUser(userId) {
  cache = { ...cache, userId: userId ?? null };
}

// —— Shared chart (Home, Stocks, Hindsight) ——

export function getCachedChartForTicker(ticker) {
  if (!ticker) return null;
  return cache.chartByTicker[ticker] || null;
}

export function setCachedChartForTicker(ticker, data) {
  if (!ticker) return;
  cache = {
    ...cache,
    chartByTicker: {
      ...cache.chartByTicker,
      [ticker]: {
        base: data.base ?? [],
        intraday: data.intraday ?? [],
        interval: data.interval ?? '1d',
      },
    },
  };
}

/** Chart from chartByTicker, falling back to home dashboard fields for the same ticker. */
export function resolveCachedChart(ticker) {
  if (!ticker) return null;
  const fromTicker = cache.chartByTicker[ticker];
  if (fromTicker?.base?.length) return fromTicker;
  const h = cache.home;
  if (h.chartTicker === ticker && h.chartBaseHistory?.length) {
    return {
      base: h.chartBaseHistory,
      intraday: h.chart1dHistory ?? [],
      interval: h.chartInterval || '1d',
    };
  }
  return fromTicker || null;
}

function syncHomeChartToTicker(ticker, partial) {
  if (!ticker || !partial.chartBaseHistory?.length) return;
  setCachedChartForTicker(ticker, {
    base: partial.chartBaseHistory,
    intraday: partial.chart1dHistory ?? cache.chartByTicker[ticker]?.intraday ?? [],
    interval: partial.chartInterval ?? cache.home.chartInterval ?? '1d',
  });
}

// —— Home (dashboard) ——

export function getHomeCache() {
  return cache.home;
}

export function setHomeCache(partial) {
  const chartTicker = partial.chartTicker ?? cache.home.chartTicker;
  cache = {
    ...cache,
    userId: partial.userId ?? cache.userId,
    home: {
      ...cache.home,
      ...partial,
      fetchedAt: partial.fetchedAt ?? Date.now(),
      leaderboardData: partial.leaderboardData
        ? { ...cache.home.leaderboardData, ...partial.leaderboardData }
        : cache.home.leaderboardData,
    },
  };
  if (partial.chartBaseHistory?.length && chartTicker) {
    syncHomeChartToTicker(chartTicker, partial);
  }
  return cache.home;
}

export function isHomeCacheFresh(userId, ttlMs = CACHE_TTL_MS) {
  return isFreshTimestamp(cache.home.fetchedAt, userId, ttlMs);
}

export function homeCacheSnapshot() {
  const h = cache.home;
  return {
    chartStockOptions: h.chartStockOptions,
    trendingTickers: h.trendingTickers,
    topStock: h.topStock,
    chartTicker: h.chartTicker,
    portfolioStats: h.portfolioStats,
    feedItems: h.feedItems,
    chartBaseHistory: h.chartBaseHistory,
    chart1dHistory: h.chart1dHistory,
    chartInterval: h.chartInterval,
    chartRange: h.chartRange,
    signals: h.signals,
    signalStats: h.signalStats,
    signalsReady: h.signalsReady,
    newsArticles: h.newsArticles,
    leaderboardData: h.leaderboardData,
  };
}

export function hasHomeContent() {
  const h = cache.home;
  const hasChart = h.chartBaseHistory?.length > 0
    || Object.values(cache.chartByTicker).some((c) => c?.base?.length > 0);
  return (
    h.fetchedAt > 0
    && (h.chartStockOptions.length > 0
      || h.signals.length > 0
      || h.newsArticles.length > 0
      || h.trendingTickers.length > 0
      || hasChart)
  );
}

// —— Stocks ——

export function getStocksListCache() {
  return cache.stocks;
}

export function setStocksListCache({ list, watchlist, userId }) {
  const now = Date.now();
  cache = {
    ...cache,
    userId: userId ?? cache.userId,
    stocks: {
      ...cache.stocks,
      ...(list !== undefined ? { list, listFetchedAt: now } : {}),
      ...(watchlist !== undefined ? { watchlist, watchlistFetchedAt: now } : {}),
    },
  };
}

export function isStocksListFresh(userId) {
  return isFreshTimestamp(cache.stocks.listFetchedAt, userId);
}

export function isWatchlistFresh(userId) {
  return isFreshTimestamp(cache.stocks.watchlistFetchedAt, userId);
}

export function getStockDetailCache(ticker) {
  if (!ticker) return null;
  return cache.stockDetail[ticker] || null;
}

export function setStockDetailCache(ticker, partial) {
  if (!ticker) return;
  const prev = cache.stockDetail[ticker] || {};
  cache = {
    ...cache,
    stockDetail: {
      ...cache.stockDetail,
      [ticker]: { ...prev, ...partial, fetchedAt: Date.now() },
    },
  };
}

export function isStockDetailFresh(ticker, userId) {
  const entry = cache.stockDetail[ticker];
  return entry ? isFreshTimestamp(entry.fetchedAt, userId) : false;
}

// —— Portfolio ——

export function getPortfolioCache() {
  return cache.portfolio;
}

export function setPortfolioCache({ data, tradeHistory, userId }) {
  const now = Date.now();
  cache = {
    ...cache,
    userId: userId ?? cache.userId,
    portfolio: {
      ...cache.portfolio,
      ...(data !== undefined ? { data, fetchedAt: now } : {}),
      ...(tradeHistory !== undefined ? { tradeHistory, tradeHistoryFetchedAt: now } : {}),
    },
  };
}

export function isPortfolioFresh(userId) {
  return isFreshTimestamp(cache.portfolio.fetchedAt, userId);
}

export function isTradeHistoryFresh(userId) {
  return isFreshTimestamp(cache.portfolio.tradeHistoryFetchedAt, userId);
}

export function invalidatePortfolioCache() {
  cache = {
    ...cache,
    portfolio: { ...cache.portfolio, fetchedAt: 0, tradeHistoryFetchedAt: 0 },
  };
}

// —— Forum ——

export function getForumListCache() {
  return cache.forum;
}

export function setForumListCache(questions, userId) {
  cache = {
    ...cache,
    userId: userId ?? cache.userId,
    forum: { questions, fetchedAt: Date.now() },
  };
}

export function isForumListFresh(userId) {
  return isFreshTimestamp(cache.forum.fetchedAt, userId);
}

export function getForumDetailCache(id) {
  if (!id) return null;
  return cache.forumDetail[id] || null;
}

export function setForumDetailCache(id, question) {
  if (!id) return;
  cache = {
    ...cache,
    forumDetail: {
      ...cache.forumDetail,
      [id]: { question, fetchedAt: Date.now() },
    },
  };
}

export function isForumDetailFresh(id, userId) {
  const entry = cache.forumDetail[id];
  return entry ? isFreshTimestamp(entry.fetchedAt, userId) : false;
}

// —— Tribe ——

export function getTribeChannelsCache() {
  return cache.tribe.channels;
}

export function setTribeChannelsCache(channels, userId) {
  cache = {
    ...cache,
    userId: userId ?? cache.userId,
    tribe: { ...cache.tribe, channels, channelsFetchedAt: Date.now() },
  };
}

export function isTribeChannelsFresh(userId) {
  return isFreshTimestamp(cache.tribe.channelsFetchedAt, userId);
}

export function getTribeMessagesCache(channelId) {
  if (!channelId) return null;
  return cache.tribe.messagesByChannel[channelId] || null;
}

export function setTribeMessagesCache(channelId, messages) {
  if (!channelId) return;
  cache = {
    ...cache,
    tribe: {
      ...cache.tribe,
      messagesByChannel: {
        ...cache.tribe.messagesByChannel,
        [channelId]: { messages, fetchedAt: Date.now() },
      },
    },
  };
}

export function isTribeMessagesFresh(channelId, userId) {
  const entry = cache.tribe.messagesByChannel[channelId];
  return entry ? isFreshTimestamp(entry.fetchedAt, userId) : false;
}

export function appendTribeMessage(channelId, message) {
  const entry = cache.tribe.messagesByChannel[channelId];
  if (!entry?.messages) return;
  if (entry.messages.some((m) => m.id === message.id)) return;
  setTribeMessagesCache(channelId, [...entry.messages, message]);
}

// —— Hindsight ——

export function getHindsightTickersCache() {
  return cache.hindsight.tickers;
}

export function setHindsightTickersCache(tickers, userId) {
  cache = {
    ...cache,
    userId: userId ?? cache.userId,
    hindsight: { ...cache.hindsight, tickers, tickersFetchedAt: Date.now() },
  };
}

export function isHindsightTickersFresh(userId) {
  return isFreshTimestamp(cache.hindsight.tickersFetchedAt, userId);
}

export function getHindsightHistoryCache(ticker) {
  if (!ticker) return null;
  return cache.hindsight.historyByTicker[ticker] || null;
}

export function setHindsightHistoryCache(ticker, data) {
  if (!ticker) return;
  cache = {
    ...cache,
    hindsight: {
      ...cache.hindsight,
      historyByTicker: {
        ...cache.hindsight.historyByTicker,
        [ticker]: { ...data, fetchedAt: Date.now() },
      },
    },
  };
}

export function isHindsightHistoryFresh(ticker, userId) {
  const entry = cache.hindsight.historyByTicker[ticker];
  return entry ? isFreshTimestamp(entry.fetchedAt, userId) : false;
}
