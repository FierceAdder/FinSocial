import { useState, useRef, useEffect, useCallback } from 'react';
import { Sparkles, X } from 'lucide-react';
import apiClient from '../api/client';
import useStore from '../store';
import FinBotMessage from './FinBotMessage';
import { parseFinbotPayload, finbotConnectError, unexpectedFinbotResponse } from '../utils/finbotApi';

const FINBOT_REQUEST_OPTS = {
  skipAuthRedirect: true,
  headers: { 'Cache-Control': 'no-cache' },
};

const FINBOT_SIZE_KEY = 'finsocial_finbot_size';
const DEFAULT_W = 340;
const DEFAULT_H = 480;
const MIN_W = 280;
const MIN_H = 320;
const MAX_W_RATIO = 0.9;
const MAX_H_RATIO = 0.85;

const WELCOME = "Hi! I'm FinBot — ask me about stocks, portfolio ideas, or any investing concept.";

function loadSavedSize() {
  try {
    const raw = localStorage.getItem(FINBOT_SIZE_KEY);
    if (!raw) return { width: DEFAULT_W, height: DEFAULT_H };
    const parsed = JSON.parse(raw);
    if (Number.isFinite(parsed.width) && Number.isFinite(parsed.height)) {
      return { width: parsed.width, height: parsed.height };
    }
  } catch {
    /* ignore */
  }
  return { width: DEFAULT_W, height: DEFAULT_H };
}

function clampSize(width, height) {
  const maxW = Math.floor(window.innerWidth * MAX_W_RATIO);
  const maxH = Math.floor(window.innerHeight * MAX_H_RATIO);
  return {
    width: Math.min(maxW, Math.max(MIN_W, width)),
    height: Math.min(maxH, Math.max(MIN_H, height)),
  };
}

const FinBot = () => {
  const finbotOpen = useStore((s) => s.finbotOpen);
  const finbotPendingMessage = useStore((s) => s.finbotPendingMessage);
  const setFinbotOpen = useStore((s) => s.setFinbotOpen);
  const clearFinbotPending = useStore((s) => s.clearFinbotPending);

  const [messages, setMessages] = useState([{ role: 'bot', content: WELCOME }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [aiSource, setAiSource] = useState(null);
  const [size, setSize] = useState(loadSavedSize);
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 768px)').matches);

  const endRef = useRef(null);
  const inFlightRef = useRef(false);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const onChange = () => setIsMobile(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const submitUserMessage = useCallback(async (userMsg) => {
    const trimmed = userMsg.trim();
    if (!trimmed) return;
    if (inFlightRef.current) return;

    const token = useStore.getState().token;
    if (!token) {
      setMessages((prev) => [
        ...prev,
        { role: 'user', content: trimmed },
        { role: 'bot', content: 'Please log in to use FinBot (session token missing).' },
      ]);
      setAiSource('error');
      return;
    }

    inFlightRef.current = true;

    let snapshot;
    setMessages((prev) => {
      snapshot = [...prev, { role: 'user', content: trimmed }];
      return snapshot;
    });
    setLoading(true);

    const history = () =>
      snapshot
        .slice(0, -1)
        .slice(-6)
        .map((m) => ({
          role: m.role === 'bot' ? 'assistant' : 'user',
          content: m.content,
        }));

    const postFinbot = () =>
      apiClient.post('/tribe/finbot', { message: trimmed, history: history() }, FINBOT_REQUEST_OPTS);

    try {
      let res;
      try {
        res = await postFinbot();
      } catch (firstErr) {
        if (!firstErr.response && firstErr.code !== 'ECONNABORTED') {
          await new Promise((r) => setTimeout(r, 1200));
          res = await postFinbot();
        } else {
          throw firstErr;
        }
      }

      const parsed = parseFinbotPayload(res?.data);
      if (parsed) {
        setAiSource(parsed.source || null);
        setMessages((prev) => [...prev, { role: 'bot', content: parsed.reply }]);
      } else {
        const bad = unexpectedFinbotResponse();
        setAiSource(bad.source);
        setMessages((prev) => [...prev, { role: 'bot', content: bad.reply }]);
      }
    } catch (err) {
      const parsed = finbotConnectError(err);
      setAiSource(parsed.source);
      setMessages((prev) => [...prev, { role: 'bot', content: parsed.reply }]);
    } finally {
      setLoading(false);
      inFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!finbotPendingMessage) return;
    const msg = finbotPendingMessage;
    clearFinbotPending();
    queueMicrotask(() => {
      void submitUserMessage(msg);
    });
  }, [finbotPendingMessage, clearFinbotPending, submitUserMessage]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput('');
    await submitUserMessage(userMsg);
  };

  const persistSize = useCallback((w, h) => {
    try {
      localStorage.setItem(FINBOT_SIZE_KEY, JSON.stringify({ width: w, height: h }));
    } catch {
      /* ignore */
    }
  }, []);

  const onResizePointerDown = (e) => {
    if (isMobile) return;
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startY = e.clientY;
    const startW = size.width;
    const startH = size.height;

    const onMove = (ev) => {
      setSize(clampSize(
        startW + (startX - ev.clientX),
        startH + (startY - ev.clientY),
      ));
    };

    const onUp = (ev) => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      const next = clampSize(
        startW + (startX - ev.clientX),
        startH + (startY - ev.clientY),
      );
      persistSize(next.width, next.height);
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  };

  const subtitle = aiSource === 'gemini' || aiSource === 'gemini-fallback'
    ? 'Powered by Gemini'
    : aiSource === 'fallback'
      ? 'Demo replies — connect gen-ai for full AI'
      : aiSource === 'error'
        ? 'AI service unavailable'
        : 'FinBot assistant';

  const windowStyle = !isMobile && finbotOpen
    ? { width: size.width, height: size.height }
    : undefined;

  return (
    <div className="chatbot-wrapper">
      <div
        className={`chatbot-window ${finbotOpen ? 'open' : ''} ${isMobile ? 'chatbot-window--mobile' : ''}`}
        style={windowStyle}
      >
        {!isMobile && (
          <div
            className="chatbot-resize-handle"
            role="presentation"
            aria-hidden
            onPointerDown={onResizePointerDown}
          />
        )}

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
          <button type="button" className="chatbot-close" onClick={() => setFinbotOpen(false)} aria-label="Close FinBot">
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        <div className="chatbot-body">
          {messages.map((m, i) => (
            <FinBotMessage key={i} role={m.role} content={m.content} />
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
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
          </button>
        </form>
      </div>

      <button
        type="button"
        className="chatbot-btn"
        onClick={() => setFinbotOpen(!finbotOpen)}
        aria-label={finbotOpen ? 'Close FinBot' : 'Open FinBot'}
      >
        {finbotOpen ? <X size={22} strokeWidth={2.25} /> : <Sparkles size={26} strokeWidth={2.25} />}
      </button>
    </div>
  );
};

export default FinBot;
