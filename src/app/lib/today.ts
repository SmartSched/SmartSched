import { useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';

export function todayIso() {
  return format(new Date(), 'yyyy-MM-dd');
}

// Today's date as YYYY-MM-DD, kept current while the page stays open: a timer for midnight, plus a
// re-check whenever the tab comes back into view (background tabs and sleeping laptops miss timers).
export function useToday() {
  const [today, setToday] = useState(todayIso);

  useEffect(() => {
    const refresh = () => setToday(todayIso());
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const timer = setTimeout(refresh, nextMidnight.getTime() - now.getTime() + 1000);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [today]);

  return today;
}

// The day a page is showing. It starts on today, and if it's still on today when the date changes,
// it moves to the new day, so a tab left open overnight doesn't keep showing (and saving to) yesterday.
// A day the user picked on purpose stays put.
export function useSelectedDay() {
  const today = useToday();
  const [selectedDate, setSelectedDate] = useState(today);
  const previousToday = useRef(today);

  useEffect(() => {
    if (today === previousToday.current) return;
    const yesterday = previousToday.current;
    previousToday.current = today;
    setSelectedDate((current) => (current === yesterday ? today : current));
  }, [today]);

  return { today, selectedDate, setSelectedDate };
}
