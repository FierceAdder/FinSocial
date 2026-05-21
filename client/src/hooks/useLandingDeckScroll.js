import { useCallback, useEffect, useRef } from 'react';
import { LANDING_PINNED_SECTIONS } from '../pages/landingSections.js';

const EXPLORE_ID = 'explore';
const SLIDE_WHEEL_STEP = 120;
const BOUNDARY_WHEEL_STEP = 88;
const MAX_WHEEL_DELTA_PER_FRAME = 32;
const MIN_WHEEL_DELTA = 4;
const SLIDE_LOCK_MS = 500;
const REENTRY_BLOCK_MS = 650;
const PIN_DRIFT_PX = 14;

function getScrollPadding() {
  const raw = getComputedStyle(document.body).getPropertyValue('--landing-scroll-padding').trim();
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : 64;
}

function getExploreEl() {
  return document.getElementById(EXPLORE_ID);
}

function getExploreTop() {
  const explore = getExploreEl();
  if (!explore) return null;
  return explore.offsetTop - getScrollPadding();
}

function isExplorePinned() {
  const explore = getExploreEl();
  if (!explore) return false;
  const rect = explore.getBoundingClientRect();
  const pad = getScrollPadding();
  return Math.abs(rect.top - pad) < 56 && rect.bottom > window.innerHeight * 0.45;
}

function isInFooterZone() {
  const explore = getExploreEl();
  if (!explore) return false;
  const bottom = explore.offsetTop + explore.offsetHeight;
  return window.scrollY + window.innerHeight * 0.35 > bottom;
}

function isAboveExplore() {
  const explore = getExploreEl();
  if (!explore) return false;
  return window.scrollY + getScrollPadding() + 20 < explore.offsetTop;
}

function isPageReload() {
  const nav = performance.getEntriesByType('navigation')[0];
  return nav?.type === 'reload';
}

/**
 * @param {import('react').MutableRefObject<number>} accumRef
 * @param {number} deltaY
 * @param {number} threshold
 * @returns {-1 | 1 | null}
 */
function consumeWheel(accumRef, deltaY, threshold) {
  if (Math.abs(deltaY) < MIN_WHEEL_DELTA) return null;

  const capped = Math.max(
    -MAX_WHEEL_DELTA_PER_FRAME,
    Math.min(MAX_WHEEL_DELTA_PER_FRAME, deltaY),
  );
  const goingDown = capped > 0;
  const goingUp = capped < 0;
  if ((goingDown && accumRef.current < 0) || (goingUp && accumRef.current > 0)) {
    accumRef.current = 0;
  }
  accumRef.current += capped;
  if (Math.abs(accumRef.current) < threshold) return null;
  const direction = accumRef.current > 0 ? 1 : -1;
  accumRef.current = 0;
  return direction;
}

/**
 * Wheel-driven presentation deck inside pinned #explore.
 * @param {boolean} [enabled=true] — set false on small screens (normal scroll layout).
 */
