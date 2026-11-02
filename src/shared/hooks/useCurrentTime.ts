import { useEffect, useState } from 'react';

/** Updates a timestamp on an interval; useful for UI derived from the current time. */
export function useCurrentTime(intervalMs = 60_000) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(interval);
  }, [intervalMs]);

  return now;
}
