import { useCallback, useEffect, useState } from 'react';
import { apiDelete, apiGet, apiPatch, apiPost } from '../../../app/lib/api';
import type { Task } from '../../../app/lib/tasks';

export type TaskPayload = Pick<Task, 'title' | 'description' | 'type' | 'priority' | 'due_date' | 'estimated_time'>;

/** Owns task API state so task components only decide how it is displayed. */
export function useTasks(userId?: string) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setTasks([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    apiGet('/api/tasks')
      .then((data) => !cancelled && setTasks(data))
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const createTask = useCallback(async (payload: TaskPayload) => {
    const created = await apiPost('/api/tasks', payload);
    setTasks((current) => [created, ...current]);
    return created as Task;
  }, []);

  const updateTask = useCallback(async (id: string, changes: Partial<Task>) => {
    const updated = await apiPatch(`/api/tasks/${id}`, changes);
    setTasks((current) => current.map((task) => (task.id === updated.id ? updated : task)));
    return updated as Task;
  }, []);

  const removeTask = useCallback(async (id: string) => {
    await apiDelete(`/api/tasks/${id}`);
    setTasks((current) => current.filter((task) => task.id !== id));
  }, []);

  const replaceTask = useCallback((task: Task) => {
    setTasks((current) => current.map((currentTask) => (currentTask.id === task.id ? task : currentTask)));
  }, []);

  return { tasks, loading, error, createTask, updateTask, removeTask, replaceTask };
}
