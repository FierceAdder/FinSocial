import { create } from 'zustand';
import { clearAppCache } from '../utils/appCache';

const useStore = create((set) => ({
  user: JSON.parse(localStorage.getItem('finsocial_user') || 'null'),
  token: localStorage.getItem('finsocial_token') || null,
  isAuthenticated: !!localStorage.getItem('finsocial_token'),

  // Notification badge
  unreadCount: 0,
  setUnreadCount: (count) => set({ unreadCount: count }),
  incrementUnread: () => set((s) => ({ unreadCount: s.unreadCount + 1 })),
  decrementUnread: () => set((s) => ({ unreadCount: Math.max(0, s.unreadCount - 1) })),

  setAuth: (user, token) => {
    localStorage.setItem('finsocial_user', JSON.stringify(user));
    localStorage.setItem('finsocial_token', token);
    set({ user, token, isAuthenticated: true });
  },

  setUser: (user) => {
    localStorage.setItem('finsocial_user', JSON.stringify(user));
    set({ user, isAuthenticated: !!user });
  },

  logout: () => {
    localStorage.removeItem('finsocial_user');
    localStorage.removeItem('finsocial_token');
    clearAppCache();
    set({ user: null, token: null, isAuthenticated: false, unreadCount: 0 });
  },

  finbotOpen: false,
  finbotPendingMessage: null,
  setFinbotOpen: (open) => set({ finbotOpen: open }),
  clearFinbotPending: () => set({ finbotPendingMessage: null }),
  askFinBot: (message) => {
    const trimmed = typeof message === 'string' ? message.trim() : '';
    if (!trimmed) return;
    set({ finbotOpen: true, finbotPendingMessage: trimmed });
  },
}));

export default useStore;
