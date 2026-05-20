import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CACHE_TTL_MS,
  clearAppCache,
  isForumListFresh,
  isHomeCacheFresh,
  isPortfolioFresh,
  isStocksListFresh,
  resolveCachedChart,
  setForumListCache,
  setHomeCache,
  setPortfolioCache,
  setStocksListCache,
} from './appCache';

describe('appCache', () => {
  beforeEach(() => {
    clearAppCache();
    vi.useRealTimers();
  });

  it('home cache is fresh within TTL', () => {
    setHomeCache({ userId: 'u1', signals: [{ id: '1' }] });
    expect(isHomeCacheFresh('u1')).toBe(true);
  });

  it('stocks list cache respects user and TTL', () => {
    setStocksListCache({ list: [{ ticker: 'X' }], userId: 'u1' });
    expect(isStocksListFresh('u1')).toBe(true);
    expect(isStocksListFresh('u2')).toBe(false);
  });

  it('portfolio cache goes stale after TTL', () => {
    vi.useFakeTimers();
    setPortfolioCache({ data: { holdings: [] }, userId: 'u1' });
    vi.advanceTimersByTime(CACHE_TTL_MS + 1);
    expect(isPortfolioFresh('u1')).toBe(false);
  });

  it('resolveCachedChart falls back to home chart fields', () => {
    setHomeCache({
      userId: 'u1',
      chartTicker: 'RELIANCE.NS',
      chartBaseHistory: [{ date: '2024-01-01', close: 100 }],
      chartInterval: '1d',
    });
    const chart = resolveCachedChart('RELIANCE.NS');
    expect(chart?.base).toHaveLength(1);
    expect(chart?.interval).toBe('1d');
  });

  it('forum list cache clears on logout', () => {
    setForumListCache([{ id: 'q1' }], 'u1');
    expect(isForumListFresh('u1')).toBe(true);
    clearAppCache();
    expect(isForumListFresh('u1')).toBe(false);
  });
});
