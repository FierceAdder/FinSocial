import { useState, useEffect } from 'react';
import apiClient from '../api/client';
import useStore from '../store';

const NotificationPanel = ({ open }) => {
  const [notifications, setNotifications] = useState([]);
  const setUnreadCount = useStore((s) => s.setUnreadCount);
  const decrementUnread = useStore((s) => s.decrementUnread);

  useEffect(() => {
    if (!open) return;
    apiClient.get('/notifications').then((r) => {
      setNotifications(r.data);
    }).catch(() => undefined);
  }, [open]);

  const markAllRead = async () => {
    await apiClient.patch('/notifications/read-all').catch(() => undefined);
    setNotifications((prev) => prev.map((n) => ({ ...n, readAt: new Date().toISOString() })));
    setUnreadCount(0);
  };

  const markRead = async (id) => {
    await apiClient.patch(`/notifications/${id}/read`).catch(() => undefined);
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, readAt: new Date().toISOString() } : n));
    decrementUnread();
  };

  const iconFor = (type) => {
    const icons = {
      forum_answer: '💬',
      signal_alert: '📊',
      price_alert: '🔔',
      trade_alert: '💹',
      news_alert: '📰',
      mentor_match: '🎓',
    };
    return icons[type] || '🔔';
  };

  const timeAgo = (date) => {
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  return (
    <div className={`notif-panel ${open ? 'open' : ''}`}>
      <div className="notif-panel-header">
        <strong>Notifications</strong>
        <button className="notif-clear" onClick={markAllRead}>Mark all read</button>
      </div>
      <div className="notif-list">
        {notifications.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text3)' }}>
            No notifications yet
          </div>
        ) : notifications.map((n) => (
          <div
            key={n.id}
            className={`notif-item ${!n.readAt ? 'unread' : ''}`}
            onClick={() => !n.readAt && markRead(n.id)}
          >
            <div className="notif-icon">{iconFor(n.type)}</div>
            <div className="notif-content">
              <div className="notif-text"><strong>{n.title}</strong> — {n.body}</div>
              <div className="notif-time">{timeAgo(n.createdAt)}</div>
            </div>
            {!n.readAt && <div className="notif-dot" />}
          </div>
        ))}
      </div>
    </div>
  );
};

export default NotificationPanel;
