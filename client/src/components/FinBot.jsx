import { useState, useRef, useEffect } from 'react';
import { Sparkles, X } from 'lucide-react';
import apiClient from '../api/client';

const FinBot = () => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'bot', content: "Hi! I'm FinBot — ask me about stocks, portfolio ideas, or any investing concept." }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [aiSource, setAiSource] = useState(null);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMsg = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMsg }]);
    setLoading(true);

    try {
      const history = messages.slice(-6).map((m) => ({ role: m.role === 'bot' ? 'assistant' : 'user', content: m.content }));
      const res = await apiClient.post('/tribe/finbot', { message: userMsg, history });
      setAiSource(res.data.source || null);
      setMessages((prev) => [...prev, { role: 'bot', content: res.data.reply }]);
    } catch (err) {
      const body = err.response?.data;
      const msg =
        body?.reply ||
        body?.error ||
        'Sorry, FinBot could not connect. Check that gen-ai is deployed and GEN_AI_SERVICE_URL is set on the API.';
      setAiSource(body?.source || 'error');
      setMessages((prev) => [...prev, { role: 'bot', content: msg }]);
    } finally {
      setLoading(false);
    }
  };

  const subtitle = aiSource === 'gemini'
    ? 'Powered by Gemini'
    : aiSource === 'fallback'
      ? 'Demo replies — connect gen-ai for full AI'
      : aiSource === 'error'
        ? 'AI service unavailable'
        : 'FinBot assistant';

  return (
    <div className="chatbot-wrapper">
      <div className={`chatbot-window ${open ? 'open' : ''}`}>
        <div className="chatbot-header">
          <div className="chatbot-title">
            <div className="chatbot-avatar" aria-hidden>
              <Sparkles size={17} strokeWidth={2.25} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>FinBot</div>
              <div style={{ fontSize: '0.72rem', color: aiSource === 'fallback' ? '#b45309' : 'var(--text3)' }}>
                {subtitle}
              </div>
            </div>
          </div>
          <button type="button" className="chatbot-close" onClick={() => setOpen(false)} aria-label="Close FinBot">
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        <div className="chatbot-body">
          {messages.map((m, i) => (
            <div key={i} className={`chatbot-msg ${m.role === 'bot' ? 'bot' : 'user'}`}>
              {m.content}
            </div>
          ))}
          {loading && <div className="chatbot-msg bot" style={{ opacity: 0.6 }}>FinBot is thinking...</div>}
          <div ref={endRef} />
        </div>

        <form className="chatbot-input" onSubmit={handleSend}>
          <input
            type="text"
            placeholder="Ask about stocks, portfolio, market..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
          />
          <button type="submit" disabled={loading || !input.trim()}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
            </svg>
          </button>
        </form>
      </div>

      <button type="button" className="chatbot-btn" onClick={() => setOpen(!open)} aria-label={open ? 'Close FinBot' : 'Open FinBot'}>
        {open ? <X size={22} strokeWidth={2.25} /> : <Sparkles size={26} strokeWidth={2.25} />}
      </button>
    </div>
  );
};

export default FinBot;
