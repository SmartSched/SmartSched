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