export function useLandingDeckScroll(activeId, setActiveId, setInDeck, enabled = true) {
  const slideCount = LANDING_PINNED_SECTIONS.length;
  const lastIndex = slideCount - 1;

  const deckActiveRef = useRef(false);
  const wheelAccumRef = useRef(0);
  const wheelPendingRef = useRef(0);
  const wheelFrameRef = useRef(0);
  const stepLockedUntilRef = useRef(0);
  const reentryBlockedUntilRef = useRef(0);
  const inDeckUiRef = useRef(false);
  const hubExitArmedRef = useRef(false);
  const touchStartYRef = useRef(0);

  const lockStep = useCallback(() => {
    stepLockedUntilRef.current = Date.now() + SLIDE_LOCK_MS;
    wheelAccumRef.current = 0;
  }, []);

  const isStepLocked = useCallback(
    () => Date.now() < stepLockedUntilRef.current,
    [],
  );

  const activeIndex = Math.max(
    0,
    LANDING_PINNED_SECTIONS.findIndex((s) => s.id === activeId),
  );
  const indexRef = useRef(activeIndex);

  useEffect(() => {
    indexRef.current = activeIndex;
  }, [activeIndex]);

  const setSlideByIndex = useCallback((index, { updateHash = false } = {}) => {
    const clamped = Math.min(lastIndex, Math.max(0, index));
    const slide = LANDING_PINNED_SECTIONS[clamped];
    if (!slide) return;
    indexRef.current = clamped;
    setActiveId(slide.id);
    if (updateHash && window.history?.replaceState) {
      window.history.replaceState(null, '', `#${slide.id}`);
    }
  }, [lastIndex, setActiveId]);

  const pinExploreIfNeeded = useCallback(() => {
    const top = getExploreTop();
    if (top == null) return;
    if (Math.abs(window.scrollY - top) > PIN_DRIFT_PX) {
      window.scrollTo({ top, behavior: 'auto' });
    }
  }, []);

  const isReentryBlocked = useCallback(
    () => Date.now() < reentryBlockedUntilRef.current,
    [],
  );

  const blockReentry = useCallback(() => {
    reentryBlockedUntilRef.current = Date.now() + REENTRY_BLOCK_MS;
  }, []);

  const clearReentryBlock = useCallback(() => {
    reentryBlockedUntilRef.current = 0;
  }, []);

  const disengageDeck = useCallback(() => {
    deckActiveRef.current = false;
    wheelAccumRef.current = 0;
    wheelPendingRef.current = 0;
  }, []);

  const engageDeck = useCallback((slideIndex) => {
    if (isReentryBlocked()) return false;
    deckActiveRef.current = true;
    wheelAccumRef.current = 0;
    setSlideByIndex(slideIndex, { updateHash: false });
    pinExploreIfNeeded();
    return true;
  }, [isReentryBlocked, pinExploreIfNeeded, setSlideByIndex]);

  const exitDeckUp = useCallback(() => {
    hubExitArmedRef.current = false;
    lockStep();
    disengageDeck();
    blockReentry();
    const hero = document.getElementById('hero');
    const trust = document.getElementById('trust');
    const top = hero
      ? Math.max(0, hero.offsetTop - getScrollPadding())
      : trust
        ? Math.max(0, trust.offsetTop - getScrollPadding())
        : 0;
    if (window.history?.replaceState) {
      const path = window.location.pathname + window.location.search;
      window.history.replaceState(null, '', path);
    }
    window.scrollTo({ top, behavior: 'smooth' });
  }, [blockReentry, disengageDeck, lockStep]);

  const exitDeckDown = useCallback(() => {
    lockStep();
    disengageDeck();
    blockReentry();
    const explore = getExploreEl();
    if (!explore) return;
    const top = explore.offsetTop + explore.offsetHeight - getScrollPadding() + 8;
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }, [blockReentry, disengageDeck, lockStep]);

  const shouldCaptureWheel = useCallback((deltaY) => {
    if (deckActiveRef.current) return true;
    if (isAboveExplore() && deltaY < 0) return false;
    if (isInFooterZone() && deltaY > 0) return false;
    if (isExplorePinned()) return true;
    if (isInFooterZone() && deltaY < 0) return true;

    const explore = getExploreEl();
    if (!explore || deltaY <= 0) return false;
    const rect = explore.getBoundingClientRect();
    const pad = getScrollPadding();
    return rect.top > pad - 12 && rect.top < window.innerHeight * 0.58;
  }, []);

  const handleWheelDelta = useCallback((deltaY) => {
    if (Math.abs(deltaY) < MIN_WHEEL_DELTA) return false;

    if (isReentryBlocked() && isAboveExplore()) clearReentryBlock();

    const goingDown = deltaY > 0;
    const goingUp = deltaY < 0;
    const explore = getExploreEl();
    if (!explore) return false;

    const idx = indexRef.current;

    if (!deckActiveRef.current) {
      if (goingUp && isAboveExplore()) return false;
      if (goingDown && isInFooterZone()) return false;

      const rect = explore.getBoundingClientRect();
      const pad = getScrollPadding();
      const pinned = isExplorePinned();

      if (goingUp && !isReentryBlocked() && isInFooterZone()) {
        return engageDeck(lastIndex);
      }

      if (
        goingDown
        && !isReentryBlocked()
        && !isInFooterZone()
        && (pinned || (rect.top > pad - 12 && rect.top < window.innerHeight * 0.58))
      ) {
        return engageDeck(idx);
      }

      if (pinned && !isInFooterZone() && !isReentryBlocked()) {
        if (goingUp && idx <= 0) {
          exitDeckUp();
          return true;
        }
        return engageDeck(idx);
      }

      return false;
    }

    if (goingUp && idx <= 0) {
      if (hubExitArmedRef.current) {
        hubExitArmedRef.current = false;
        exitDeckUp();
        return true;
      }
      const direction = consumeWheel(wheelAccumRef, deltaY, BOUNDARY_WHEEL_STEP);
      if (direction === -1) exitDeckUp();
      return true;
    }

    if (goingDown && idx >= lastIndex) {
      const direction = consumeWheel(wheelAccumRef, deltaY, BOUNDARY_WHEEL_STEP);
      if (direction === 1) exitDeckDown();
      return true;
    }

    if (isStepLocked()) return true;

    if (goingUp && idx >= lastIndex) {
      const direction = consumeWheel(wheelAccumRef, deltaY, SLIDE_WHEEL_STEP);
      if (direction === -1) {
        setSlideByIndex(idx - 1, { updateHash: false });
        lockStep();
        pinExploreIfNeeded();
      }
      return true;
    }

    if (goingDown && idx <= 0) {
      const direction = consumeWheel(wheelAccumRef, deltaY, SLIDE_WHEEL_STEP);
      if (direction === 1) {
        hubExitArmedRef.current = false;
        setSlideByIndex(1, { updateHash: false });
        lockStep();
        pinExploreIfNeeded();
      }
      return true;
    }

    const direction = consumeWheel(wheelAccumRef, deltaY, SLIDE_WHEEL_STEP);
    if (direction == null) return true;

    const next = idx + direction;
    if (next < 0) {
      exitDeckUp();
      return true;
    }
    if (next > lastIndex) {
      exitDeckDown();
      return true;
    }

    setSlideByIndex(next, { updateHash: false });
    hubExitArmedRef.current = next === 0 && direction < 0;
    lockStep();
    pinExploreIfNeeded();
    return true;
  }, [
    clearReentryBlock,
    engageDeck,
    exitDeckDown,
    exitDeckUp,
    isReentryBlocked,
    isStepLocked,
    lastIndex,
    lockStep,
    pinExploreIfNeeded,
    setSlideByIndex,
  ]);

  const scrollToSlideId = useCallback((id, behavior = 'smooth') => {
    if (!enabled) {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior, block: 'start' });
      const index = LANDING_PINNED_SECTIONS.findIndex((s) => s.id === id);
      if (index >= 0) setSlideByIndex(index, { updateHash: true });
      return;
    }
    const index = LANDING_PINNED_SECTIONS.findIndex((s) => s.id === id);
    if (index < 0) return;
    clearReentryBlock();
    stepLockedUntilRef.current = 0;
    deckActiveRef.current = true;
    wheelAccumRef.current = 0;
    wheelPendingRef.current = 0;
    setSlideByIndex(index, { updateHash: true });
    const top = getExploreTop();
    if (top != null) window.scrollTo({ top, behavior });
  }, [clearReentryBlock, enabled, setSlideByIndex]);

  useEffect(() => {
    if (!enabled) {
      deckActiveRef.current = false;
      inDeckUiRef.current = false;
      setInDeck(false);
    }
  }, [enabled, setInDeck]);

  useEffect(() => {
    if (!enabled) return undefined;
    const syncInDeck = () => {
      if (isReentryBlocked() && isAboveExplore()) clearReentryBlock();
      if (deckActiveRef.current && isAboveExplore()) disengageDeck();

      const inDeck = deckActiveRef.current && isExplorePinned();
      if (inDeck !== inDeckUiRef.current) {
        inDeckUiRef.current = inDeck;
        setInDeck(inDeck);
      }
    };

    window.addEventListener('scroll', syncInDeck, { passive: true });
    window.addEventListener('resize', syncInDeck, { passive: true });
    requestAnimationFrame(syncInDeck);
    return () => {
      window.removeEventListener('scroll', syncInDeck);
      window.removeEventListener('resize', syncInDeck);
    };
  }, [clearReentryBlock, disengageDeck, enabled, isReentryBlocked, setInDeck]);

  useEffect(() => {
    if (!enabled) return undefined;
    const flushWheel = () => {
      wheelFrameRef.current = 0;
      const delta = wheelPendingRef.current;
      wheelPendingRef.current = 0;
      if (delta !== 0) handleWheelDelta(delta);
    };

    const onWheel = (e) => {
      if (e.ctrlKey || e.metaKey) return;
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      if (!shouldCaptureWheel(e.deltaY)) return;

      e.preventDefault();
      wheelPendingRef.current += e.deltaY;
      if (!wheelFrameRef.current) {
        wheelFrameRef.current = requestAnimationFrame(flushWheel);
      }
    };

    window.addEventListener('wheel', onWheel, { passive: false });

    const onTouchStart = (ev) => {
      touchStartYRef.current = ev.touches[0]?.clientY ?? 0;
    };
    const onTouchEnd = (ev) => {
      const endY = ev.changedTouches[0]?.clientY ?? 0;
      const delta = touchStartYRef.current - endY;
      if (Math.abs(delta) < 80) return;
      if (!shouldCaptureWheel(delta)) return;
      handleWheelDelta(delta);
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend', onTouchEnd);
      if (wheelFrameRef.current) cancelAnimationFrame(wheelFrameRef.current);
    };
  }, [enabled, handleWheelDelta, shouldCaptureWheel]);

  useEffect(() => {
    if (!enabled) return undefined;
    const applyHash = (fromHashChange) => {
      const id = window.location.hash.replace('#', '');
      const index = LANDING_PINNED_SECTIONS.findIndex((s) => s.id === id);

      if (index < 0) {
        if (isPageReload()) {
          disengageDeck();
          window.scrollTo(0, 0);
        }
        return;
      }

      setSlideByIndex(index, { updateHash: false });

      if (fromHashChange) {
        requestAnimationFrame(() => scrollToSlideId(id, 'smooth'));
        return;
      }

      if (isPageReload()) {
        disengageDeck();
        if (window.history?.replaceState) {
          const path = window.location.pathname + window.location.search;
          window.history.replaceState(null, '', path);
        }
        window.scrollTo(0, 0);
        return;
      }

      requestAnimationFrame(() => scrollToSlideId(id, 'smooth'));
    };

    applyHash(false);
    const onHashChange = () => applyHash(true);
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [disengageDeck, enabled, scrollToSlideId, setSlideByIndex]);

  return { scrollToSlideId };
};
