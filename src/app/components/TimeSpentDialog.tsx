import { useEffect, useState, FormEvent } from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from '@mui/material';
import { apiGet } from '../lib/api';
import { minutesSoFar } from '../lib/planner';

export interface FinishingTask {
  id: string;
  title: string;
  estimated_time: number | null;
  time_spent: number;
}

// The starting guess for "how long did it take?": the task's planner blocks so far, else what was
// recorded last time it was finished, else the estimate.
export async function suggestTimeSpent(task: FinishingTask): Promise<{ minutes: number | null; from: string | null }> {
  try {
    const planned = minutesSoFar(await apiGet(`/api/time-blocks?task_id=${task.id}`), task.id, new Date());
    if (planned > 0) return { minutes: planned, from: 'your planner blocks for it' };
  } catch {
    // No blocks to go on; fall back to what we know about the task.
  }
  if (task.time_spent > 0) return { minutes: task.time_spent, from: 'the last time you finished it' };
  if (task.estimated_time) return { minutes: task.estimated_time, from: 'your estimate' };
  return { minutes: null, from: null };
}

interface TimeSpentDialogProps {
  task: FinishingTask | null;
  // Called with the minutes, or null to finish the task without recording a time.
  onFinish: (minutes: number | null) => Promise<void>;
  onCancel: () => void;
}

// Asked when a task is checked off, so estimates can be compared with how long things really take.
export function TimeSpentDialog({ task, onFinish, onCancel }: TimeSpentDialogProps) {
  const [minutes, setMinutes] = useState('');
  const [from, setFrom] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!task) return;
    let cancelled = false;
    setMinutes('');
    setFrom(null);
    setError(null);
    setSaving(false);
    suggestTimeSpent(task).then((suggestion) => {
      if (cancelled) return;
      setMinutes(suggestion.minutes ? String(suggestion.minutes) : '');
      setFrom(suggestion.from);
    });
    return () => {
      cancelled = true;
    };
  }, [task]);

  const finish = async (value: number | null) => {
    setSaving(true);
    setError(null);
    try {
      await onFinish(value);
    } catch (err: any) {
      setError(err.message);
      setSaving(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const value = Number(minutes);
    if (!minutes || !Number.isInteger(value) || value <= 0) {
      setError('Enter a whole number of minutes, or choose Skip.');
      return;
    }
    finish(value);
  };

  return (
    <Dialog open={task !== null} onClose={() => !saving && onCancel()} fullWidth maxWidth="xs">
      <Box component="form" onSubmit={handleSubmit} noValidate>
        <DialogTitle>How long did it take?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            “{task?.title}”
            {task?.estimated_time ? ` — you estimated ${task.estimated_time} min.` : ''}
          </Typography>
          <TextField
            fullWidth
            autoFocus
            type="number"
            label="Minutes"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            helperText={from ? `Filled in from ${from}. Change it if it's off.` : ' '}
            slotProps={{ htmlInput: { min: 1, step: 5 } }}
          />
          {error && (
            <Typography variant="body2" color="error" sx={{ mt: 1 }}>
              {error}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Box sx={{ flex: 1 }} />
          <Button onClick={() => finish(null)} disabled={saving}>
            Skip
          </Button>
          <Button type="submit" variant="contained" disabled={saving} sx={{ backgroundColor: '#8b5cf6' }}>
            {saving ? 'Saving...' : 'Done'}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
