import { useEffect, useRef } from 'react';

const POLL_MS = 90_000;

/**
 * Refetch stock chart data on an interval when 1D range is active.
 * @param {{ enabled: boolean, onPoll: () => void }} opts
 */
export default function useChartLivePoll({ enabled, onPoll }) {
  const onPollRef = useRef(onPoll);

  useEffect(() => {
    onPollRef.current = onPoll;
  }, [onPoll]);

  useEffect(() => {
    if (!enabled) return undefined;

    const tick = () => {
      if (document.visibilityState === 'visible') {
        onPollRef.current?.();
      }
    };

    const id = setInterval(tick, POLL_MS);
    return () => clearInterval(id);
  }, [enabled]);
}
