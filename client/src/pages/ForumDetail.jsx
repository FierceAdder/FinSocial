import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import apiClient from '../api/client';
import useStore from '../store';
import {
  getForumDetailCache,
  isForumDetailFresh,
  setForumDetailCache,
} from '../utils/appCache';
import { APP_BASE } from '../constants/routes';

const ForumDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useStore((s) => s.user);
  const cached = getForumDetailCache(id);
  const [question, setQuestion] = useState(
    isForumDetailFresh(id, user?.id) ? cached?.question ?? null : null,
  );
  const [loading, setLoading] = useState(!isForumDetailFresh(id, user?.id));
  const [answerBody, setAnswerBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState('');
  const [loadingAi, setLoadingAi] = useState(false);

  useEffect(() => {
    const silent = isForumDetailFresh(id, user?.id);
    if (!silent) setLoading(true);
    apiClient.get(`/forum/${id}`).then((r) => {
      setQuestion(r.data);
      setForumDetailCache(id, r.data);
    }).finally(() => setLoading(false));
  }, [id, user?.id]);

  const handleVoteQ = async (direction) => {
    try {
      const r = await apiClient.post(`/forum/${id}/vote`, { direction });
      setQuestion((prev) => ({ ...prev, votes: r.data.votes }));
    } catch {
      /* ignore */
    }
  };

  const handleVoteA = async (answerId, direction) => {
    try {
      const r = await apiClient.post(`/forum/answers/${answerId}/vote`, { direction });
      setQuestion((prev) => ({
        ...prev,
        answers: prev.answers.map((a) => a.id === answerId ? { ...a, votes: r.data.votes } : a),
      }));
    } catch {
      /* ignore */
    }
  };

  const handleAccept = async (answerId) => {
    try {
      const r = await apiClient.post(`/forum/answers/${answerId}/accept`);
      setQuestion((prev) => ({
        ...prev,
        answers: prev.answers.map((a) => a.id === answerId ? { ...a, isAccepted: r.data.isAccepted } : { ...a, isAccepted: false }),
      }));
    } catch {
      /* ignore */
    }
  };

  const handleSubmitAnswer = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const r = await apiClient.post(`/forum/${id}/answers`, { body: answerBody });
      setQuestion((prev) => {
        const next = { ...prev, answers: [...(prev.answers || []), r.data] };
        setForumDetailCache(id, next);
        return next;
      });
      setAnswerBody('');
    } catch {
      alert('Failed to post answer');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAiSuggest = async () => {
    setLoadingAi(true);
    try {
      const r = await apiClient.post(`/forum/${id}/ai-suggest`);
      setAiSuggestion(r.data.suggestion);
      setAnswerBody(r.data.suggestion);
    } catch {
      alert('AI suggestion unavailable');
    } finally {
      setLoadingAi(false);
    }
  };

  const timeAgo = (date) => {
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  if (loading) return <div className="page"><p style={{ color: 'var(--text2)' }}>Loading question...</p></div>;
  if (!question) return <div className="page"><p>Question not found.</p></div>;

  return (
    <div className="page">
      <button className="stock-back" onClick={() => navigate(`${APP_BASE}/forum`)}>← Back to Forum</button>

      {/* Question */}
      <div className="card question-detail" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', minWidth: '48px' }}>
            <button className="vote-btn vote-up" onClick={() => handleVoteQ(1)}>▲</button>
            <span className="vote-score">{question.votes}</span>
            <button className="vote-btn vote-down" onClick={() => handleVoteQ(-1)}>▼</button>
          </div>
          <div style={{ flex: 1 }}>
            <h2 className="question-detail-title">{question.title}</h2>
            <div className="question-detail-meta" style={{ marginBottom: '12px' }}>
              <span>Asked by <strong>{question.user?.username || 'Anonymous'}</strong></span>
              <span>{timeAgo(question.createdAt)}</span>
              <span>{question.views} views</span>
            </div>
            <div className="question-detail-tags">
              {(question.tags || []).map((t) => <span key={t} className="question-tag">{t}</span>)}
            </div>
            <div className="question-detail-body">{question.body}</div>
          </div>
        </div>
      </div>

      {/* Answers */}
      <div className="answers-section">
        <div className="answers-header">
          <h3>{question.answers?.length || 0} Answer{question.answers?.length !== 1 ? 's' : ''}</h3>
        </div>

        {(question.answers || []).map((a) => (
          <div key={a.id} className={`card answer-card ${a.isAccepted ? 'answer-accepted' : ''}`} style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', gap: '16px' }}>
              <div className="answer-vote-col">
                <button className="vote-btn vote-up" onClick={() => handleVoteA(a.id, 1)}>▲</button>
                <span className="vote-score">{a.votes}</span>
                <button className="vote-btn vote-down" onClick={() => handleVoteA(a.id, -1)}>▼</button>
                {a.isAccepted && <div className="accepted-check" title="Accepted answer">✓</div>}
                {question.userId === user?.id && !a.isAccepted && (
                  <button className="btn btn-sm" style={{ marginTop: '4px', fontSize: '0.7rem', color: 'var(--green)' }} onClick={() => handleAccept(a.id)}>
                    Accept
                  </button>
                )}
              </div>
              <div className="answer-body">
                <div className="answer-text">{a.body}</div>
                <div className="answer-meta">
                  <div className="answer-user">
                    <div className="answer-av">{a.user?.firstName?.[0]}</div>
                    <span>{a.user?.username || a.user?.firstName}</span>
                    {a.user?.isVerified && <span className="verified-badge">✓</span>}
                  </div>
                  <div className="answer-time">{timeAgo(a.createdAt)}</div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Write Answer */}
      <div className="card write-answer-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700 }}>Your Answer</h3>
          <button className="btn btn-sm" style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', border: 'none' }}
            onClick={handleAiSuggest} disabled={loadingAi}>
            {loadingAi ? 'Generating...' : '✨ AI Suggest'}
          </button>
        </div>
        {aiSuggestion && (
          <div style={{ marginBottom: '10px', padding: '10px', background: 'var(--blue-bg)', border: '1px solid #c7d2fe', borderRadius: 'var(--radius)', fontSize: '0.82rem', color: 'var(--text2)' }}>
            <strong>AI Draft:</strong> {aiSuggestion}
          </div>
        )}
        <form onSubmit={handleSubmitAnswer}>
          <textarea
            className="answer-textarea"
            placeholder="Share your knowledge and help the community..."
            value={answerBody}
            onChange={(e) => setAnswerBody(e.target.value)}
            rows={6}
            required
          />
          <div className="answer-submit-row">
            <span className="answer-hint">Be specific. Include examples. Cite sources if possible.</span>
            <button className="btn btn-primary" type="submit" disabled={submitting || !answerBody.trim()}>
              {submitting ? 'Posting...' : 'Post Answer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ForumDetail;
