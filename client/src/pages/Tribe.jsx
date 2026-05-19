import { useState, useEffect, useRef } from 'react';
import apiClient from '../api/client';
import useStore from '../store';
import { useSocket } from '../hooks/useSocket';
import TribePollCard from '../components/TribePollCard';

function tallyFromVotes(options, votes) {
  const counts = {};
  (options || []).forEach((o) => {
    counts[o] = 0;
  });
  if (votes && typeof votes === 'object' && !Array.isArray(votes)) {
    Object.values(votes).forEach((v) => {
      if (typeof v === 'string' && counts[v] !== undefined) counts[v] += 1;
    });
  }
  return counts;
}

/** /poll Question/opt1/opt2/opt3 OR /poll Question | opt1 | opt2 */
function parsePollCommand(body) {
  const rest = body.slice(6).trim();
  if (!rest) return null;
  if (rest.includes('|')) {
    const parts = rest.split('|').map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2) return { question: parts[0], options: parts.slice(1) };
    return null;
  }
  const parts = rest.split('/').map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) return { question: parts[0], options: parts.slice(1) };
  return null;
}

const Tribe = () => {
  const user = useStore((s) => s.user);
  const [channels, setChannels] = useState([]);
  const [channelsLoading, setChannelsLoading] = useState(true);
  const [channelsError, setChannelsError] = useState(null);
  const [currentChannel, setCurrentChannel] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [typingUsers, setTypingUsers] = useState([]);
  const [pollModal, setPollModal] = useState(false);
  const [pollQ, setPollQ] = useState('');
  const [pollOptions, setPollOptions] = useState('');
  const [pollCountOverrides, setPollCountOverrides] = useState({});
  const messagesEndRef = useRef(null);
  const typingTimeout = useRef(null);
  const channelIdRef = useRef(null);

  useEffect(() => {
    channelIdRef.current = currentChannel?.id ?? null;
  }, [currentChannel?.id]);

  const socket = useSocket({});

  useEffect(() => {
    let cancelled = false;
    setChannelsLoading(true);
    setChannelsError(null);
    apiClient
      .get('/tribe/channels')
      .then((r) => {
        if (cancelled) return;
        const list = Array.isArray(r.data) ? r.data : [];
        setChannels(list);
        if (list.length > 0) {
          setCurrentChannel((prev) => prev || list[0]);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setChannels([]);
        setChannelsError(
          err.response?.data?.error || err.message || 'Could not load channels',
        );
      })
      .finally(() => {
        if (!cancelled) setChannelsLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!currentChannel || !socket) return;

    socket.emit('join_room', currentChannel.id);
    setPollCountOverrides({});

    apiClient
      .get(`/tribe/channels/${currentChannel.id}/messages`)
      .then((r) => {
        setMessages(r.data);
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      })
      .catch(() => undefined);

    const handleMessage = (msg) => {
      if (msg.channelId != null && msg.channelId !== currentChannel.id) return;
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    };

    const handleTyping = (data) => {
      if (data.roomId !== currentChannel.id || data.userId === user?.id) return;
      setTypingUsers((prev) => {
        if (!prev.includes(data.userId)) return [...prev, data.userId];
        return prev;
      });
      clearTimeout(typingTimeout.current);
      typingTimeout.current = setTimeout(() => setTypingUsers([]), 2500);
    };

    const onPollPayload = ({ message }) => {
      if (!message?.channelId || message.channelId !== channelIdRef.current) return;
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    };

    const onPollUpdate = ({ pollId, results }) => {
      setPollCountOverrides((prev) => ({ ...prev, [pollId]: results }));
    };

    socket.on('receive_message', handleMessage);
    socket.on('tribe:typing', handleTyping);
    socket.on('tribe:poll', onPollPayload);
    socket.on('tribe:poll_update', onPollUpdate);

    return () => {
      socket.emit('leave_room', currentChannel.id);
      socket.off('receive_message', handleMessage);
      socket.off('tribe:typing', handleTyping);
      socket.off('tribe:poll', onPollPayload);
      socket.off('tribe:poll_update', onPollUpdate);
    };
  }, [currentChannel, socket, user?.id]);

  const mergeAnnouncement = (message) => {
    if (!message?.id) return;
    setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  };

  const handleVote = async (poll, option) => {
    try {
      const res = await apiClient.post(`/tribe/polls/${poll.id}/vote`, { option });
      const { results } = res.data || {};
      if (results) setPollCountOverrides((prev) => ({ ...prev, [poll.id]: results }));
      if (user?.id) {
        setMessages((prev) =>
          prev.map((m) =>
            m.pollId === poll.id && m.poll
              ? { ...m, poll: { ...m.poll, votes: { ...(m.poll.votes || {}), [user.id]: option } } }
              : m,
          ),
        );
      }
    } catch (err) {
      window.alert(err.response?.data?.error || 'Vote failed — try again');
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || sending) return;

    const content = input.trim();
    setInput('');
    setSending(true);

    if (content.startsWith('@finbot')) {
      socket?.emit('send_message', { roomId: currentChannel.id, content });
      try {
        await apiClient.post('/tribe/finbot', { message: content.replace('@finbot', '').trim(), history: [] });
      } catch {
        /* FinBot errors surfaced elsewhere */
      }
      setSending(false);
      return;
    }

    if (content.startsWith('/poll ')) {
      const parsed = parsePollCommand(content);
      if (parsed && parsed.options.length >= 2) {
        try {
          const { data } = await apiClient.post(`/tribe/channels/${currentChannel.id}/polls`, {
            question: parsed.question,
            options: parsed.options,
          });
          if (data?.announcement) mergeAnnouncement(data.announcement);
        } catch (err) {
          window.alert(err.response?.data?.error || 'Could not create poll. Try: /poll Question?|Yes|No');
        }
        setSending(false);
        return;
      }
      window.alert('Poll format: /poll Your question/Answer1/Answer2 — or /poll Question | A | B');
      setSending(false);
      return;
    }

    socket?.emit('send_message', { roomId: currentChannel.id, content });
    setSending(false);
  };

  const handleTypingInput = (e) => {
    setInput(e.target.value);
    if (socket && currentChannel) {
      socket.emit('tribe:typing', { roomId: currentChannel.id });
    }
  };

  const handleCreatePoll = async (e) => {
    e.preventDefault();
    const opts = pollOptions.split(/[,|]/).map((o) => o.trim()).filter(Boolean);
    if (!pollQ || opts.length < 2) return;
    try {
      const { data } = await apiClient.post(`/tribe/channels/${currentChannel.id}/polls`, { question: pollQ, options: opts });
      if (data?.announcement) mergeAnnouncement(data.announcement);
      setPollModal(false);
      setPollQ('');
      setPollOptions('');
    } catch (err) {
      window.alert(err.response?.data?.error || 'Failed to create poll');
    }
  };

  const initials = (u) => {
    if (!u) return '?';
    return ((u.firstName?.[0] || '') + (u.lastName?.[0] || '')).toUpperCase();
  };

  const formatTime = (ts) => new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="page tribe-page fade-in">
      <h1 className="page-title">Tribe Rooms</h1>
      <div className="tribe-layout">
        <aside className="tribe-channels">
          <div className="tribe-channels-header">Channels</div>
          <div className="tribe-channel-list">
            {channelsLoading && (
              <div style={{ padding: '12px', color: 'var(--text3)', fontSize: '0.85rem' }}>
                Loading channels…
              </div>
            )}
            {!channelsLoading && channelsError && (
              <div style={{ padding: '12px', color: '#dc2626', fontSize: '0.85rem', lineHeight: 1.5 }}>
                {channelsError}
              </div>
            )}
            {!channelsLoading && !channelsError && channels.length === 0 && (
              <div style={{ padding: '12px', color: 'var(--text3)', fontSize: '0.85rem', lineHeight: 1.5 }}>
                No channels available. Try refreshing the page.
              </div>
            )}
            {!channelsLoading && !channelsError && channels.map((ch) => (
              <button
                key={ch.id}
                type="button"
                className={`tribe-channel-item ${currentChannel?.id === ch.id ? 'active' : ''}`}
                onClick={() => setCurrentChannel(ch)}
              >
                <span>#</span> {ch.name}
              </button>
            ))}
          </div>
          <div className="tribe-channel-tips">
            <div style={{ fontSize: '0.75rem', color: 'var(--text3)', padding: '12px', lineHeight: 1.6 }}>
              <strong>Commands:</strong><br />
              @finbot — AI assistant<br />
              /poll Question/Yes/No/… or /poll Question | Yes | No
          </div>
        </div>
        </aside>

        <div className="tribe-chat">
          <div className="tribe-chat-header">
            <span className="tribe-chat-channel-name">
              #{currentChannel?.name || (channelsLoading ? 'Loading…' : channelsError ? 'Unavailable' : 'Select a channel')}
            </span>
            <span className="tribe-chat-desc">
              {currentChannel?.description || (channelsError ? channelsError : 'Select a channel from the list')}
            </span>
            <div className="tribe-online-badge">
              <span className="online-dot" />
              <span style={{ fontSize: '0.75rem', color: 'var(--text3)' }}>Live</span>
            </div>
            {currentChannel && (
              <button type="button" className="btn btn-sm" onClick={() => setPollModal(true)} style={{ marginLeft: 'auto' }}>
                📊 Create Poll
              </button>
            )}
          </div>
          
          <div className="tribe-messages">
            {messages.length === 0 ? (
              <div className="tribe-empty">
                No messages yet. Be the first to start a conversation! 👋
              </div>
            ) : (
              messages.map((msg, idx) => {
                const msgUser = msg.user;
                const isMe = msgUser?.id === user?.id || msg.userId === user?.id;
                const name = msgUser ? `${msgUser.firstName || ''} ${msgUser.lastName || ''}`.trim() : 'User';
                const verified = msgUser?.isVerified;
                const showPollCard = Boolean(msg.pollId && msg.poll);
                const pollCountsRaw = pollCountOverrides[msg.pollId] ?? tallyFromVotes(msg.poll?.options, msg.poll?.votes);
                const userVote = msg.poll?.votes && user?.id ? msg.poll.votes[user.id] : null;

                return (
                  <div key={msg.id || idx} className={`msg-row ${isMe ? 'msg-me' : ''} ${msg.isBot ? 'msg-bot' : ''}`}>
                    {!isMe && <div className="msg-av">{msgUser ? initials(msgUser) : '?'}</div>}
                    <div className="msg-body">
                      {showPollCard ? (
                        <>
                          {!isMe && (
                            <>
                              <div className="msg-meta">
                                <span className="msg-sender">
                                  {name || 'User'}
                                  {verified && <span className="verified-badge" title="Verified Trader">✓</span>}
                                </span>
                                <span className="msg-time">{formatTime(msg.timestamp)}</span>
                              </div>
                              <div className={`msg-bubble poll-bubble ${msg.isBot ? 'bot' : ''}`}>
                                <TribePollCard
                                  poll={msg.poll}
                                  counts={pollCountsRaw}
                                  userVote={userVote}
                                  disabled={!user?.id}
                                  onVote={(opt) => handleVote(msg.poll, opt)}
                                />
                              </div>
                            </>
                          )}
                          {isMe && (
                            <>
                              <div className={`msg-bubble poll-bubble mine ${msg.isBot ? 'bot' : ''}`}>
                                <TribePollCard
                                  poll={msg.poll}
                                  counts={pollCountsRaw}
                                  userVote={userVote}
                                  disabled={!user?.id}
                                  onVote={(opt) => handleVote(msg.poll, opt)}
                                />
                              </div>
                              <div className="msg-time-me">{formatTime(msg.timestamp)}</div>
                            </>
                          )}
                        </>
                      ) : (
                        <>
                          {!isMe && (
                            <div className="msg-meta">
                              <span className="msg-sender">
                                {name || 'User'}
                                {verified && <span className="verified-badge" title="Verified Trader">✓</span>}
                              </span>
                              <span className="msg-time">{formatTime(msg.timestamp)}</span>
                            </div>
                          )}
                          <div className={`msg-bubble ${isMe ? 'mine' : ''} ${msg.isBot ? 'bot' : ''}`}>
                            {msg.content}
                          </div>
                          {isMe && <div className="msg-time-me">{formatTime(msg.timestamp)}</div>}
                        </>
                      )}
                </div>
                  </div>
                );
              })
            )}
            {typingUsers.length > 0 && <div className="tribe-typing">Someone is typing...</div>}
            <div ref={messagesEndRef} />
          </div>

          <form className="tribe-input-bar" onSubmit={handleSend}>
              <input 
              className="tribe-msg-input"
              placeholder={currentChannel ? `Message #${currentChannel.name}… — @finbot or /poll` : 'Select a channel...'}
              value={input}
              onChange={handleTypingInput}
              disabled={!currentChannel || sending}
            />
            <button className="tribe-send-btn" type="submit" disabled={!input.trim() || !currentChannel || sending}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
              </svg>
            </button>
          </form>
        </div>
      </div>

      {pollModal && (
        <div className="modal-overlay" role="presentation" onClick={() => setPollModal(false)}>
          <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="poll-modal-title" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="modal-close" onClick={() => setPollModal(false)}>✕</button>
            <h3 id="poll-modal-title" style={{ marginBottom: '16px' }}>Create Poll in #{currentChannel?.name}</h3>
            <form onSubmit={handleCreatePoll}>
              <div className="form-group">
                <label className="form-label">Poll Question</label>
                <input className="form-input" type="text" placeholder="Buy/Sell/Hold RELIANCE?" value={pollQ} onChange={(e) => setPollQ(e.target.value)} required />
              </div>
              <div className="form-group">
                <label className="form-label">Options (comma or | separated)</label>
                <input className="form-input" type="text" placeholder="Buy, Sell, Hold" value={pollOptions} onChange={(e) => setPollOptions(e.target.value)} required />
              </div>
              <button className="btn btn-primary" type="submit">Create Poll</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Tribe;
