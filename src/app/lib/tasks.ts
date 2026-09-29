// Task logic with no React in it, so it can be unit-tested.

export interface Task {
  id: string;
  title: string;
  description: string | null;
  completed: boolean;
  priority: 'low' | 'medium' | 'high';
  type: 'homework' | 'exam' | 'project' | 'work' | 'study';
  due_date: string | null;
  estimated_time: number | null;
  completed_at: string | null;
  created_at: string;
  time_spent: number; // minutes it actually took, 0 until someone records it
}

const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

// Unfinished first (soonest due, undated last, then priority, then newest); finished below, most recently finished first.
export function sortTasks(tasks: Task[]) {
  const time = (value: string | null) => (value ? new Date(value).getTime() : null);
  return [...tasks].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    if (a.completed) return (time(b.completed_at) ?? 0) - (time(a.completed_at) ?? 0);
    const aDue = time(a.due_date);
    const bDue = time(b.due_date);
    if (aDue !== bDue) {
      if (aDue === null) return 1;
      if (bDue === null) return -1;
      return aDue - bDue;
    }
    if (a.priority !== b.priority) return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

// A type needs this many finished tasks with both an estimate and a recorded time before we say anything.
export const MIN_TASKS_FOR_RATIO = 2;

export interface EstimateRatio {
  ratio: number; // actual / estimated, e.g. 1.4 means it takes 40% longer than planned
  count: number;
}

// Per task type: how long finished tasks actually took compared to their estimates, as total actual
// minutes over total estimated minutes (so one tiny task can't swing it much).
export function estimateRatios(tasks: Task[]): Partial<Record<Task['type'], EstimateRatio>> {
  const totals = new Map<Task['type'], { actual: number; estimated: number; count: number }>();
  for (const task of tasks) {
    if (!task.completed || !task.estimated_time || !task.time_spent) continue;
    const total = totals.get(task.type) ?? { actual: 0, estimated: 0, count: 0 };
    total.actual += task.time_spent;
    total.estimated += task.estimated_time;
    total.count += 1;
    totals.set(task.type, total);
  }
  const ratios: Partial<Record<Task['type'], EstimateRatio>> = {};
  for (const [type, total] of totals) {
    if (total.count >= MIN_TASKS_FOR_RATIO) {
      ratios[type] = { ratio: Math.round((total.actual / total.estimated) * 10) / 10, count: total.count };
    }
  }
  return ratios;
}
