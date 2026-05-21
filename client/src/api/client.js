import axios from 'axios';
import useStore from '../store';
import { logoutAndGoLanding } from '../hooks/useLogout';

const apiBase = (import.meta.env.VITE_API_BASE || '/api').replace(/\/$/, '');

const apiClient = axios.create({
  baseURL: apiBase,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
  timeout: 45_000,
});

apiClient.interceptors.request.use((config) => {
  const token = useStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

const AUTH_ATTEMPT_PATHS = ['/auth/login', '/auth/register'];

function isAuthAttempt(config) {
  if (config?.skipAuthRedirect) return true;
  const url = config?.url || '';
  return AUTH_ATTEMPT_PATHS.some((path) => url.includes(path));
}

// Session expired on protected routes — not failed login/register
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !isAuthAttempt(error.config)) {
      logoutAndGoLanding();
    }
    return Promise.reject(error);
  }
);

export default apiClient;
