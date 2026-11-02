import { useEffect, useMemo, useState } from 'react';
import { addDays, format, parseISO, startOfWeek } from 'date-fns';
import { apiGet } from '../../../app/lib/api';
import { burnoutWarnings } from '../../../app/lib/burnout';
import type { Task } from '../../../app/lib/tasks';
import type { TimeBlock } from '../../../app/lib/planner';

/** Loads and derives the data displayed by the signed-in user's dashboard. */
export function useHomeDashboard(userId: string | undefined, today: string) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [weekBlocks, setWeekBlocks] = useState<TimeBlock[]>([]);
  const weekDates = useMemo(() => {
    const start = startOfWeek(parseISO(today), { weekStartsOn: 0 });
    return Array.from({ length: 7 }, (_, index) => format(addDays(start, index), 'yyyy-MM-dd'));
  }, [today]);

  useEffect(() => {
    if (!userId) return;
    apiGet('/api/tasks').then(setTasks).catch(() => {});
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const end = format(addDays(parseISO(weekDates[6]), 1), 'yyyy-MM-dd');
    apiGet(`/api/time-blocks?start=${weekDates[0]}&end=${end}`).then(setWeekBlocks).catch(() => {});
  }, [userId, weekDates]);

  const warnings = useMemo(() => burnoutWarnings(weekBlocks, tasks, weekDates), [weekBlocks, tasks, weekDates]);
  const completedTasks = useMemo(() => tasks.filter((task) => task.completed).length, [tasks]);
  return { totalTasks: tasks.length, completedTasks, warnings };
}
