import { useEffect, useState } from 'react';

/** Match CSS breakpoint where the presentation deck is replaced by scroll sections. */
export const MOBILE_LANDING_MQ = '(max-width: 768px)';

export function useMobileLanding() {
  const [mobile, setMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(MOBILE_LANDING_MQ).matches;
  });

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_LANDING_MQ);
    const sync = () => setMobile(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  return mobile;
}
