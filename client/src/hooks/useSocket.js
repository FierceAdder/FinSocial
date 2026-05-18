import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import useStore from '../store';

let sharedSocket = null;
let currentToken = null;

/** Production: set VITE_BACKEND_URL to your API origin (e.g. https://xxx.onrender.com). Vercel cannot proxy WebSockets. */
function socketBaseUrl() {
  const raw = import.meta.env.VITE_BACKEND_URL;
  if (typeof raw === 'string' && raw.trim()) return raw.replace(/\/$/, '');
  return undefined;
}

function ensureSocket(token) {
  if (!token) {
    if (sharedSocket) {
      sharedSocket.disconnect();
      sharedSocket = null;
      currentToken = null;
    }
    return null;
  }

  if (sharedSocket && currentToken === token) {
    return sharedSocket;
  }

  if (sharedSocket) {
    sharedSocket.disconnect();
  }

  const origin = socketBaseUrl();
  const opts = { auth: { token }, transports: ['websocket', 'polling'] };
  // No origin → same host as the page (local dev: Vite proxies /socket.io)
  sharedSocket = origin ? io(origin, opts) : io(opts);
  currentToken = token;
  return sharedSocket;
}

export function getSocket() {
  return sharedSocket;
}

export function disconnectSocket() {
  if (sharedSocket) {
    sharedSocket.disconnect();
    sharedSocket = null;
    currentToken = null;
  }
}

export function useSocket(eventHandlers = {}) {
  const token = useStore((s) => s.token);
  const handlersRef = useRef(eventHandlers);

  useEffect(() => {
    handlersRef.current = eventHandlers;
  }, [eventHandlers]);

  useEffect(() => {
    const socket = ensureSocket(token);
    if (!socket) return;

    const listenerFns = {};
    for (const event of Object.keys(handlersRef.current)) {
      const listener = (...args) => {
        const fn = handlersRef.current[event];
        if (typeof fn === 'function') fn(...args);
      };
      listenerFns[event] = listener;
      socket.on(event, listener);
    }

    return () => {
      for (const [event, listener] of Object.entries(listenerFns)) {
        socket.off(event, listener);
      }
    };
  }, [token]);

  return ensureSocket(token);
}
