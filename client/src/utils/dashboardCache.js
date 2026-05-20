/** @deprecated Import from appCache — kept for Home.jsx compatibility. */
export { CACHE_TTL_MS } from './appCache';

import {
  clearAppCache,
  getCachedChartForTicker,
  getHomeCache,
  hasHomeContent,
  homeCacheSnapshot,
  isHomeCacheFresh,
  resolveCachedChart,
  setCachedChartForTicker,
  setHomeCache,
} from './appCache';

export function getDashboardCache() {
  return getHomeCache();
}

export function setDashboardCache(partial) {
  return setHomeCache(partial);
}

export function clearDashboardCache() {
  clearAppCache();
}

export function isDashboardCacheFresh(userId, ttlMs) {
  return isHomeCacheFresh(userId, ttlMs);
}

export {
  getCachedChartForTicker,
  resolveCachedChart,
  setCachedChartForTicker,
};

export function dashboardCacheSnapshot() {
  return homeCacheSnapshot();
}

export function hasDashboardContent() {
  return hasHomeContent();
}
