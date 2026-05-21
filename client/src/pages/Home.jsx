import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import useStore from '../store';
import apiClient from '../api/client';
import { useSocket } from '../hooks/useSocket';
import MarketChart from '../components/MarketChart';
import ChartRangeSelector from '../components/ChartRangeSelector';
import ChartTypeSelector from '../components/ChartTypeSelector';
import useChartLivePoll from '../hooks/useChartLivePoll';
import { DEFAULT_CHART_TYPE } from '../constants/chartTypes';
import { ChevronDown } from 'lucide-react';
import NewsFeed from '../components/NewsFeed';
import { APP_BASE } from '../constants/routes';
import { DASHBOARD_EXCLUDED_TICKERS } from '../constants/dashboard';
import { historyToChartData } from '../utils/chartHistory';
import {
  loadDashboardChartTicker,
  saveDashboardChartTicker,
} from '../utils/dashboardChartPreference';
import {
  dashboardCacheSnapshot,
  getDashboardCache,
  hasDashboardContent,
  isDashboardCacheFresh,
  resolveCachedChart,
  setCachedChartForTicker,
  setDashboardCache,
} from '../utils/dashboardCache';
import { setPortfolioCache, setStocksListCache } from '../utils/appCache';

const FEATURED_STOCK_TICKER = 'RELIANCE.NS';

function readCachedHomeState() {
  const uid = useStore.getState().user?.id;
  if (!isDashboardCacheFresh(uid) || !hasDashboardContent()) return null;
  return dashboardCacheSnapshot();
}

