import { useCallback, useEffect, useMemo, useState } from 'react';
import { addDays, format, parseISO, startOfWeek, subDays } from 'date-fns';
import { apiGet } from '../../../app/lib/api';
import { burnoutWarnings } from '../../../app/lib/burnout';
import type { Task } from '../../../app/lib/tasks';
import type { TimeBlock } from '../../../app/lib/planner';

// How far around today to look for task blocks that were missed, and for room to move them (as the planner does).
const NEARBY_DAYS = 14;

/** Loads and derives the data displayed by the signed-in user's Today page. */
export function useHomeDashboard(userId: string | undefined, today: string) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [weekBlocks, setWeekBlocks] = useState<TimeBlock[]>([]);
  const [nearbyBlocks, setNearbyBlocks] = useState<TimeBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [version, setVersion] = useState(0);

  // This week as the planner shows it (Sunday to Saturday).
  const weekDates = useMemo(() => {
    const start = startOfWeek(parseISO(today), { weekStartsOn: 0 });
    return Array.from({ length: 7 }, (_, index) => format(addDays(start, index), 'yyyy-MM-dd'));
  }, [today]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    // Plus the next day, for Saturday night.
    const weekEnd = format(addDays(parseISO(weekDates[6]), 1), 'yyyy-MM-dd');
    const nearStart = format(subDays(parseISO(today), NEARBY_DAYS), 'yyyy-MM-dd');
    const nearEnd = format(addDays(parseISO(today), NEARBY_DAYS), 'yyyy-MM-dd');
    setLoadError(false);
    Promise.all([
      apiGet('/api/tasks'),
      apiGet(`/api/time-blocks?start=${weekDates[0]}&end=${weekEnd}`),
      apiGet(`/api/time-blocks?start=${nearStart}&end=${nearEnd}`),
    ])
      .then(([taskData, weekData, nearbyData]) => {
        if (cancelled) return;
        setTasks(taskData);
        setWeekBlocks(weekData);
        setNearbyBlocks(nearbyData);
      })
      .catch(() => !cancelled && setLoadError(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [userId, today, weekDates, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);

  // Every place a task shows up (the list and its blocks) follows its latest state.
  const applyTask = useCallback((updated: Task) => {
    setTasks((list) => list.map((t) => (t.id === updated.id ? updated : t)));
    const refresh = (blocks: TimeBlock[]) =>
      blocks.map((b) => (b.task_id === updated.id && b.task ? { ...b, task: { ...b.task, ...updated } } : b));
    setWeekBlocks(refresh);
    setNearbyBlocks(refresh);
  }, []);

  const warnings = useMemo(() => burnoutWarnings(weekBlocks, tasks, weekDates), [weekBlocks, tasks, weekDates]);

  return { tasks, weekBlocks, nearbyBlocks, weekDates, warnings, loading, loadError, reload, applyTask };
}
