import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../api/client';
import useStore from '../store';
import {
  getPortfolioCache,
  isPortfolioFresh,
  isTradeHistoryFresh,
  setPortfolioCache,
} from '../utils/appCache';
import HoldingTickerMenu from '../components/HoldingTickerMenu';
import { APP_BASE } from '../constants/routes';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const SECTOR_COLORS = ['#2563eb', '#16a34a', '#dc2626', '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

const Portfolio = () => {
  const navigate = useNavigate();
  const user = useStore((state) => state.user);
  const askFinBot = useStore((state) => state.askFinBot);
  const portCache = getPortfolioCache();
  const [holdings, setHoldings] = useState(
    isPortfolioFresh(user?.id) ? (portCache.data?.holdings || []) : [],
  );
  const [loading, setLoading] = useState(!isPortfolioFresh(user?.id));
  const [portfolioData, setPortfolioData] = useState(
    isPortfolioFresh(user?.id) ? portCache.data : null,
  );
  const [optimizeResult, setOptimizeResult] = useState(null);
  const [optimizeMeta, setOptimizeMeta] = useState(null);
  const [optimizing, setOptimizing] = useState(false);
  const [tradeHistory, setTradeHistory] = useState(
    isTradeHistoryFresh(user?.id) ? portCache.tradeHistory : [],
  );
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    const silent = isPortfolioFresh(user?.id);
    if (!silent) setLoading(true);

    apiClient.get('/portfolio').then((res) => {
      setPortfolioData(res.data);
      setHoldings(res.data.holdings || []);
      setPortfolioCache({ data: res.data, userId: user?.id });
    }).catch(() => {}).finally(() => setLoading(false));

    if (!isTradeHistoryFresh(user?.id)) {
      apiClient.get('/trades/history').then((r) => {
        setTradeHistory(r.data);
        setPortfolioCache({ tradeHistory: r.data, userId: user?.id });
      }).catch(() => {});
    }
  }, [user?.id]);

  const handleViewCharts = useCallback((ticker) => {
    navigate(`${APP_BASE}/stocks?ticker=${encodeURIComponent(ticker)}`);
  }, [navigate]);

  const handleAiOverview = useCallback((h) => {
    const name = h.name || h.displayTicker || h.ticker;
    const pnlSign = h.pnl >= 0 ? '+' : '';
    const prompt = [
      `Give a concise overview of ${name} (${h.ticker}) for an Indian equity investor.`,
      `I hold ${h.qty} shares at avg cost ₹${h.avg?.toFixed(2)}, LTP ₹${h.ltp?.toFixed(2)}, sector ${h.sector || 'Unknown'}.`,
      `Current P&L: ${pnlSign}₹${h.pnl?.toFixed(2)} (${pnlSign}${h.pnlPct?.toFixed(2)}%).`,
      'Cover business context, recent price action, key risks, and whether the holding size seems reasonable.',
    ].join(' ');
    askFinBot(prompt);
  }, [askFinBot]);

  const handleTradeHistoryToggle = () => {
    if (showHistory) {
      setShowHistory(false);
      return;
    }
    setShowHistory(true);
    window.setTimeout(() => {
      document.getElementById('portfolioTradeHistory')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  const handleOptimize = async () => {
    setOptimizing(true);
    setOptimizeMeta(null);
    setOptimizeResult(null);
    try {
      const r = await apiClient.post('/portfolio/optimize');
      if (r.data.error) {
        alert(r.data.error);
        return;
      }
      setOptimizeMeta({ mode: r.data.mode, optimization: r.data.optimization });
      setOptimizeResult(r.data.optimizedPortfolio || []);
    } catch (err) {
      const msg = err.response?.data?.error || 'Optimization service unavailable';
      alert(msg);
    } finally {
      setOptimizing(false);
    }
  };

  const balance = portfolioData?.balance ?? user?.virtualBalance ?? 1000000;
  const totalPnl = portfolioData?.totalPnl ?? 0;
  const returnsPct = portfolioData?.totalInvested > 0
    ? ((totalPnl / portfolioData.totalInvested) * 100).toFixed(2)
    : '0.00';

  // Sector allocation for pie chart
  const sectorData = holdings.reduce((acc, h) => {
    const sector = h.sector || 'Other';
    const val = h.currentValue || 0;
    const existing = acc.find((s) => s.name === sector);
    if (existing) existing.value += val;
    else acc.push({ name: sector, value: val });
    return acc;
  }, []);

  return (
    <div className="page">
      <h1 className="page-title">Portfolio</h1>

      <div className="port-summary">
        <div className="card port-stat">
          <div className="val mono">₹{(balance / 100000).toFixed(2)}L</div>
          <div className="lbl">Virtual Balance</div>
        </div>
        <div className="card port-stat">
          <div className={`val mono ${totalPnl >= 0 ? 'positive' : 'negative'}`}>
            {totalPnl >= 0 ? '+' : ''}₹{totalPnl.toFixed(0)}
          </div>
          <div className="lbl">Total P&L</div>
        </div>
        <div className="card port-stat">
          <div className={`val mono ${parseFloat(returnsPct) >= 0 ? 'positive' : 'negative'}`}>
            {parseFloat(returnsPct) >= 0 ? '+' : ''}{returnsPct}%
          </div>
          <div className="lbl">Returns</div>
        </div>
        <div className="card port-stat">
          <div className="val">{holdings.length}</div>
          <div className="lbl">Holdings</div>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: '20px' }}>
        {/* Holdings Table */}
        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
            Current Holdings
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" className="btn btn-sm" onClick={handleTradeHistoryToggle}>
                {showHistory ? 'Hide' : 'Show'} Trade History
              </button>
              <button className="btn btn-primary btn-sm" onClick={handleOptimize} disabled={optimizing || holdings.length === 0}>
                {optimizing ? 'Optimizing...' : '⚡ Optimize Portfolio'}
              </button>
            </div>
          </div>

          {loading ? (
            <p style={{ padding: '20px', color: 'var(--text2)' }}>Loading portfolio...</p>
          ) : holdings.length === 0 ? (
            <p style={{ padding: '20px', color: 'var(--text2)' }}>
              No holdings yet. Go to <strong>Stocks</strong> and make your first trade!
            </p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr><th>Ticker</th><th>Sector</th><th>Qty</th><th>Avg Cost</th><th>LTP</th><th>Current Val</th><th>P&L</th><th>P&L %</th></tr>
                </thead>
                <tbody>
                  {holdings.map((h) => (
                    <tr key={h.ticker}>
                      <td className="holding-ticker-cell">
                        <HoldingTickerMenu
                          holding={h}
                          onAiOverview={handleAiOverview}
                          onViewCharts={handleViewCharts}
                        />
                      </td>
                      <td><span className="badge badge-gray">{h.sector}</span></td>
                      <td>{h.qty}</td>
                      <td className="mono">₹{h.avg?.toFixed(2)}</td>
                      <td className="mono">₹{h.ltp?.toFixed(2)}</td>
                      <td className="mono">₹{h.currentValue?.toFixed(2)}</td>
                      <td className={`mono ${h.pnl >= 0 ? 'positive' : 'negative'}`}>
                        {h.pnl >= 0 ? '+' : ''}₹{h.pnl?.toFixed(2)}
                      </td>
                      <td className={`mono ${h.pnlPct >= 0 ? 'positive' : 'negative'}`}>
                        {h.pnlPct >= 0 ? '+' : ''}{h.pnlPct?.toFixed(2)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Sector Pie + Optimizer */}
      {(sectorData.length > 0 || optimizeResult) && (
        <div className="portfolio-insights-grid">
          {sectorData.length > 0 && (
            <div className="card portfolio-sector-card">
              <div className="card-title">Sector Allocation</div>
              <div className="portfolio-sector-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={sectorData} cx="50%" cy="50%" outerRadius={80} dataKey="value" nameKey="name">
                      {sectorData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={SECTOR_COLORS[index % SECTOR_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {optimizeResult && (
            <div className="card portfolio-optimize-card">
              <div className="card-title portfolio-optimize-title">
                AI portfolio optimization
                {optimizeMeta?.mode === 'ml_max_sharpe' && (
                  <span className="badge badge-green" title="ML-informed weights toward maximum Sharpe, using roughly two years of daily prices">
                    ML · max Sharpe
                  </span>
                )}
              </div>
              {optimizeMeta?.optimization && (
                <p className="portfolio-optimize-meta">
                  Portfolio Sharpe {optimizeMeta.optimization.sharpeRatio} · expected return{' '}
                  {(optimizeMeta.optimization.portfolioExpectedReturn * 100).toFixed(1)}% · vol{' '}
                  {(optimizeMeta.optimization.portfolioVolatility * 100).toFixed(1)}% ·{' '}
                  {optimizeMeta.optimization.historyDays} trading days of history
                </p>
              )}
              <div className="portfolio-optimize-scroll">
                {optimizeResult.map((item) => (
                  <div key={item.ticker} className="opt-item">
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span className="ticker mono">{item.ticker?.replace('.NS', '')}</span>
                      <span className={`action ${item.action === 'BUY' ? 'positive' : item.action === 'SELL' ? 'negative' : ''}`} style={{ fontWeight: 700, fontSize: '0.82rem' }}>
                        {item.action}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text3)', margin: '4px 0' }}>
                      Current: {item.currentAlloc}% → Target: {item.targetAlloc}%
                    </div>
                    <div className="reason">{item.reason}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Trade History */}
      {showHistory && (
        <div id="portfolioTradeHistory" className="card portfolio-trade-history">
          <div className="card-title">Trade History</div>
          {tradeHistory.length === 0 ? (
            <p style={{ padding: '12px', color: 'var(--text2)' }}>No trades yet.</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr><th>Date</th><th>Stock</th><th>Side</th><th>Qty</th><th>Price</th><th>Total</th><th>Reason</th></tr>
                </thead>
                <tbody>
                  {tradeHistory.map((t) => (
                    <tr key={t.id}>
                      <td style={{ fontSize: '0.78rem' }}>{new Date(t.timestamp).toLocaleDateString('en-IN')}</td>
                      <td className="mono" style={{ fontWeight: 700 }}>{t.stock?.displayTicker}</td>
                      <td><span className={`badge ${t.side === 'BUY' ? 'badge-green' : 'badge-red'}`}>{t.side}</span></td>
                      <td>{t.quantity}</td>
                      <td className="mono">₹{t.executionPrice?.toFixed(2)}</td>
                      <td className="mono">₹{t.totalValue?.toFixed(2)}</td>
                      <td style={{ fontSize: '0.78rem', color: 'var(--text3)' }}>{t.reason || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Portfolio;
