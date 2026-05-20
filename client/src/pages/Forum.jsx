import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../api/client';
import useStore from '../store';
import { getForumListCache, isForumListFresh, setForumListCache } from '../utils/appCache';
import { APP_BASE } from '../constants/routes';

const Forum = () => {
  const navigate = useNavigate();
  const user = useStore((s) => s.user);
  const forumCache = getForumListCache();
  const [questions, setQuestions] = useState(
    isForumListFresh(user?.id) ? forumCache.questions : [],
  );
  const [loading, setLoading] = useState(!isForumListFresh(user?.id));
  const [showAskForm, setShowAskForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newTags, setNewTags] = useState('');
  const [filter, setFilter] = useState('recent');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!isForumListFresh(user?.id)) setLoading(true);
    apiClient.get('/forum').then((res) => {
      const list = res.data;
      setQuestions(list);
      setForumListCache(list, user?.id);
    }).catch(() => {
      if (!isForumListFresh(user?.id)) {
        setQuestions([
          { id: '1', title: 'How do I read a candlestick chart?', body: 'Just starting out...', tags: ['Beginner'], votes: 42, views: 104, _count: { answers: 2 }, user: { username: 'arjun99' }, createdAt: new Date().toISOString() },
          { id: '2', title: 'What is the impact of Fed rate cuts on IT sector?', body: 'Curious about TCS...', tags: ['Macro', 'IT'], votes: 28, views: 76, _count: { answers: 1 }, user: { username: 'priya_m' }, createdAt: new Date().toISOString() },
        ]);
      }
    }).finally(() => setLoading(false));
  }, [user?.id]);

  const handleAskQuestion = async (e) => {
    e.preventDefault();
    try {
      const res = await apiClient.post('/forum', {
        title: newTitle,
        body: newBody,
        tags: newTags.split(',').map((t) => t.trim()).filter(Boolean),
      });
      setQuestions((prev) => {
        const next = [res.data, ...prev];
        setForumListCache(next, user?.id);
        return next;
      });
      setShowAskForm(false);
      setNewTitle(''); setNewBody(''); setNewTags('');
    } catch {
      alert('Failed to post question. Are you logged in?');
    }
  };

  const handleVote = async (id, direction, e) => {
    e.stopPropagation();
    try {
      const r = await apiClient.post(`/forum/${id}/vote`, { direction });
      setQuestions((prev) => {
        const next = prev.map((q) => (q.id === id ? { ...q, votes: r.data.votes } : q));
        setForumListCache(next, user?.id);
        return next;
      });
    } catch {
      /* ignore vote failure */
    }
  };

  const timeAgo = (date) => {
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  // All unique tags
  const allTags = [...new Set(questions.flatMap((q) => q.tags || []))].slice(0, 20);

  let filtered = [...questions];
  if (searchQuery) filtered = filtered.filter((q) => q.title.toLowerCase().includes(searchQuery.toLowerCase()) || (q.tags || []).some((t) => t.toLowerCase().includes(searchQuery.toLowerCase())));
  if (filter === 'top') filtered.sort((a, b) => b.votes - a.votes);
  else if (filter === 'unanswered') filtered = filtered.filter((q) => (q._count?.answers || 0) === 0);

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: 0 }}>Q&A Forum</h1>
          <p style={{ color: 'var(--text2)', fontSize: '0.85rem' }}>Stack Overflow for Indian investors</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAskForm(!showAskForm)}>
          {showAskForm ? 'Cancel' : '+ Ask Question'}
        </button>
      </div>

      {showAskForm && (
        <div className="card" style={{ marginBottom: '20px', padding: '20px' }}>
          <form onSubmit={handleAskQuestion}>
            <div className="form-group">
              <label className="form-label">Question Title</label>
              <input className="form-input" type="text" placeholder="What's your investing question?" required
                value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Details</label>
              <textarea className="form-input" placeholder="Explain your question in detail..." rows="4" required
                value={newBody} onChange={(e) => setNewBody(e.target.value)} style={{ resize: 'vertical' }} />
            </div>
            <div className="form-group">
              <label className="form-label">Tags (comma separated)</label>
              <input className="form-input" type="text" placeholder="Banking, Fundamental, Options"
                value={newTags} onChange={(e) => setNewTags(e.target.value)} />
            </div>
            <button className="btn btn-primary" type="submit">Post Question</button>
          </form>
        </div>
      )}

      <div className="forum-layout" style={{ display: 'flex', gap: '24px' }}>
        <div style={{ flex: 1 }}>
          {/* Search + Filters */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <input
              className="form-input"
              style={{ flex: 1, marginBottom: 0 }}
              placeholder="Search questions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <div className="forum-tabs">
              <button className={`forum-tab ${filter === 'recent' ? 'active' : ''}`} onClick={() => setFilter('recent')}>Recent</button>
              <button className={`forum-tab ${filter === 'top' ? 'active' : ''}`} onClick={() => setFilter('top')}>Top Voted</button>
              <button className={`forum-tab ${filter === 'unanswered' ? 'active' : ''}`} onClick={() => setFilter('unanswered')}>Unanswered</button>
            </div>
          </div>

          {loading ? (
            <p style={{ color: 'var(--text2)' }}>Loading questions...</p>
          ) : filtered.map((q) => (
            <div key={q.id} className="card forum-q-card" style={{ marginBottom: '12px', padding: '16px', cursor: 'pointer' }}
              onClick={() => navigate(`${APP_BASE}/forum/${q.id}`)}>
              <div style={{ display: 'flex', gap: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', minWidth: '48px' }}>
                  <button className="feed-btn" onClick={(e) => handleVote(q.id, 1, e)}>▲</button>
                  <span style={{ fontWeight: 700, fontSize: '1rem' }}>{q.votes || 0}</span>
                  <button className="feed-btn" onClick={(e) => handleVote(q.id, -1, e)}>▼</button>
                  <div className={`answers-count ${q._count?.answers > 0 ? 'has-accepted' : ''}`}>
                    {q._count?.answers || 0}A
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <h3 className="question-title">{q.title}</h3>
                  <p style={{ color: 'var(--text2)', fontSize: '0.85rem', marginBottom: '10px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {q.body}
                  </p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {(q.tags || []).map((t) => <span key={t} className="question-tag">{t}</span>)}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text3)' }}>
                      {q.views || 0} views · asked by <strong>{q.user?.username || 'Anonymous'}</strong> · {timeAgo(q.createdAt)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {filtered.length === 0 && !loading && (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text3)' }}>
              No questions found. Be the first to ask!
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div style={{ width: '260px', flexShrink: 0 }}>
          <div className="card" style={{ marginBottom: '16px' }}>
            <h3 style={{ marginBottom: '12px', fontSize: '0.9rem', fontWeight: 700 }}>Popular Tags</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {allTags.map((t) => (
                <button key={t} className="question-tag" style={{ cursor: 'pointer', border: 'none' }}
                  onClick={() => setSearchQuery(t)}>
                  {t}
                </button>
              ))}
              {allTags.length === 0 && ['Beginner', 'Options', 'Macro', 'Banking', 'IT'].map((t) => (
                <span key={t} className="badge badge-gray">{t}</span>
              ))}
            </div>
          </div>
          <div className="card">
            <h3 style={{ marginBottom: '8px', fontSize: '0.9rem', fontWeight: 700 }}>Forum Tips</h3>
            <ul style={{ fontSize: '0.82rem', color: 'var(--text2)', lineHeight: 1.7, paddingLeft: '16px' }}>
              <li>Click a question to see answers</li>
              <li>Use AI Suggest for instant answer drafts</li>
              <li>Vote up helpful answers</li>
              <li>Accept the best answer to help others</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Forum;
