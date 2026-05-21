import useStore from '../store';
import { disconnectSocket } from './useSocket';

/** Clear session and return to the marketing landing page (`/`). */
export function logoutAndGoLanding() {
  useStore.getState().logout();
  disconnectSocket();
  if (typeof window === 'undefined') return;
  const onLanding = window.location.pathname === '/' || window.location.pathname === '';
  if (!onLanding) {
    window.location.replace('/');
    return;
  }
  // Already on landing — still ensure URL is clean (no /app residue in history)
  window.history.replaceState(null, '', '/');
}

/** Sidebar / in-app sign out — same destination as session expiry. */
export function useLogout() {
  return () => {
    logoutAndGoLanding();
  };
}
