import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useStore from '../store';
import apiClient from '../api/client';
import { useSocket } from '../hooks/useSocket';
import CandlestickChart from '../components/CandlestickChart';
import ChartRangeSelector from '../components/ChartRangeSelector';
import NewsFeed from '../components/NewsFeed';
import { APP_BASE } from '../constants/routes';
import { historyToChartData } from '../utils/chartHistory';
import {
  loadDashboardChartTicker,
  saveDashboardChartTicker,
} from '../utils/dashboardChartPreference';

const DASHBOARD_EXCLUDED_TICKERS = new Set(['SUNPHARMA.NS']);
const FEATURED_STOCK_TICKER = 'RELIANCE.NS';

const Home = () => {
  const navigate = useNavigate();
  const user = useStore((state) => state.user);
  const [period, setPeriod] = useState('weekly');
  const [trendingTickers, setTrendingTickers] = useState([]);
  const [topStock, setTopStock] = useState(null);
  const [portfolioStats, setPortfolioStats] = useState(null);
  const [feedItems, setFeedItems] = useState([]);
  const [leaderboardData, setLeaderboardData] = useState({});
  const [signals, setSignals] = useState([]);
  const [chartRange, setChartRange] = useState('2y');
  const [chartData, setChartData] = useState([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartBaseHistory, setChartBaseHistory] = useState([]);
  const [chartInterval, setChartInterval] = useState('1d');
  const [chart1dHistory, setChart1dHistory] = useState([]);
  const [newsArticles, setNewsArticles] = useState([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsError, setNewsError] = useState(null);
  const [newsRefreshMsg, setNewsRefreshMsg] = useState(null);
  const [signalsLoading, setSignalsLoading] = useState(false);
  const [signalsReady, setSignalsReady] = useState(false);
  const [signalsError, setSignalsError] = useState(null);
  const [signalsRefreshMsg, setSignalsRefreshMsg] = useState(null);
  const [signalStats, setSignalStats] = useState(null);
  const [chartStockOptions, setChartStockOptions] = useState([]);
  const [chartTicker, setChartTicker] = useState(() =>
    loadDashboardChartTicker(useStore.getState().user?.id, FEATURED_STOCK_TICKER)
  );

  const handleChartTickerChange = (ticker) => {
    setChartTicker(ticker);
    saveDashboardChartTicker(user?.id, ticker);
  };

  const loadSignals = async (refresh = false) => {
    if (refresh) {
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
      setSignals(Array.isArray(list) ? list : []);
      if (payload?.stats) setSignalStats(payload.stats);
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
      if (refresh) setSignalsLoading(false);
    }
  };

  const loadNews = async (refresh = false) => {
    setNewsLoading(true);
    setNewsError(null);
    if (refresh) setNewsRefreshMsg(null);
    try {
      const endpoint = refresh ? '/feed/news/refresh' : '/feed/news';
      const r = refresh
        ? await apiClient.post(endpoint)
        : await apiClient.get(endpoint);
      const list = r.data.articles ?? r.data;
      setNewsArticles(Array.isArray(list) ? list.slice(0, 12) : []);
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

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiClient.get('/stocks').catch(() => ({ data: [] })),
      apiClient.get('/portfolio').catch(() => ({ data: null })),
      apiClient.get('/feed').catch(() => ({ data: [] })),
    ])
      .then(([stocksRes, portfolioRes, feedRes]) => {
        if (cancelled) return;
        const rawList = Array.isArray(stocksRes.data) ? stocksRes.data : [];
        const options = rawList.map((s) => ({
          ticker: s.ticker,
          label: s.displayTicker || s.ticker.replace(/\.NS$/i, ''),
        }));
        setChartStockOptions(options);

        const savedTicker = loadDashboardChartTicker(user?.id, FEATURED_STOCK_TICKER);
        const resolvedTicker = options.some((o) => o.ticker === savedTicker)
          ? savedTicker
          : FEATURED_STOCK_TICKER;
        setChartTicker(resolvedTicker);
        if (resolvedTicker !== savedTicker) {
          saveDashboardChartTicker(user?.id, resolvedTicker);
        }

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
        setTopStock(list.length > 0 ? toTickerRow(list[0]) : null);
        setTrendingTickers(list.slice(0, 8).map(toTickerRow));

        if (portfolioRes.data) setPortfolioStats(portfolioRes.data);
        const feed = Array.isArray(feedRes.data) ? feedRes.data : [];
        setFeedItems(feed.slice(0, 6));
      });
    return () => { cancelled = true; };
  }, [user?.id]);

  useEffect(() => {
    const saved = loadDashboardChartTicker(user?.id, FEATURED_STOCK_TICKER);
    setChartTicker(saved);
  }, [user?.id]);

  useEffect(() => {
    loadSignals(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setChartLoading(true);
    apiClient
      .get(`/stocks/${encodeURIComponent(chartTicker)}`, { params: { range: '2y' } })
      .then((r) => {
        if (cancelled) return;
        setChartBaseHistory(r.data.history || []);
        setChartInterval(r.data.historyInterval || '1d');
      })
      .catch(() => {
        if (!cancelled) setChartBaseHistory([]);
      })
      .finally(() => {
        if (!cancelled) setChartLoading(false);
      });
    return () => { cancelled = true; };
  }, [chartTicker]);

  useEffect(() => {
    if (chartRange !== '1d') return undefined;
    let cancelled = false;
    setChartLoading(true);
    apiClient
      .get(`/stocks/${encodeURIComponent(chartTicker)}`, { params: { range: '1d' } })
      .then((r) => {
        if (cancelled) return;
        setChart1dHistory(r.data.history || []);
        setChartInterval(r.data.historyInterval || 'intraday');
      })
      .catch(() => {
        if (!cancelled) setChart1dHistory([]);
      })
      .finally(() => {
        if (!cancelled) setChartLoading(false);
      });
    return () => { cancelled = true; };
  }, [chartTicker, chartRange]);

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
        setLeaderboardData((prev) => ({ ...prev, [period]: rows }));
      })
      .catch(() => {
        setLeaderboardData((prev) => ({ ...prev, [period]: [] }));
      });
  }, [period, leaderboardData]);

  useEffect(() => {
    loadNews(false);
    const t = setTimeout(() => loadNews(true), 3000);
    return () => clearTimeout(t);
  }, []);

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

  // Real-time feed updates via socket
  useSocket({
    'feed:new': (event) => {
      setFeedItems((prev) => [{ ...event, isLive: true }, ...prev].slice(0, 8));
    },
    'feed:news': (article) => {
      setNewsArticles((prev) => {
        if (prev.some((a) => a.id === article.id)) return prev;
        return [article, ...prev].slice(0, 12);
      });
    },
    'signal:new': () => {
      loadSignals(false);
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
          <div className="dashboard-chart-area">
            {chartLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text3)' }}>
                Loading chart…
              </div>
            ) : chartData.length > 0 ? (
              <CandlestickChart
                data={chartData}
                height={300}
                compact
                chartKey={`${chartTicker}-${chartRange}`}
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

      <section className="dashboard-section card">
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
                  <div className="feed-av" title={actorLabel}>{actorInitials}</div>
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
                <div key={entry.id} className={`lb-row ${isYou ? 'lb-you' : ''} ${i < 3 ? 'lb-top' : ''}`}>
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
