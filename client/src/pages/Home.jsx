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

const Home = () => {
  const navigate = useNavigate();
  const user = useStore((state) => state.user);
  const [period, setPeriod] = useState('weekly');
  const [trendingTickers, setTrendingTickers] = useState([]);
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
  const [dashLoading, setDashLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setDashLoading(true);
    Promise.all([
      apiClient.get('/stocks').catch(() => ({ data: [] })),
      apiClient.get('/portfolio').catch(() => ({ data: null })),
      apiClient.get('/feed').catch(() => ({ data: [] })),
      apiClient.get('/feed/signals').catch(() => ({ data: [] })),
    ])
      .then(([stocksRes, portfolioRes, feedRes, signalsRes]) => {
        if (cancelled) return;
        const raw = stocksRes.data;
        const list = Array.isArray(raw) ? raw : [];
        setTrendingTickers(list.slice(0, 8).map((s) => ({
          tickerDisplay: s.displayTicker || s.ticker,
          tickerFull: s.ticker,
          price: s.price,
          chg: `${s.changePct >= 0 ? '+' : ''}${s.changePct?.toFixed(2)}%`,
          up: s.changePct >= 0,
          id: s.id,
        })));

        if (portfolioRes.data) setPortfolioStats(portfolioRes.data);
        const feed = Array.isArray(feedRes.data) ? feedRes.data : [];
        setFeedItems(feed.slice(0, 6));
        const sig = Array.isArray(signalsRes.data) ? signalsRes.data : [];
        setSignals(sig.slice(0, 5));
      })
      .finally(() => {
        if (!cancelled) setDashLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    setChartLoading(true);
    apiClient
      .get('/stocks/RELIANCE.NS', { params: { range: '2y' } })
      .then((r) => {
        setChartBaseHistory(r.data.history || []);
        setChartInterval(r.data.historyInterval || '1d');
      })
      .catch(() => setChartBaseHistory([]))
      .finally(() => setChartLoading(false));
  }, []);

  useEffect(() => {
    if (chartRange !== '1d') return;
    setChartLoading(true);
    apiClient
      .get('/stocks/RELIANCE.NS', { params: { range: '1d' } })
      .then((r) => {
        setChart1dHistory(r.data.history || []);
        setChartInterval(r.data.historyInterval || 'intraday');
      })
      .catch(() => setChart1dHistory([]))
      .finally(() => setChartLoading(false));
  }, [chartRange]);

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
        } else if (r.data.message) {
          setNewsRefreshMsg(r.data.message);
        }
      }
    } catch (err) {
      setNewsError(err.response?.data?.error || err.message || 'Could not load news');
    } finally {
      setNewsLoading(false);
    }
  };

  useEffect(() => {
    loadNews(false);
    const t = setTimeout(() => loadNews(true), 3000);
    return () => clearTimeout(t);
  }, []);

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
    'signal:new': (signal) => {
      setSignals((prev) => [signal, ...prev].slice(0, 5));
    },
  });

  const balance = portfolioStats?.balance ?? user?.virtualBalance ?? 1000000;
  const totalPnl = portfolioStats?.totalPnl ?? 0;

  const currentLb = leaderboardData[period] || [];

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
          <div className="stat-val mono">{trendingTickers[0]?.price ? `₹${trendingTickers[0].price.toFixed(0)}` : '—'}</div>
          <div className="stat-label">{trendingTickers[0]?.tickerDisplay || 'Top Stock'}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-val">{signals.filter((s) => s.verdict === 'BUY').length} BUY</div>
          <div className="stat-label">Active Signals</div>
        </div>
      </div>

      {/* Trending Tickers */}
      <div className="card trending-card">
        <div className="card-title" style={{ marginBottom: '8px' }}>🔥 Trending on FinSocial</div>
        <div className="trending-strip">
          {trendingTickers.map((t) => (
            <div
              key={t.tickerFull}
              className="trending-item"
              onClick={() => navigate(`${APP_BASE}/stocks?ticker=${encodeURIComponent(t.tickerFull)}`)}
            >
              <span className="trending-ticker mono">{t.tickerDisplay}</span>
              <span className="trending-price mono">₹{t.price?.toFixed(0)}</span>
              <span className={`mono ${t.up ? 'positive' : 'negative'}`}>{t.chg}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
            <div className="card-title" style={{ margin: 0 }}>RELIANCE</div>
            <ChartRangeSelector value={chartRange} onChange={setChartRange} />
          </div>
          <div style={{ height: 260 }}>
            {chartLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text3)' }}>
                Loading chart...
              </div>
            ) : chartData.length > 0 ? (
              <CandlestickChart data={chartData} height={260} chartKey={chartRange} />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text3)' }}>
                No chart data for this range
              </div>
            )}
          </div>
        </div>

        {/* Signal Board */}
        <div className="ai-card" style={{ marginTop: 0 }}>
          <div className="card-title" style={{ marginTop: '8px' }}>Signal board</div>
          {signals.length > 0 ? signals.map((s) => (
            <div key={s.id || s.ticker} style={{ marginBottom: '12px', paddingBottom: '12px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <span className="mono" style={{ fontWeight: 700 }}>{s.ticker || s.stock?.displayTicker}</span>
                <span className={`badge ${s.verdict === 'BUY' ? 'badge-green' : s.verdict === 'SELL' ? 'badge-red' : 'badge-gray'}`}>
                  {s.verdict}
                </span>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text3)', marginBottom: '4px' }}>
                Confidence: {s.confidence}%
              </div>
              <div className="conf-bar">
                <div className="conf-bar-fill" style={{ width: `${s.confidence}%` }} />
              </div>
              <p style={{ fontSize: '0.78rem', color: 'var(--text2)', marginTop: '4px', lineHeight: 1.5 }}>
                {s.reasoning?.slice(0, 100)}{s.reasoning?.length > 100 ? '…' : ''}
              </p>
            </div>
          )) : (
            <div style={{ color: 'var(--text3)', fontSize: '0.85rem' }}>
              {dashLoading
                ? 'Loading signals…'
                : 'No signals yet. Refreshed about every 15 minutes.'}
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: '16px' }}>
        <div className="card-title">📰 Market News</div>
        <NewsFeed
          articles={newsArticles}
          loading={newsLoading}
          error={newsError}
          refreshMessage={newsRefreshMsg}
          onRefresh={() => loadNews(true)}
        />
      </div>

      <div className="grid-2" style={{ marginTop: '16px' }}>
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
