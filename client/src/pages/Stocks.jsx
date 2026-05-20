import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bell } from 'lucide-react';
import apiClient from '../api/client';
import useStore from '../store';
import {
  resolveCachedChart,
  getStockDetailCache,
  getStocksListCache,
  invalidatePortfolioCache,
  isStockDetailFresh,
  isStocksListFresh,
  isWatchlistFresh,
  setCachedChartForTicker,
  setStockDetailCache,
  setStocksListCache,
} from '../utils/appCache';
import MarketChart from '../components/MarketChart';
import PriceAlertModal from '../components/PriceAlertModal';
import ChartRangeSelector from '../components/ChartRangeSelector';
import ChartTypeSelector from '../components/ChartTypeSelector';
import useChartLivePoll from '../hooks/useChartLivePoll';
import { DEFAULT_CHART_TYPE } from '../constants/chartTypes';
import { historyToChartData } from '../utils/chartHistory';

const TradeModal = ({ stock, onClose, onTraded }) => {
  const [side, setSide] = useState('BUY');
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleTrade = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await apiClient.post('/trades/execute', {
        stockId: stock.id,
        side,
        quantity: parseInt(quantity),
        reason: reason || undefined,
      });
      onTraded(side, quantity);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Trade failed');
    } finally {
      setLoading(false);
    }
  };

  const total = (stock.price * quantity).toLocaleString('en-IN', { maximumFractionDigits: 2 });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <h3 style={{ marginBottom: '16px' }}>Trade {stock.displayTicker}</h3>

        {error && <div style={{ color: 'var(--red)', marginBottom: '12px', fontSize: '0.85rem' }}>{error}</div>}

        <div className="trade-tabs">
          <button className={`trade-tab ${side === 'BUY' ? 'active' : ''}`} data-side="BUY" onClick={() => setSide('BUY')}>BUY</button>
          <button className={`trade-tab ${side === 'SELL' ? 'active' : ''}`} data-side="SELL" onClick={() => setSide('SELL')}>SELL</button>
        </div>

        <form onSubmit={handleTrade}>
          <div className="form-group">
            <label className="form-label">Quantity</label>
            <input className="form-input" type="number" min="1" value={quantity}
              onChange={(e) => setQuantity(e.target.value)} required />
          </div>
          <div className="form-group">
            <label className="form-label">Reason (optional)</label>
            <input className="form-input" type="text" placeholder="e.g. Breakout above 200DMA"
              value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div className="trade-total">
            <span>Total Value</span>
            <strong className="mono">₹{total}</strong>
          </div>
          <button className="btn btn-primary" style={{ width: '100%', marginTop: '16px' }}
            type="submit" disabled={loading}>
            {loading ? 'Processing...' : `${side} ${quantity} shares`}
          </button>
        </form>
      </div>
    </div>
  );
};