const Home = () => {
  const navigate = useNavigate();
  const user = useStore((state) => state.user);
  const cachedInit = readCachedHomeState();
  const initTicker = cachedInit?.chartTicker
    || loadDashboardChartTicker(user?.id, FEATURED_STOCK_TICKER);
  const initChartCached = resolveCachedChart(initTicker);
  const hasInitialChart = (initChartCached?.base?.length > 0)
    || (cachedInit?.chartBaseHistory?.length > 0);

  const [period, setPeriod] = useState('weekly');
  const [trendingTickers, setTrendingTickers] = useState(cachedInit?.trendingTickers ?? []);
  const [topStock, setTopStock] = useState(cachedInit?.topStock ?? null);
  const [portfolioStats, setPortfolioStats] = useState(cachedInit?.portfolioStats ?? null);
  const [feedItems, setFeedItems] = useState(cachedInit?.feedItems ?? []);
  const [leaderboardData, setLeaderboardData] = useState(cachedInit?.leaderboardData ?? {});
  const [signals, setSignals] = useState(cachedInit?.signals ?? []);
  const [chartRange, setChartRange] = useState(cachedInit?.chartRange ?? '2y');
  const [chartData, setChartData] = useState([]);
  const [chartLoading, setChartLoading] = useState(!hasInitialChart);
  const [chartBaseHistory, setChartBaseHistory] = useState(
    cachedInit?.chartBaseHistory?.length ? cachedInit.chartBaseHistory : (initChartCached?.base ?? []),
  );
  const [chartInterval, setChartInterval] = useState(
    cachedInit?.chartInterval || initChartCached?.interval || '1d',
  );
  const [chart1dHistory, setChart1dHistory] = useState(
    cachedInit?.chart1dHistory?.length ? cachedInit.chart1dHistory : (initChartCached?.intraday ?? []),
  );
  const [newsArticles, setNewsArticles] = useState(cachedInit?.newsArticles ?? []);
  const [newsLoading, setNewsLoading] = useState(!(cachedInit?.newsArticles?.length > 0));
  const [newsError, setNewsError] = useState(null);
  const [newsRefreshMsg, setNewsRefreshMsg] = useState(null);
  const [signalsLoading, setSignalsLoading] = useState(false);
  const [signalsReady, setSignalsReady] = useState(cachedInit?.signalsReady ?? false);
  const [signalsError, setSignalsError] = useState(null);
  const [signalsRefreshMsg, setSignalsRefreshMsg] = useState(null);
  const [signalStats, setSignalStats] = useState(cachedInit?.signalStats ?? null);
  const [chartStockOptions, setChartStockOptions] = useState(cachedInit?.chartStockOptions ?? []);
  const [chartTicker, setChartTicker] = useState(initTicker);
  const [chartType, setChartType] = useState(DEFAULT_CHART_TYPE);
  const [showVolume, setShowVolume] = useState(true);

  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const chartHeight = windowWidth < 600 ? 220 : 300;
  const signalsRefreshInFlightRef = useRef(false);
  const signalsSocketDebounceRef = useRef(null);
  const chartFetchRef = useRef({ base: null, intraday: null });

  const persistDashboard = useCallback((partial) => {
    setDashboardCache({ userId: user?.id ?? null, ...partial });
  }, [user?.id]);

  const handleChartTickerChange = (ticker) => {
    setChartTicker(ticker);
    saveDashboardChartTicker(user?.id, ticker);
    const cached = resolveCachedChart(ticker);
    if (cached?.base?.length) {
      setChartBaseHistory(cached.base);
      setChart1dHistory(cached.intraday ?? []);
      setChartInterval(cached.interval || '1d');
      setChartLoading(false);
    }
  };

  const loadSignals = useCallback(async (refresh = false) => {
    if (refresh) {
      signalsRefreshInFlightRef.current = true;
      setSignalsLoading(true);
      setSignalsError(null);
      setSignalsRefreshMsg(null);
    }
    try {
      const r = refresh
        ? await apiClient.post('/feed/signals/refresh', {}, { timeout: 120_000 })
        : await apiClient.get('/feed/signals');
      const payload = r.data;
      const list = Array.isArray(payload) ? payload : (payload.signals ?? []);
      const nextSignals = Array.isArray(list) ? list : [];
      const nextStats = payload?.stats ?? null;
      setSignals(nextSignals);
      if (nextStats) setSignalStats(nextStats);
      persistDashboard({
        signals: nextSignals,
        signalStats: nextStats,
        signalsReady: true,
      });
      if (refresh) {
        if (r.data.error && r.data.updated === 0) {
          setSignalsError(r.data.error);
        } else if (r.data.failed > 0 && r.data.message) {
          setSignalsRefreshMsg(r.data.message);
        } else {
          setSignalsRefreshMsg(null);
        }
      }
    } catch (err) {
      if (refresh) {
        setSignalsError(err.response?.data?.error || err.message || 'Could not generate signals');
      }
    } finally {
      setSignalsReady(true);
      if (refresh) {
        signalsRefreshInFlightRef.current = false;
        setSignalsLoading(false);
      }
    }
  }, [persistDashboard]);

  const scheduleSignalsReload = useCallback(() => {
    if (signalsRefreshInFlightRef.current) return;
    if (signalsSocketDebounceRef.current) clearTimeout(signalsSocketDebounceRef.current);
    signalsSocketDebounceRef.current = setTimeout(() => {
      signalsSocketDebounceRef.current = null;
      loadSignals(false);
    }, 1500);
  }, [loadSignals]);

  const loadNews = async (refresh = false, silent = false) => {
    if (!silent) setNewsLoading(true);
    setNewsError(null);
    if (refresh) setNewsRefreshMsg(null);
    try {
      const endpoint = refresh ? '/feed/news/refresh' : '/feed/news';
      const r = refresh
        ? await apiClient.post(endpoint)
        : await apiClient.get(endpoint);
      const list = r.data.articles ?? r.data;
      const nextNews = Array.isArray(list) ? list.slice(0, 12) : [];
      setNewsArticles(nextNews);
      persistDashboard({ newsArticles: nextNews });
      if (refresh) {
        if (r.data.error && r.data.saved === 0) {
          setNewsError(r.data.error);
          setNewsRefreshMsg(null);
        } else if (r.data.saved === 0 && r.data.message) {
          setNewsRefreshMsg(r.data.message);
        } else {
          setNewsRefreshMsg(null);
        }
      }
    } catch (err) {
      setNewsError(err.response?.data?.error || err.message || 'Could not load news');
    } finally {
      setNewsLoading(false);
    }
  };

  const applyDashboardBootstrap = useCallback((rawList, portfolioData, feedData, silent) => {
    const options = rawList.map((s) => ({
      ticker: s.ticker,
      label: s.displayTicker || s.ticker.replace(/\.NS$/i, ''),
    }));
    const list = rawList.filter((s) => !DASHBOARD_EXCLUDED_TICKERS.has(s.ticker));
    const toTickerRow = (s) => ({
      tickerDisplay: s.displayTicker || s.ticker,
      tickerFull: s.ticker,
      price: s.price,
      changePct: s.changePct ?? 0,
      chg: `${s.changePct >= 0 ? '+' : ''}${s.changePct?.toFixed(2)}%`,
      up: s.changePct >= 0,
      id: s.id,
    });
    const trending = list.slice(0, 8).map(toTickerRow);
    const top = list.length > 0 ? toTickerRow(list[0]) : null;
    const nextFeed = Array.isArray(feedData) ? feedData.slice(0, 6) : [];

    setChartStockOptions(options);
    setTopStock(top);
    setTrendingTickers(trending);
    if (portfolioData) setPortfolioStats(portfolioData);
    setFeedItems(nextFeed);

    const cachedTicker = getDashboardCache().chartTicker
      || loadDashboardChartTicker(user?.id, FEATURED_STOCK_TICKER);
    let resolvedTicker = cachedTicker;

    if (!silent) {
      const savedTicker = loadDashboardChartTicker(user?.id, FEATURED_STOCK_TICKER);
      resolvedTicker = options.some((o) => o.ticker === savedTicker)
        ? savedTicker
        : FEATURED_STOCK_TICKER;
      setChartTicker(resolvedTicker);
      if (resolvedTicker !== savedTicker) {
        saveDashboardChartTicker(user?.id, resolvedTicker);
      }
    } else if (options.length && !options.some((o) => o.ticker === cachedTicker)) {
      resolvedTicker = options.some((o) => o.ticker === FEATURED_STOCK_TICKER)
        ? FEATURED_STOCK_TICKER
        : options[0].ticker;
      setChartTicker(resolvedTicker);
      saveDashboardChartTicker(user?.id, resolvedTicker);
    }

    setDashboardCache({
      userId: user?.id ?? null,
      chartStockOptions: options,
      trendingTickers: trending,
      topStock: top,
      portfolioStats: portfolioData ?? null,
      feedItems: nextFeed,
      chartTicker: resolvedTicker,
    });
    setStocksListCache({ list: rawList, userId: user?.id });
    if (portfolioData) setPortfolioCache({ data: portfolioData, userId: user?.id });
  }, [user?.id]);

  useEffect(() => {
    let cancelled = false;
    const silent = isDashboardCacheFresh(user?.id) && hasDashboardContent();

    Promise.all([
      apiClient.get('/stocks').catch(() => ({ data: [] })),
      apiClient.get('/portfolio').catch(() => ({ data: null })),
      apiClient.get('/feed').catch(() => ({ data: [] })),
    ])
      .then(([stocksRes, portfolioRes, feedRes]) => {
        if (cancelled) return;
        const rawList = Array.isArray(stocksRes.data) ? stocksRes.data : [];
        applyDashboardBootstrap(rawList, portfolioRes.data, feedRes.data, silent);
      });
    return () => { cancelled = true; };
  }, [user?.id, applyDashboardBootstrap]);

  useEffect(() => {
    const home = getDashboardCache();
    if (isDashboardCacheFresh(user?.id) && home.signalsReady) return;
    loadSignals(false);
  }, [user?.id, loadSignals]);

  const fetchChartBase = useCallback((ticker, silent = false, range = '2y') => {
    if (!ticker) return Promise.resolve();
    const cached = resolveCachedChart(ticker);
    if (!silent && !(cached?.base?.length)) setChartLoading(true);
    if (chartFetchRef.current.base === ticker) return Promise.resolve();
    chartFetchRef.current.base = ticker;
    return apiClient
      .get(`/stocks/${encodeURIComponent(ticker)}`, { params: { range, skipQuote: '1' } })
      .then((r) => {
        const history = r.data.history || [];
        const interval = r.data.historyInterval || '1d';
        setChartBaseHistory(history);
        setChartInterval(interval);
        const prev = resolveCachedChart(ticker);
        setCachedChartForTicker(ticker, {
          base: history,
          intraday: prev?.intraday ?? [],
          interval,
        });
        persistDashboard({
          chartBaseHistory: history,
          chartInterval: interval,
          chartTicker: ticker,
        });
      })
      .catch(() => setChartBaseHistory([]))
      .finally(() => {
        if (chartFetchRef.current.base === ticker) chartFetchRef.current.base = null;
        setChartLoading(false);
      });
  }, [persistDashboard]);

  const fetchChart1d = useCallback((ticker, silent = false) => {
    if (!ticker) return Promise.resolve();
    if (!silent && chartRange === '1d') setChartLoading(true);
    if (chartFetchRef.current.intraday === ticker) return Promise.resolve();
    chartFetchRef.current.intraday = ticker;
    return apiClient
      .get(`/stocks/${encodeURIComponent(ticker)}`, { params: { range: '1d', skipQuote: '1' } })
      .then((r) => {
        const history = r.data.history || [];
        const interval = r.data.historyInterval || 'intraday';
        setChart1dHistory(history);
        setChartInterval(interval);
        const prev = resolveCachedChart(ticker);
        setCachedChartForTicker(ticker, {
          base: prev?.base ?? [],
          intraday: history,
          interval,
        });
        persistDashboard({ chart1dHistory: history, chartInterval: interval, chartTicker: ticker });
      })
      .catch(() => setChart1dHistory([]))
      .finally(() => {
        if (chartFetchRef.current.intraday === ticker) chartFetchRef.current.intraday = null;
        setChartLoading(false);
      });
  }, [chartRange, persistDashboard]);

  useEffect(() => {
    if (!chartTicker) return;
    const cached = resolveCachedChart(chartTicker);
    if (cached?.base?.length) {
      setChartBaseHistory(cached.base);
      setChartInterval(cached.interval || '1d');
      setChartLoading(false);
    }
    const skipFetch = Boolean(cached?.base?.length) && isDashboardCacheFresh(user?.id);
    if (!skipFetch) {
      fetchChartBase(chartTicker, Boolean(cached?.base?.length));
    }
  }, [chartTicker, fetchChartBase, user?.id]);

  useEffect(() => {
    if (chartRange !== '1d' || !chartTicker) return undefined;
    const cached = resolveCachedChart(chartTicker);
    if (cached?.intraday?.length) {
      setChart1dHistory(cached.intraday);
      setChartInterval(cached.interval || 'intraday');
    }
    const skipFetch = Boolean(cached?.intraday?.length) && isDashboardCacheFresh(user?.id);
    if (!skipFetch) {
      fetchChart1d(chartTicker, Boolean(cached?.intraday?.length));
    }
    return undefined;
  }, [chartTicker, chartRange, fetchChart1d, user?.id]);

  // Re-fetch from server when switching to long ranges (5y/10y need more bars than cached 2y)
  useEffect(() => {
    if (!chartTicker || chartRange === '1d') return;
    if (chartRange !== '5y' && chartRange !== '10y') return;
    setChartLoading(true);
    // Reset ref so a ticker switch while on 5y also re-fetches
    chartFetchRef.current.base = null;
    apiClient
      .get(`/stocks/${encodeURIComponent(chartTicker)}`, { params: { range: chartRange, skipQuote: '1' } })
      .then((r) => {
        const history = r.data.history || [];
        const interval = r.data.historyInterval || '1d';
        setChartBaseHistory(history);
        setChartInterval(interval);
        const prev = resolveCachedChart(chartTicker);
        setCachedChartForTicker(chartTicker, {
          base: history,
          intraday: prev?.intraday ?? [],
          interval,
        });
        persistDashboard({ chartBaseHistory: history, chartInterval: interval, chartTicker });
      })
      .catch(() => {})
      .finally(() => setChartLoading(false));
  }, [chartTicker, chartRange, persistDashboard]);

  // Persist chartRange selection so it survives navigation
  useEffect(() => {
    persistDashboard({ chartRange });
  }, [chartRange, persistDashboard]);

  const pollLiveChart = useCallback(() => {
    if (chartRange === '1d') {
      fetchChart1d(chartTicker, true);
    }
    fetchChartBase(chartTicker, true);
  }, [chartRange, chartTicker, fetchChart1d, fetchChartBase]);

  useChartLivePoll({ enabled: chartRange === '1d', onPoll: pollLiveChart });

  useEffect(() => {
    if (chartRange === '1d') {
      setChartData(historyToChartData(chart1dHistory, '1d', chartInterval));
    } else {
      setChartData(historyToChartData(chartBaseHistory, chartRange, '1d'));
    }
  }, [chartRange, chartBaseHistory, chart1dHistory, chartInterval]);

  useEffect(() => {
    if (leaderboardData[period] !== undefined) return;
    apiClient
      .get(`/leaderboard?period=${period}`)
      .then((r) => {
        const rows = Array.isArray(r.data) ? r.data : [];
        setLeaderboardData((prev) => {
          const next = { ...prev, [period]: rows };
          persistDashboard({ leaderboardData: next });
          return next;
        });
      })
      .catch(() => {
        setLeaderboardData((prev) => {
          const next = { ...prev, [period]: [] };
          persistDashboard({ leaderboardData: next });
          return next;
        });
      });
  }, [period, leaderboardData, persistDashboard]);

  useEffect(() => {
    const home = getDashboardCache();
    const hasNews = (home.newsArticles?.length > 0) || (newsArticles.length > 0);
    const silent = isDashboardCacheFresh(user?.id) && hasNews;
    loadNews(false, silent);
  }, [user?.id]);

  useEffect(() => {
    if (!newsRefreshMsg) return undefined;
    const t = setTimeout(() => setNewsRefreshMsg(null), 6000);
    return () => clearTimeout(t);
  }, [newsRefreshMsg]);

  useEffect(() => {
    if (!signalsRefreshMsg) return undefined;
    const t = setTimeout(() => setSignalsRefreshMsg(null), 6000);
    return () => clearTimeout(t);
  }, [signalsRefreshMsg]);

  useEffect(() => () => {
    if (signalsSocketDebounceRef.current) clearTimeout(signalsSocketDebounceRef.current);
  }, []);

  // Real-time feed updates via socket
  useSocket({
    'feed:new': (event) => {
      setFeedItems((prev) => {
        const next = [{ ...event, isLive: true }, ...prev].slice(0, 8);
        setDashboardCache({ feedItems: next });
        return next;
      });
    },
    'feed:news': (article) => {
      setNewsArticles((prev) => {
        if (prev.some((a) => a.id === article.id)) return prev;
        const next = [article, ...prev].slice(0, 12);
        setDashboardCache({ newsArticles: next });
        return next;
      });
    },
    'signals:refreshed': () => {
      scheduleSignalsReload();
    },
    'signal:new': (payload) => {
      if (payload?.isDailyPick) scheduleSignalsReload();
    },
  });

  const balance = portfolioStats?.balance ?? user?.virtualBalance ?? 1000000;
  const totalPnl = portfolioStats?.totalPnl ?? 0;

  const currentLb = leaderboardData[period] || [];

  const chartLabel =
    chartStockOptions.find((o) => o.ticker === chartTicker)?.label ||
    chartTicker.replace(/\.NS$/i, '');


  const signalVerdictClass = (verdict) => {
    if (verdict === 'BUY') return 'dashboard-signal-chip--buy';
    if (verdict === 'SELL') return 'dashboard-signal-chip--sell';
    return 'dashboard-signal-chip--hold';
  };

  const openStockPage = (tickerFull) => {
    if (!tickerFull) return;
    navigate(`${APP_BASE}/stocks?ticker=${encodeURIComponent(tickerFull)}`);
  };

  return (
    <div className="page fade-in" id="homePage">
      <h1 className="page-title">Dashboard</h1>
      
      {/* Stats */}
      <div className="home-stats">
        <div className="card stat-card">
          <div className="stat-val mono">₹{(balance / 100000).toFixed(2)}L</div>
          <div className="stat-label">Virtual Balance</div>
        </div>
        <div className="card stat-card">
          <div className={`stat-val mono ${totalPnl >= 0 ? 'positive' : 'negative'}`}>
            {totalPnl >= 0 ? '+' : ''}₹{totalPnl.toFixed(0)}
          </div>
          <div className="stat-label">Total P&L</div>
        </div>
        <div className="card stat-card">
          <div className="stat-val mono">{topStock?.price ? `₹${topStock.price.toFixed(0)}` : '—'}</div>
          <div className="stat-label">Top Stock</div>
          {topStock && (
            <div style={{ fontSize: '0.72rem', color: 'var(--text3)', marginTop: '4px' }}>
              <span className="mono" style={{ fontWeight: 600 }}>{topStock.tickerDisplay}</span>
              {' '}
              <span className={topStock.up ? 'positive' : 'negative'}>{topStock.chg}</span>
            </div>
          )}
        </div>
        <div className="card stat-card">
          <div className="stat-val">
            {signalStats != null ? `${signalStats.buy} BUY` : '—'}
          </div>
          <div className="stat-label">
            Active Signals
            {signalStats != null && (
              <span style={{ display: 'block', fontSize: '0.7rem', fontWeight: 400, marginTop: '2px' }}>
                {signalStats.total} tracked · {signalStats.sell} SELL · {signalStats.hold} HOLD
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="dashboard-section dashboard-market-row">
        <div className="dashboard-market-main">
        <section className="card dashboard-chart-card" aria-labelledby="dashboard-chart-heading" style={{ marginBottom: 0 }}>
          <div className="dashboard-section-head">
            <div>
              <h2 id="dashboard-chart-heading" className="dashboard-section-title">Market chart</h2>
              <p className="dashboard-section-desc">OHLC history for any listed stock</p>
            </div>
            <div className="dashboard-section-head-controls">
              <select
                className="form-input"
                value={chartTicker}
                onChange={(e) => handleChartTickerChange(e.target.value)}
                aria-label="Select stock chart"
                style={{ width: 'auto', minWidth: '140px', padding: '6px 10px', fontSize: '0.82rem' }}
              >
                {chartStockOptions.length === 0 ? (
                  <option value={chartTicker}>{chartLabel}</option>
                ) : (
                  chartStockOptions.map((o) => (
                    <option key={o.ticker} value={o.ticker}>{o.label}</option>
                  ))
                )}
              </select>
              <ChartRangeSelector value={chartRange} onChange={setChartRange} />
            </div>
          </div>
          <ChartTypeSelector
            value={chartType}
            onChange={setChartType}
            showVolume={showVolume}
            onVolumeToggle={setShowVolume}
            className="chart-range-bar"
          />
          <div className="dashboard-chart-area" style={{ height: chartHeight }}>
            {chartLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text3)' }}>
                Loading chart…
              </div>
            ) : chartData.length > 0 ? (
              <MarketChart
                data={chartData}
                height={chartHeight}
                compact
                chartType={chartType}
                showVolume={showVolume}
                interval={chartInterval === 'intraday' ? 'intraday' : '1d'}
                chartKey={`${chartTicker}-${chartRange}-${chartType}`}
              />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text3)' }}>
                No chart data for this range
              </div>
            )}
          </div>
        </section>

        <section className="card trending-card dashboard-market-trending" style={{ marginBottom: 0 }}>
          <div style={{ marginBottom: '8px' }}>
            <h2 className="dashboard-section-title" style={{ marginBottom: '4px' }}>🔥 Trending on FinSocial</h2>
            <p className="dashboard-section-desc">Top 8 by daily % change</p>
          </div>
        <div className="trending-strip">
            {trendingTickers.map((t) => (
              <div
                key={t.tickerFull}
                className="trending-item"
                onClick={() => openStockPage(t.tickerFull)}
              >
                <span className="trending-ticker mono">{t.tickerDisplay}</span>
              <span className="trending-price mono">₹{t.price?.toFixed(0)}</span>
              <span className={`mono ${t.up ? 'positive' : 'negative'}`}>{t.chg}</span>
            </div>
          ))}
        </div>
        </section>
        </div>

        <section className="card dashboard-signals-panel" aria-labelledby="dashboard-signals-heading" style={{ marginBottom: 0 }}>
          <div className="dashboard-section-head">
            <div>
              <h2 id="dashboard-signals-heading" className="dashboard-section-title">ML signals</h2>
              <p className="dashboard-section-desc">
                {signalStats != null
                  ? `Showing 5 of ${signalStats.total} live ML signals · updates every 5 min`
                  : 'Live ML predictions · updates every 5 min'}
              </p>
            </div>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => loadSignals(true)}
              disabled={signalsLoading}
            >
              {signalsLoading ? '…' : 'Refresh'}
            </button>
          </div>
          {signalsError && <div className="news-feed-error" style={{ marginBottom: '8px' }}>{signalsError}</div>}
          {!signalsError && signalsRefreshMsg && (
            <div style={{ padding: '8px 10px', marginBottom: '10px', fontSize: '0.8rem', color: 'var(--text2)', background: 'var(--bg2)', borderRadius: '8px' }}>
              {signalsRefreshMsg}
            </div>
          )}
          {signals.length > 0 ? (
            <div className="dashboard-signals-list">
                {signals.map((s) => {
                  const display = s.stock?.displayTicker || (s.ticker || '').replace(/\.NS$/i, '');
                  const full = s.stock?.ticker || s.ticker;
                  return (
                    <article
                      key={s.id || full}
                      className={`dashboard-signal-chip ${signalVerdictClass(s.verdict)}`}
                      onClick={() => openStockPage(full)}
                      onKeyDown={(e) => e.key === 'Enter' && openStockPage(full)}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="dashboard-signal-chip-top">
                        <span className="dashboard-signal-chip-ticker mono">{display}</span>
                        <span className={`badge ${s.verdict === 'BUY' ? 'badge-green' : s.verdict === 'SELL' ? 'badge-red' : 'badge-gray'}`}>
                          {s.verdict}
                        </span>
                      </div>
                      <div className="dashboard-signal-chip-conf mono">{s.confidence}% confidence</div>
                      <div className="conf-bar" style={{ marginBottom: '8px' }}>
                        <div className="conf-bar-fill" style={{ width: `${s.confidence}%` }} />
                      </div>
                      {s.communityScore != null && (
                        <div className="signal-community-row" style={{ marginBottom: '8px' }}>
                          <span className="signal-community-label">👥 Community</span>
                          <div className="signal-community-bar">
                            <div
                              className="signal-community-fill"
                              style={{
                                width: `${s.communityScore}%`,
                                background: s.communityScore >= 60 ? 'var(--green)' :
                                            s.communityScore <= 40 ? 'var(--red)' : 'var(--text3)'
                              }}
                            />
                          </div>
                          <span className="signal-community-pct mono">
                            {s.communityScore}%{s.sentimentTotal > 0 ? ` (${s.sentimentTotal})` : ''}
                          </span>
                        </div>
                      )}
                      <p className="dashboard-signal-chip-reason">{s.reasoning}</p>
                    </article>
                  );
                })}
              </div>
          ) : (
            <div style={{ color: 'var(--text3)', fontSize: '0.85rem' }}>
              {!signalsReady || signalsLoading
                ? 'Loading signals…'
                : 'No signals yet. Tap Refresh or wait for auto-refresh.'}
        </div>
          )}
        </section>
      </div>

      <button
        type="button"
        className="dashboard-scroll-cue"
        onClick={() => document.getElementById('dashboardNews')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
      >
        News &amp; community below
        <ChevronDown size={16} strokeWidth={2.5} aria-hidden />
      </button>

      <section id="dashboardNews" className="dashboard-section card">
        <h2 className="dashboard-section-title" style={{ marginBottom: '12px' }}>📰 Market News</h2>
        <NewsFeed
          articles={newsArticles}
          loading={newsLoading}
          error={newsError}
          refreshMessage={newsRefreshMsg}
          onRefresh={() => loadNews(true)}
        />
      </section>

      <div className="grid-2 dashboard-section">
        <div className="card">
          <div className="card-title">Community Feed</div>
          <div id="feedList">
            {feedItems.length === 0 ? (
              <div style={{ padding: '16px', color: 'var(--text3)', fontSize: '0.85rem' }}>
                No activity yet. Make your first trade!
              </div>
            ) : feedItems.map((f, idx) => {
              const payload = f.payload || {};
              const side = payload.side || 'BUY';
              const ticker = payload.ticker || '';
              const qty = payload.quantity || '';
              const actorLabel = f.actor?.label || 'Community member';
              const actorInitials = f.actor?.initials || '?';
              return (
                <div key={f.id || idx} className={`feed-item ${f.isLive ? 'feed-item-live' : ''}`}>
                  <div
                    className="feed-av"
                    title={actorLabel}
                    style={{ cursor: f.actor?.id ? 'pointer' : 'default' }}
                    onClick={() => f.actor?.id && navigate(`${APP_BASE}/profile/${f.actor.id}`)}
                  >{actorInitials}</div>
                <div className="feed-body">
                    <strong>{actorLabel}</strong>
                    {' '}{side === 'BUY' ? 'bought' : 'sold'}{' '}
                    <span className={side === 'BUY' ? 'positive' : 'negative'}>{qty} shares</span>
                    {' of '}<strong>{ticker}</strong>
                    {payload.reason && <div style={{ fontSize: '0.75rem', color: 'var(--text3)', marginTop: '2px' }}>
                      "{payload.reason}"
                    </div>}
                    <div className="feed-time">{timeAgo(f.createdAt)}</div>
                </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Leaderboard */}
        <div className="card leaderboard-card">
          <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>🏆 Community Leaderboard</span>
            <div className="leaderboard-tabs">
              <button className={`lb-tab ${period === 'weekly' ? 'active' : ''}`} onClick={() => setPeriod('weekly')}>Weekly</button>
              <button className={`lb-tab ${period === 'monthly' ? 'active' : ''}`} onClick={() => setPeriod('monthly')}>Monthly</button>
              <button className={`lb-tab ${period === 'alltime' ? 'active' : ''}`} onClick={() => setPeriod('alltime')}>All Time</button>
            </div>
          </div>
          <div id="leaderboardContent">
            {currentLb.length === 0 ? (
              <div style={{ padding: '16px', color: 'var(--text3)', fontSize: '0.85rem' }}>
                {leaderboardData[period] === undefined ? 'Loading leaderboard…' : 'No leaderboard data yet.'}
              </div>
            ) : currentLb.map((entry, i) => {
              const medals = ['🥇', '🥈', '🥉'];
              const u = entry.user;
              const fullName = u ? `${u.firstName} ${u.lastName}` : 'Unknown';
              const isYou = u?.id === user?.id;
              return (
                <div
                  key={entry.id}
                  className={`lb-row ${isYou ? 'lb-you' : ''} ${i < 3 ? 'lb-top' : ''}`}
                  style={{ cursor: u?.id ? 'pointer' : 'default' }}
                  onClick={() => u?.id && navigate(`${APP_BASE}/profile/${u.id}`)}
                >
                  <div className="lb-rank">{medals[i] || entry.rank}</div>
                  <div className="lb-avatar">{u?.firstName?.[0]}{u?.lastName?.[0]}</div>
                <div className="lb-info">
                  <div className="lb-name">
                      {fullName}{u?.isVerified && ' ✓'}{isYou && ' (You)'}
                    </div>
                    <div className="lb-stats">
                      {entry.tradeCount} trades · {Math.round(entry.winRate * 100)}% win rate
                    </div>
                  </div>
                  <div className={`lb-returns mono ${entry.returnsPct >= 0 ? 'positive' : 'negative'}`}>
                    {entry.returnsPct >= 0 ? '+' : ''}{entry.returnsPct.toFixed(2)}%
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

function timeAgo(date) {
  const seconds = Math.floor((new Date() - new Date(date)) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export default Home;
