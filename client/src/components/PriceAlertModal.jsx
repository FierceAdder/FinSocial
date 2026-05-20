import { useState } from 'react';
import apiClient from '../api/client';

const PriceAlertModal = ({ stock, onClose, onCreated }) => {
  const [targetPrice, setTargetPrice] = useState(
    stock?.price ? String(Math.round(stock.price)) : '',
  );
  const [direction, setDirection] = useState('ABOVE');
  const [frequency, setFrequency] = useState('ONCE');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await apiClient.post('/alerts', {
        stockId: stock.id,
        targetPrice: parseFloat(targetPrice),
        direction,
        frequency,
      });
      onCreated?.(res.data);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create alert');
    } finally {
      setLoading(false);
    }
  };

  const dirHint =
    direction === 'ABOVE'
      ? 'Notify when price rises to or above your target'
      : 'Notify when price falls to or below your target';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <button type="button" className="modal-close" onClick={onClose}>✕</button>
        <h3 style={{ marginBottom: '8px' }}>Price alert — {stock.displayTicker}</h3>
        <p style={{ fontSize: '0.82rem', color: 'var(--text2)', marginBottom: '16px' }}>
          Current price: <span className="mono">₹{stock.price?.toFixed(2)}</span>.
          Alerts check on quote refresh (~every 5 min). You will get an in-app notification and email.
        </p>

        {error && (
          <div style={{ color: 'var(--red)', marginBottom: '12px', fontSize: '0.85rem' }}>{error}</div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Target price (₹)</label>
            <input
              className="form-input"
              type="number"
              min="0.01"
              step="0.01"
              value={targetPrice}
              onChange={(e) => setTargetPrice(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Condition</label>
            <div className="trade-tabs">
              <button
                type="button"
                className={`trade-tab ${direction === 'ABOVE' ? 'active' : ''}`}
                onClick={() => setDirection('ABOVE')}
              >
                At or above
              </button>
              <button
                type="button"
                className={`trade-tab ${direction === 'BELOW' ? 'active' : ''}`}
                onClick={() => setDirection('BELOW')}
              >
                At or below
              </button>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text3)', marginTop: '6px' }}>{dirHint}</p>
          </div>

          <div className="form-group">
            <label className="form-label">Frequency</label>
            <div className="trade-tabs">
              <button
                type="button"
                className={`trade-tab ${frequency === 'ONCE' ? 'active' : ''}`}
                onClick={() => setFrequency('ONCE')}
              >
                Once
              </button>
              <button
                type="button"
                className={`trade-tab ${frequency === 'EVERY' ? 'active' : ''}`}
                onClick={() => setFrequency('EVERY')}
              >
                Every time
              </button>
            </div>
          </div>

          <button
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '8px' }}
            type="submit"
            disabled={loading}
          >
            {loading ? 'Saving...' : 'Create alert'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default PriceAlertModal;
