import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CACHE_TTL_MS,
  clearDashboardCache,
  getDashboardCache,
  hasDashboardContent,
  isDashboardCacheFresh,
  setDashboardCache,
} from './dashboardCache';

describe('dashboardCache', () => {
  beforeEach(() => {
    clearDashboardCache();
    vi.useRealTimers();
  });

  it('is fresh within TTL for same user', () => {
    setDashboardCache({ userId: 'u1', trendingTickers: [{ tickerFull: 'X' }] });
    expect(isDashboardCacheFresh('u1')).toBe(true);
  });

  it('is stale after TTL', () => {
    vi.useFakeTimers();
    setDashboardCache({ userId: 'u1', signals: [{ id: '1' }] });
    vi.advanceTimersByTime(CACHE_TTL_MS + 1);
    expect(isDashboardCacheFresh('u1')).toBe(false);
  });

  it('is not fresh for different user', () => {
    setDashboardCache({ userId: 'u1', newsArticles: [{ id: 'a' }] });
    expect(isDashboardCacheFresh('u2')).toBe(false);
  });

  it('clearDashboardCache resets state', () => {
    setDashboardCache({ userId: 'u1', signalsReady: true, signals: [{}] });
    expect(hasDashboardContent()).toBe(true);
    clearDashboardCache();
    expect(getDashboardCache().fetchedAt).toBe(0);
    expect(hasDashboardContent()).toBe(false);
  });
});