const Stocks = () => {
  const user = useStore((s) => s.user);
  const [searchParams, setSearchParams] = useSearchParams();
  const ticker = searchParams.get('ticker');
  const listCache = getStocksListCache();
  const [filter, setFilter] = useState('all');
  const [watchlist, setWatchlist] = useState(
    isWatchlistFresh(user?.id) ? listCache.watchlist : [],
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [stocksData, setStocksData] = useState(
    isStocksListFresh(user?.id) ? listCache.list : [],
  );
  const [loading, setLoading] = useState(!isStocksListFresh(user?.id));
  const [selectedStock, setSelectedStock] = useState(null);
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [showPriceAlertModal, setShowPriceAlertModal] = useState(false);
  const [stockAlerts, setStockAlerts] = useState([]);
  const [sentiment, setSentiment] = useState(null);
  const [tradeToast, setTradeToast] = useState('');
  const [chartRange, setChartRange] = useState('2y');
  const [chartLoading, setChartLoading] = useState(false);
  const [intradayBars, setIntradayBars] = useState(null);
  const [chartType, setChartType] = useState(DEFAULT_CHART_TYPE);
  const [showVolume, setShowVolume] = useState(true);

  useEffect(() => {
    const silentList = isStocksListFresh(user?.id);
    const silentWl = isWatchlistFresh(user?.id);
    if (!silentList) setLoading(true);

    apiClient.get('/stocks').then((r) => {
      const list = Array.isArray(r.data) ? r.data : [];
      setStocksData(list);
      setStocksListCache({ list, userId: user?.id });
    }).catch(() => {}).finally(() => setLoading(false));

    apiClient.get('/watchlist').then((r) => {
      const wl = r.data.map((s) => s.ticker);
      setWatchlist(wl);
      setStocksListCache({ watchlist: wl, userId: user?.id });
    }).catch(() => {
      if (!silentWl) {
        const saved = localStorage.getItem('finsocial_watchlist');
        if (saved) setWatchlist(JSON.parse(saved));
      }
    });
  }, [user?.id]);

  const detailFetchRef = useRef(null);

  useEffect(() => {
    if (!ticker) {
      setSelectedStock(null);
      return;
    }
    const cached = getStockDetailCache(ticker);
    const chartCached = resolveCachedChart(ticker);
    if (cached?.detail) {
      const detail = chartCached?.base?.length
        ? { ...cached.detail, history: chartCached.base, historyInterval: chartCached.interval }
        : cached.detail;
      setSelectedStock(detail);
      setChartLoading(false);
    }
    if (cached?.sentiment) setSentiment(cached.sentiment);
    const silent = Boolean(cached?.detail) && isStockDetailFresh(ticker, user?.id);
    if (!silent) setChartLoading(true);
    if (detailFetchRef.current === ticker) return;
    detailFetchRef.current = ticker;

    apiClient
      .get(`/stocks/${encodeURIComponent(ticker)}`, { params: { range: '2y', skipQuote: '1' } })
      .then((r) => {
        setSelectedStock(r.data);
        setIntradayBars(null);
        setCachedChartForTicker(ticker, {
          base: r.data.history || [],
          intraday: [],
          interval: r.data.historyInterval || '1d',
        });
        setStockDetailCache(ticker, { detail: r.data, sentiment: cached?.sentiment });
      })
      .catch(() => {})
      .finally(() => {
        if (detailFetchRef.current === ticker) detailFetchRef.current = null;
        setChartLoading(false);
      });

    apiClient.get(`/stocks/${encodeURIComponent(ticker)}/sentiment`).then((r) => {
      setSentiment(r.data);
      const prev = getStockDetailCache(ticker);
      setStockDetailCache(ticker, { detail: prev?.detail, sentiment: r.data });
    }).catch(() => {
      const fallback = { bullish: 60, neutral: 25, bearish: 15, total: 0, userVote: null };
      setSentiment(fallback);
      const prev = getStockDetailCache(ticker);
      setStockDetailCache(ticker, { detail: prev?.detail, sentiment: fallback });
    });
  }, [ticker, user?.id]);

  useEffect(() => {
    if (!selectedStock?.id) {
      setStockAlerts([]);
      return;
    }
    apiClient
      .get('/alerts', { params: { stockId: selectedStock.id, activeOnly: 'true' } })
      .then((r) => setStockAlerts(r.data))
      .catch(() => setStockAlerts([]));
  }, [selectedStock?.id]);

  const intradayFetchRef = useRef(null);

  const fetchIntraday = useCallback((t, silent = false) => {
    const chartCached = resolveCachedChart(t);
    if (chartCached?.intraday?.length) {
      setIntradayBars({ history: chartCached.intraday, interval: chartCached.interval || 'intraday' });
    }
    if (!silent && !(chartCached?.intraday?.length)) setChartLoading(true);
    if (intradayFetchRef.current === t) return Promise.resolve();
    intradayFetchRef.current = t;
    return apiClient
      .get(`/stocks/${encodeURIComponent(t)}`, { params: { range: '1d', skipQuote: '1' } })
      .then((r) => {
        const bars = { history: r.data.history || [], interval: r.data.historyInterval || 'intraday' };
        setIntradayBars(bars);
        setCachedChartForTicker(t, {
          base: chartCached?.base ?? [],
          intraday: bars.history,
          interval: bars.interval,
        });
      })
      .catch(() => setIntradayBars(null))
      .finally(() => {
        if (intradayFetchRef.current === t) intradayFetchRef.current = null;
        if (!silent) setChartLoading(false);
      });
  }, []);

  const refreshStockDetail = useCallback((silent = false) => {
    if (!ticker) return Promise.resolve();
    if (!silent) setChartLoading(true);
    return apiClient
      .get(`/stocks/${encodeURIComponent(ticker)}`, {
        params: { range: '2y', ...(silent ? {} : { skipQuote: '1' }) },
      })
      .then((r) => {
        setSelectedStock(r.data);
        const prev = resolveCachedChart(ticker);
        setCachedChartForTicker(ticker, {
          base: r.data.history || [],
          intraday: prev?.intraday ?? [],
          interval: r.data.historyInterval || '1d',
        });
        setStockDetailCache(ticker, { detail: r.data });
      })
      .catch(() => {})
      .finally(() => {
        if (!silent) setChartLoading(false);
      });
  }, [ticker]);

  useEffect(() => {
    if (!ticker || chartRange !== '1d') {
      setIntradayBars(null);
      return;
    }
    fetchIntraday(ticker);
  }, [ticker, chartRange, fetchIntraday]);

  const pollLiveChart = useCallback(() => {
    if (!ticker) return;
    if (chartRange === '1d') fetchIntraday(ticker, true);
    refreshStockDetail(true);
  }, [ticker, chartRange, fetchIntraday, refreshStockDetail]);

  useChartLivePoll({ enabled: Boolean(ticker) && chartRange === '1d', onPoll: pollLiveChart });

  const toggleWatchlist = async (t, stockId, e) => {
    e.stopPropagation();
    const inWl = watchlist.includes(t);
    if (inWl) {
      setWatchlist((prev) => prev.filter((x) => x !== t));
      await apiClient.delete(`/watchlist/${stockId}`).catch(() => {});
    } else {
      setWatchlist((prev) => [...prev, t]);
      await apiClient.post('/watchlist', { stockId }).catch(() => {});
    }
  };

  const handleSentimentVote = async (vote) => {
    try {
      const r = await apiClient.post(`/stocks/${encodeURIComponent(ticker)}/sentiment`, { vote });
      setSentiment((prev) => ({ ...prev, ...r.data }));
    } catch {
      /* ignore vote failure */
    }
  };

  const showToast = (msg) => {
    setTradeToast(msg);
    setTimeout(() => setTradeToast(''), 3000);
  };

  if (ticker && selectedStock) {
    const s = selectedStock;
    const pl = s.change >= 0;
    const sig = s.latestSignal;

    const useIntraday = chartRange === '1d' && intradayBars;
    const interval = useIntraday ? intradayBars.interval : '1d';
    const rawHistory = useIntraday ? intradayBars.history : (s.history || []);
    const chartData = historyToChartData(rawHistory, chartRange, interval);

    return (
      <div className="page stock-detail-view">
        {tradeToast && <div className="trade-toast">{tradeToast}</div>}
        {showTradeModal && (
          <TradeModal
            stock={s}
            onClose={() => setShowTradeModal(false)}
            onTraded={(side, qty) => {
              invalidatePortfolioCache();
              showToast(`✓ ${side} ${qty} shares of ${s.displayTicker}`);
            }}
          />
        )}
        {showPriceAlertModal && (
          <PriceAlertModal
            stock={s}
            onClose={() => setShowPriceAlertModal(false)}
            onCreated={(alert) => {
              setStockAlerts((prev) => [alert, ...prev]);
              showToast(`✓ Price alert set for ${s.displayTicker}`);
            }}
          />
        )}

        <button className="stock-back" onClick={() => setSearchParams({})}>← Back to Stocks</button>
        <div className="card">
          <div className="stock-info-bar">
            <div>
              <h2>{s.displayTicker}</h2>
              <div style={{ fontSize: '.82rem', color: 'var(--text2)' }}>{s.name} · {s.sector}</div>
            </div>
            <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div>
                <div className={`price mono ${pl ? 'positive' : 'negative'}`}>₹{s.price.toFixed(2)}</div>
                <div className={`mono ${pl ? 'positive' : 'negative'}`} style={{ fontSize: '.9rem' }}>
                  {pl ? '+' : ''}₹{s.change?.toFixed(2)} ({pl ? '+' : ''}{s.changePct?.toFixed(2)}%)
                </div>
              </div>
              <button
                type="button"
                className={`btn btn-sm ${stockAlerts.length ? 'btn-primary' : ''}`}
                title={stockAlerts.length ? `${stockAlerts.length} active alert(s)` : 'Set price alert'}
                onClick={() => setShowPriceAlertModal(true)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Bell size={16} />
                {stockAlerts.length > 0 ? stockAlerts.length : 'Alert'}
              </button>
              <button className="btn btn-primary" onClick={() => setShowTradeModal(true)}>Trade</button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '12px', fontSize: '.82rem', color: 'var(--text2)' }}>
            {s.pe && <span>P/E: <strong>{s.pe.toFixed(1)}</strong></span>}
            {s.high52 && <span>52W H: <strong className="mono">₹{s.high52.toFixed(0)}</strong></span>}
            {s.low52 && <span>52W L: <strong className="mono">₹{s.low52.toFixed(0)}</strong></span>}
            {s.volume && <span>Vol: <strong>{(s.volume / 1000000).toFixed(1)}M</strong></span>}
          </div>

          <ChartRangeSelector value={chartRange} onChange={setChartRange} className="chart-range-bar" />
          <ChartTypeSelector
            value={chartType}
            onChange={setChartType}
            showVolume={showVolume}
            onVolumeToggle={setShowVolume}
            className="chart-range-bar"
          />
          <div className="stock-chart-panel" style={{ height: 280 }}>
            {chartLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text3)' }}>
                Updating chart...
              </div>
            ) : chartData.length > 0 ? (
              <MarketChart
                data={chartData}
                height={280}
                chartType={chartType}
                showVolume={showVolume}
                interval={interval === 'intraday' ? 'intraday' : '1d'}
                chartKey={`${chartRange}-${chartData.length}-${chartType}`}
              />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text3)', textAlign: 'center', padding: '0 12px' }}>
                No chart rows in the database for this ticker yet. From the project root run:{' '}
                <code style={{ marginLeft: '4px', fontSize: '0.75rem' }}>docker compose exec core-api npm run import-history</code>
                {' '}to load ~2 years of OHLC from Yahoo, or re-seed:{' '}
                <code style={{ fontSize: '0.75rem' }}>docker compose exec core-api npm run seed</code>
              </div>
            )}
          </div>
        </div>

        {/* Sentiment Meter */}
        <div className="card" style={{ marginTop: '16px' }}>
          <div className="card-title">Community Sentiment</div>
          {sentiment && (
            <>
              <div className="sentiment-meter">
                <div className="sentiment-bar">
                  <div className="sentiment-fill bullish" style={{ width: `${sentiment.bullish}%` }} />
                  <div className="sentiment-fill neutral" style={{ width: `${sentiment.neutral}%` }} />
                  <div className="sentiment-fill bearish" style={{ width: `${sentiment.bearish}%` }} />
                </div>
                <div className="sentiment-labels">
                  <span className="sentiment-label positive">🟢 Bullish {sentiment.bullish}%</span>
                  <span className="sentiment-label" style={{ color: 'var(--text3)' }}>⚪ Neutral {sentiment.neutral}%</span>
                  <span className="sentiment-label negative">🔴 Bearish {sentiment.bearish}%</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                {['bullish', 'neutral', 'bearish'].map((v) => (
                  <button
                    key={v}
                    className={`btn btn-sm ${sentiment.userVote === v ? 'btn-primary' : ''}`}
                    onClick={() => handleSentimentVote(v)}
                    style={{ flex: 1 }}
                  >
                    {v === 'bullish' ? '🟢 Bullish' : v === 'neutral' ? '⚪ Neutral' : '🔴 Bearish'}
                  </button>
                ))}
              </div>
              {sentiment.total > 0 && (
                <div style={{ fontSize: '0.75rem', color: 'var(--text3)', marginTop: '8px' }}>
                  Based on {sentiment.total} community votes
                </div>
              )}
            </>
          )}
        </div>

        {/* Signal */}
        {sig && (
          <div className="analysis-grid mt-4">
            <div className="ai-card">
              <div className="card-title">
                Signal: <span className={sig.verdict === 'BUY' ? 'positive' : sig.verdict === 'SELL' ? 'negative' : ''}>
                  {sig.verdict}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text3)', marginLeft: '8px' }}>
                  {sig.confidence}% confidence
                </span>
              </div>
              <div className="conf-bar" style={{ marginBottom: '8px' }}>
                <div className="conf-bar-fill" style={{ width: `${sig.confidence}%` }} />
              </div>
              <p style={{ fontSize: '.85rem', color: 'var(--text2)', lineHeight: 1.6 }}>{sig.reasoning}</p>
              {sig.rsi && (
                <div style={{ display: 'flex', gap: '16px', marginTop: '8px', fontSize: '0.78rem', color: 'var(--text3)' }}>
                  <span>RSI: <strong>{sig.rsi?.toFixed(1)}</strong></span>
                  <span>MACD: <strong>{sig.macd?.toFixed(3)}</strong></span>
                </div>
              )}
            </div>
            <div className="card">
              <div className="card-title">Trade Reasoning from Community</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text2)' }}>
                <p>Recent community trades in <strong>{s.displayTicker}</strong> show{' '}
                {sentiment?.verdict === 'Bullish' ? 'bullish' : sentiment?.verdict === 'Bearish' ? 'bearish' : 'mixed'} sentiment.
                </p>
                <p style={{ marginTop: '8px' }}>
                  Use the Trade button above to place a virtual trade. Add a reason to contribute to collective intelligence!
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  let filteredStocks = stocksData.filter((s) =>
    (s.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (s.displayTicker || s.ticker || '').toLowerCase().includes(searchQuery.toLowerCase())
  );
  if (filter === 'watchlist') {
    filteredStocks = filteredStocks.filter((s) => watchlist.includes(s.ticker));
  }

  return (
    <div className="page">
      <h1 className="page-title">Stocks</h1>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          className="stocks-search"
          placeholder={`Search ${stocksData.length} stocks...`}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ flex: 1, marginBottom: 0 }}
        />
        <div className="forum-tabs">
          <button className={`forum-tab ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>All</button>
          <button className={`forum-tab ${filter === 'watchlist' ? 'active' : ''}`} onClick={() => setFilter('watchlist')}>★ Watchlist</button>
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          {loading ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text3)' }}>Loading stocks...</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th></th><th>Ticker</th><th>Company</th><th>Price</th><th>Change</th><th>Sector</th><th>Signal</th>
                </tr>
              </thead>
              <tbody>
                {filteredStocks.map((s) => {
                  const isW = watchlist.includes(s.ticker);
                  const pl = s.changePct >= 0;
                  const sig = s.latestSignal;
                  return (
                    <tr key={s.ticker} onClick={() => setSearchParams({ ticker: s.ticker })}>
                      <td onClick={(e) => e.stopPropagation()}>
                        <button className={`watchlist-star ${isW ? 'active' : ''}`} onClick={(e) => toggleWatchlist(s.ticker, s.id, e)}>
                          {isW ? '★' : '☆'}
                        </button>
                      </td>
                      <td className="mono" style={{ fontWeight: 700 }}>{s.displayTicker || s.ticker}</td>
                      <td>{s.name}</td>
                      <td className="mono">₹{s.price.toFixed(2)}</td>
                      <td className={`mono ${pl ? 'positive' : 'negative'}`}>
                        {pl ? '+' : ''}{s.changePct?.toFixed(2)}%
                      </td>
                      <td><span className="badge badge-gray">{s.sector || 'Unknown'}</span></td>
                      <td>
                        {sig ? (
                          <span className={`badge ${sig.verdict === 'BUY' ? 'badge-green' : sig.verdict === 'SELL' ? 'badge-red' : 'badge-gray'}`}>
                            {sig.verdict} {sig.confidence}%
                          </span>
                        ) : (
                          <span className={`badge ${pl ? 'badge-green' : 'badge-red'}`}>{pl ? 'BUY' : 'SELL'}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default Stocks;
