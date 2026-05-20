import { useState, useEffect } from 'react';
import apiClient from '../api/client';
import MarketChart from '../components/MarketChart';
import ChartRangeSelector from '../components/ChartRangeSelector';
import ChartTypeSelector from '../components/ChartTypeSelector';
import { DEFAULT_CHART_TYPE } from '../constants/chartTypes';
import { historyToChartData, sliceHistoryForRange } from '../utils/chartHistory';

const Hindsight = () => {
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTicker, setSelectedTicker] = useState('RELIANCE.NS');
  const [history, setHistory] = useState([]);
  const [tradeDate, setTradeDate] = useState(null);
  const [tradeSide, setTradeSide] = useState('BUY');
  const [tradeQty, setTradeQty] = useState(10);
  const [tradePrice, setTradePrice] = useState(null);
  const [currentPrice, setCurrentPrice] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tickers, setTickers] = useState([]);
  const [chartRange, setChartRange] = useState('1y');
  const [historyInterval, setHistoryInterval] = useState('1d');
  const [chartType, setChartType] = useState(DEFAULT_CHART_TYPE);
  const [showVolume, setShowVolume] = useState(true);

  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() - 1);
  const minDate = new Date();
  minDate.setFullYear(minDate.getFullYear() - 2);

  useEffect(() => {
    apiClient.get('/stocks').then((r) => {
      setTickers(r.data.map((s) => ({ ticker: s.ticker, display: s.displayTicker, currentPrice: s.price })));
    }).catch(() => {});
  }, []);

  const loadHistory = async () => {
    setLoading(true);
    setResult(null);
    try {
      const r = await apiClient.get(`/stocks/${encodeURIComponent(selectedTicker)}`, { params: { range: '2y' } });
      setHistoryInterval(r.data.historyInterval || '1d');
      const hist = r.data.history || [];

      const filtered = hist.filter((d) => {
        const dateStr = new Date(d.date).toISOString().split('T')[0];
        return dateStr <= selectedDate;
      });

      setHistory(filtered.map((d) => ({
        ...d,
        dateStr: new Date(d.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }),
      })));

      const selectedEntry = hist.find((d) => {
        const dateStr = new Date(d.date).toISOString().split('T')[0];
        return dateStr === selectedDate;
      });

      setTradeDate(selectedEntry || filtered[filtered.length - 1]);
      setTradePrice(selectedEntry?.close || filtered[filtered.length - 1]?.close);

      const latest = tickers.find((t) => t.ticker === selectedTicker);
      setCurrentPrice(latest?.currentPrice || r.data.price);
    } catch {
      alert('Failed to load history for this stock');
    } finally {
      setLoading(false);
    }
  };

  const calculateResult = () => {
    if (!tradePrice || !currentPrice || tradeQty <= 0) return;
    const invested = tradePrice * tradeQty;
    if (invested === 0) return;
    const currentVal = currentPrice * tradeQty;
    const pnl = tradeSide === 'BUY' ? currentVal - invested : invested - currentVal;
    const pnlPct = ((pnl / invested) * 100).toFixed(2);
    const daysBetween = Math.max(1, Math.floor((new Date() - new Date(selectedDate)) / (1000 * 60 * 60 * 24)));

    const growthFactor = Math.abs(pnl) / invested + 1;
    const annualized = daysBetween >= 1
      ? ((Math.pow(growthFactor, 365 / daysBetween) - 1) * 100 * (pnl >= 0 ? 1 : -1)).toFixed(1)
      : pnlPct;

    setResult({
      invested: invested.toFixed(2),
      currentVal: currentVal.toFixed(2),
      pnl: pnl.toFixed(2),
      pnlPct,
      daysBetween,
      annualized,
    });
  };

  const displayTicker = selectedTicker?.replace('.NS', '');
  const rangedHistory = sliceHistoryForRange(history, chartRange, selectedDate);
  const chartData = historyToChartData(rangedHistory, chartRange, historyInterval);

  const tradeMarkIdx =
    tradeDate && selectedDate
      ? rangedHistory.findIndex((d) => new Date(d.date).toISOString().split('T')[0] === selectedDate)
      : -1;

  return (
    <div className="page fade-in">
      <div style={{ marginBottom: '16px' }}>
        <h1 className="page-title">Hindsight</h1>
        <p style={{ color: 'var(--text2)', fontSize: '0.9rem', marginTop: '4px' }}>
          Replay a past date and see how a virtual trade would have performed today.
        </p>
      </div>

      <div className="grid-2">
        <div className="card" style={{ padding: '20px' }}>
          <div className="card-title">Configure scenario</div>
          <div className="form-group">
            <label className="form-label">Stock</label>
            <select className="form-input" value={selectedTicker} onChange={(e) => setSelectedTicker(e.target.value)}>
              {tickers.length > 0 ? tickers.map((t) => (
                <option key={t.ticker} value={t.ticker}>{t.display} — ₹{t.currentPrice?.toFixed(0)}</option>
              )) : (
                ['RELIANCE.NS', 'TCS.NS', 'HDFCBANK.NS', 'INFY.NS', 'SBIN.NS'].map((t) => (
                  <option key={t} value={t}>{t.replace('.NS', '')}</option>
                ))
              )}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Pick a past date</label>
            <input
              className="form-input"
              type="date"
              value={selectedDate}
              min={minDate.toISOString().split('T')[0]}
              max={maxDate.toISOString().split('T')[0]}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
          </div>
          <button
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '4px' }}
            onClick={loadHistory}
            disabled={!selectedDate || !selectedTicker || loading}
          >
            {loading ? 'Loading history...' : 'Load historical view'}
          </button>
        </div>

        {tradeDate && (
          <div className="card" style={{ padding: '20px' }}>
            <div className="card-title">Place historical trade</div>
            <div style={{ marginBottom: '12px', padding: '12px', background: 'var(--blue-bg)', borderRadius: 'var(--radius)', fontSize: '0.85rem' }}>
              <div><strong>Price on {selectedDate}:</strong> <span className="mono">₹{tradePrice?.toFixed(2)}</span></div>
              <div><strong>Today's Price:</strong> <span className="mono">₹{currentPrice?.toFixed(2)}</span></div>
            </div>
            <div className="trade-tabs" style={{ marginBottom: '12px' }}>
              <button className={`trade-tab ${tradeSide === 'BUY' ? 'active' : ''}`} onClick={() => setTradeSide('BUY')}>BUY</button>
              <button className={`trade-tab ${tradeSide === 'SELL' ? 'active' : ''}`} onClick={() => setTradeSide('SELL')}>SELL</button>
            </div>
            <div className="form-group">
              <label className="form-label">Quantity</label>
              <input className="form-input" type="number" min="1" value={tradeQty} onChange={(e) => setTradeQty(parseInt(e.target.value))} />
            </div>
            <div className="trade-total">
              <span>Historical Investment</span>
              <strong className="mono">₹{(tradePrice * tradeQty)?.toFixed(2)}</strong>
            </div>
            <button className="btn btn-primary" style={{ width: '100%', marginTop: '12px' }} onClick={calculateResult}>
              Calculate performance
            </button>
          </div>
        )}
      </div>

      {result && (
        <div className={`card result-card ${parseFloat(result.pnl) >= 0 ? 'result-win' : 'result-loss'}`} style={{ marginTop: '20px', padding: '20px' }}>
          <div className="card-title">Hindsight result</div>
          <div className="result-grid">
            <div className="result-item">
              <div className="result-label">Invested ({selectedDate})</div>
              <div className="result-val mono">₹{result.invested}</div>
            </div>
            <div className="result-item">
              <div className="result-label">Value Today</div>
              <div className="result-val mono">₹{result.currentVal}</div>
            </div>
            <div className="result-item">
              <div className="result-label">P&L</div>
              <div className={`result-val mono ${parseFloat(result.pnl) >= 0 ? 'positive' : 'negative'}`} style={{ fontSize: '1.3rem', fontWeight: 800 }}>
                {parseFloat(result.pnl) >= 0 ? '+' : ''}₹{result.pnl}
              </div>
            </div>
            <div className="result-item">
              <div className="result-label">Returns</div>
              <div className={`result-val mono ${parseFloat(result.pnlPct) >= 0 ? 'positive' : 'negative'}`}>
                {parseFloat(result.pnlPct) >= 0 ? '+' : ''}{result.pnlPct}%
              </div>
            </div>
            <div className="result-item">
              <div className="result-label">Holding Period</div>
              <div className="result-val">{result.daysBetween} days</div>
            </div>
            <div className="result-item">
              <div className="result-label">Annualized Return</div>
              <div className={`result-val mono ${parseFloat(result.annualized) >= 0 ? 'positive' : 'negative'}`}>
                {parseFloat(result.annualized) >= 0 ? '+' : ''}{result.annualized}%
              </div>
            </div>
          </div>
          <div className="result-verdict">
            {parseFloat(result.pnlPct) > 20 ? '🚀 Outstanding! You would have crushed the market!' :
             parseFloat(result.pnlPct) > 10 ? '🎉 Great call! Solid returns on this trade.' :
             parseFloat(result.pnlPct) > 0 ? '✅ Modest gains. Better than keeping cash!' :
             parseFloat(result.pnlPct) > -10 ? '😐 Small loss. Market timing is tough!' :
             '📉 This one would have hurt. Keep learning!'}
          </div>
        </div>
      )}

      {chartData.length > 0 && (
        <div className="card" style={{ marginTop: '20px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
            <div className="card-title" style={{ margin: 0 }}>{displayTicker} — up to {selectedDate}</div>
            <ChartRangeSelector value={chartRange} onChange={setChartRange} />
          </div>
          <ChartTypeSelector
            value={chartType}
            onChange={setChartType}
            showVolume={showVolume}
            onVolumeToggle={setShowVolume}
            className="chart-range-bar"
          />
          <div style={{ height: 280 }}>
            <MarketChart
              data={chartData}
              height={280}
              chartType={chartType}
              showVolume={showVolume}
              interval={historyInterval === 'intraday' ? 'intraday' : '1d'}
              chartKey={`${chartRange}-${chartType}-${chartData.length}`}
              markIndex={tradeMarkIdx}
              markLabel="Trade day"
            />
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text3)', textAlign: 'center', marginTop: '8px' }}>
            Marker shows your simulated trade date
          </div>
        </div>
      )}
    </div>
  );
};

export default Hindsight;
