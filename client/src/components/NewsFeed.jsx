import { useNavigate } from 'react-router-dom';

import { APP_BASE } from '../constants/routes';

function sentimentClass(s) {
  const v = (s || '').toLowerCase();
  if (v.includes('bull') || v === 'positive') return 'news-sentiment-bull';
  if (v.includes('bear') || v === 'negative') return 'news-sentiment-bear';
  return 'news-sentiment-neutral';
}

function sentimentLabel(s) {
  const v = (s || 'neutral').toLowerCase();
  if (v.includes('bull') || v === 'positive') return 'Bullish';
  if (v.includes('bear') || v === 'negative') return 'Bearish';
  return 'Neutral';
}

function timeAgo(date) {
  const seconds = Math.floor((Date.now() - new Date(date)) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export default function NewsFeed({ articles = [], loading = false, error = null, refreshMessage = null, onRefresh }) {
  const navigate = useNavigate();

  return (
    <div className="news-feed">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', gap: '8px' }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--text3)' }}>Live market headlines</span>
        {onRefresh && (
          <button type="button" className="lb-tab" onClick={onRefresh} disabled={loading}>
            {loading ? 'Fetching…' : 'Refresh'}
          </button>
        )}
      </div>

      {error && <div className="news-feed-error">{error}</div>}
      {!error && refreshMessage && (
        <div style={{ padding: '8px 12px', marginBottom: '8px', fontSize: '0.82rem', color: 'var(--text2)', background: 'var(--bg2)', borderRadius: '8px' }}>
          {refreshMessage}
        </div>
      )}

      {loading && articles.length === 0 ? (
        <div style={{ padding: '16px', color: 'var(--text3)', fontSize: '0.85rem' }}>Loading market news…</div>
      ) : articles.length === 0 ? (
        <div style={{ padding: '16px', color: 'var(--text3)', fontSize: '0.85rem' }}>
          No headlines yet — tap Refresh or check back shortly.
        </div>
      ) : (
        articles.map((a) => (
          <article key={a.id} className="news-item">
            <div className="news-item-header">
              <span className={`news-sentiment ${sentimentClass(a.sentiment)}`}>{sentimentLabel(a.sentiment)}</span>
              <span className="news-source">{a.source}</span>
              <span className="news-time">{timeAgo(a.publishedAt)}</span>
            </div>
            <h4 className="news-title">
              <a href={a.url} target="_blank" rel="noopener noreferrer">{a.title}</a>
            </h4>
            {(a.summary || a.description) && (
              <p className="news-summary">{a.summary || a.description}</p>
            )}
            {a.tickers?.length > 0 && (
              <div className="news-tickers">
                {a.tickers.slice(0, 4).map((t) => (
                  <button
                    key={t}
                    type="button"
                    className="news-ticker-chip mono"
                    onClick={() => navigate(`${APP_BASE}/stocks?ticker=${encodeURIComponent(t)}`)}
                  >
                    {t.replace(/\.NS$|\.BO$/i, '')}
                  </button>
                ))}
              </div>
            )}
          </article>
        ))
      )}
    </div>
  );
}
