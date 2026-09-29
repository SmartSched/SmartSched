import { useEffect, useMemo, useState, FormEvent } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Button,
  ButtonBase,
  Checkbox,
  IconButton,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Snackbar,
  Alert,
  Link as MuiLink,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import { Add, ChevronLeft, ChevronRight } from '@mui/icons-material';
import { addDays, format, parseISO, startOfWeek, subDays } from 'date-fns';
import { Link as RouterLink } from 'react-router';
import { useAuth } from '../lib/AuthContext';
import { apiGet, apiPost, apiPatch, apiDelete } from '../lib/api';
import { useSelectedDay } from '../lib/today';
import { layoutBlocks, toMinutes, type BlockTask, type TimeBlock } from '../lib/planner';
import { burnoutWarnings } from '../lib/burnout';
import { findOpenSlot, missedTaskBlocks, type Slot } from '../lib/reschedule';
import type { Task } from '../lib/tasks';
import { BurnoutBanner } from './BurnoutBanner';
import { TimeSpentDialog } from './TimeSpentDialog';

type BlockPayload = Omit<TimeBlock, 'id' | 'task'>;
type ViewMode = 'day' | 'week';

const HOUR_HEIGHT = 64; // px per hour on the grid
const MIN_BLOCK_HEIGHT = 26; // px, so very short blocks stay readable and clickable
const DEFAULT_START_HOUR = 7;
const DEFAULT_END_HOUR = 22; // grid runs until 10 PM unless a block goes later
const WEEK_STARTS_ON = 0; // 0 = Sunday

function formatTime(time: string) {
  const [hours, minutes] = time.split(':').map(Number);
  return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${hours < 12 ? 'AM' : 'PM'}`;
}

function formatHour(hour: number) {
  return `${hour % 12 || 12} ${hour < 12 ? 'AM' : 'PM'}`;
}

function formatDay(date: string) {
  const day = parseISO(date);
  return format(day, day.getFullYear() === new Date().getFullYear() ? 'EEEE, MMMM d' : 'EEEE, MMMM d, yyyy');
}

function formatWeekRange(weekStart: Date) {
  const weekEnd = addDays(weekStart, 6);
  const sameMonth = weekStart.getMonth() === weekEnd.getMonth();
  const sameYear = weekStart.getFullYear() === weekEnd.getFullYear();
  const startLabel = format(weekStart, sameMonth ? 'MMM d' : 'MMM d');
  const endLabel = format(weekEnd, sameYear ? (sameMonth ? 'd' : 'MMM d') : 'MMM d, yyyy');
  const year = sameYear ? `, ${weekStart.getFullYear()}` : '';
  return `${startLabel} – ${endLabel}${year}`;
}

const getTypeColor = (type: string) => {
  switch (type) {
    case 'class':
      return '#3b82f6';
    case 'study':
      return '#8b5cf6';
    case 'break':
      return '#10b981';
    case 'personal':
      return '#ec4899';
    case 'commute':
      return '#f59e0b';
    case 'meal':
      return '#06b6d4';
    case 'work':
      return '#64748b';
    case 'task':
      return '#4f46e5';
    default:
      return '#6b7280';
  }
};

interface BlockFormValues {
  activity: string;
  date: string;
  start_time: string; // HH:MM
  end_time: string; // HH:MM
  type: string;
  task_id: string; // '' unless type is 'task'
}

function emptyForm(date: string): BlockFormValues {
  return { activity: '', date, start_time: '09:00', end_time: '10:00', type: 'study', task_id: '' };
}

function toFormValues(block: TimeBlock): BlockFormValues {
  return {
    activity: block.activity,
    date: block.date,
    start_time: block.start_time.slice(0, 5),
    end_time: block.end_time.slice(0, 5),
    type: block.type,
    task_id: block.task_id ?? '',
  };
}

interface BlockFormProps {
  initial: BlockFormValues;
  submitLabel: string;
  submittingLabel: string;
  tasks: Task[];
  onSubmit: (payload: BlockPayload) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => void;
}

function BlockForm({ initial, submitLabel, submittingLabel, tasks, onSubmit, onCancel, onDelete }: BlockFormProps) {
  const [values, setValues] = useState(initial);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const endBeforeStart = values.start_time !== '' && values.end_time !== '' && values.end_time <= values.start_time;
  const isTask = values.type === 'task';
  // Open tasks, plus this block's own task even if it's been finished since.
  const taskOptions = tasks.filter((t) => !t.completed || t.id === values.task_id);
  const pickedTask = tasks.find((t) => t.id === values.task_id);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isTask && !pickedTask) {
      setError('Pick the task this time is for.');
      return;
    }
    if (!isTask && !values.activity.trim()) {
      setError('Give the block an activity name.');
      return;
    }
    if (!values.date || !values.start_time || !values.end_time) {
      setError('Pick a date, start time, and end time.');
      return;
    }
    if (endBeforeStart) {
      setError('End time must be after the start time.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        // A task block is named after its task, so it still reads sensibly anywhere the task isn't attached.
        activity: isTask && pickedTask ? pickedTask.title : values.activity.trim(),
        date: values.date,
        start_time: values.start_time,
        end_time: values.end_time,
        type: values.type as TimeBlock['type'],
        task_id: isTask ? values.task_id : null,
      });
    } catch (err: any) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  return (
    <Box component="form" onSubmit={handleSubmit} noValidate sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <FormControl fullWidth>
        <InputLabel>Type</InputLabel>
        <Select value={values.type} label="Type" onChange={(e) => setValues({ ...values, type: e.target.value })}>
          <MenuItem value="task">Task (time for one of your tasks)</MenuItem>
          <MenuItem value="class">Class</MenuItem>
          <MenuItem value="study">Study</MenuItem>
          <MenuItem value="break">Break</MenuItem>
          <MenuItem value="personal">Personal</MenuItem>
          <MenuItem value="commute">Commute</MenuItem>
          <MenuItem value="meal">Meal</MenuItem>
          <MenuItem value="work">Work</MenuItem>
        </Select>
      </FormControl>
      {isTask ? (
        <FormControl fullWidth>
          <InputLabel>Task</InputLabel>
          <Select
            value={values.task_id}
            label="Task"
            onChange={(e) => setValues({ ...values, task_id: e.target.value })}
          >
            {taskOptions.map((t) => (
              <MenuItem key={t.id} value={t.id}>
                {t.title}
              </MenuItem>
            ))}
          </Select>
          {taskOptions.length === 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
              No open tasks. Add one on the Tasks page first.
            </Typography>
          )}
        </FormControl>
      ) : (
        <TextField
          fullWidth
          label="Activity"
          value={values.activity}
          onChange={(e) => setValues({ ...values, activity: e.target.value })}
          placeholder="e.g., CSC 453 Lecture"
          autoFocus
        />
      )}
      <TextField
        fullWidth
        label="Date"
        type="date"
        value={values.date}
        onChange={(e) => setValues({ ...values, date: e.target.value })}
        slotProps={{ inputLabel: { shrink: true } }}
      />
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
        <TextField
          fullWidth
          label="Start Time"
          type="time"
          value={values.start_time}
          onChange={(e) => setValues({ ...values, start_time: e.target.value })}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          fullWidth
          label="End Time"
          type="time"
          value={values.end_time}
          onChange={(e) => setValues({ ...values, end_time: e.target.value })}
          error={endBeforeStart}
          helperText={endBeforeStart ? 'Must be after the start time' : undefined}
          slotProps={{ inputLabel: { shrink: true } }}
        />
      </Box>
      {error && (
        <Typography variant="body2" color="error">
          {error}
        </Typography>
      )}
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
        {onDelete && (
          <Button color="error" onClick={onDelete} disabled={submitting}>
            Delete
          </Button>
        )}
        <Box sx={{ flex: 1 }} />
        <Button onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="contained"
          disabled={submitting || endBeforeStart}
          sx={{ backgroundColor: '#8b5cf6', '&:hover': { backgroundColor: '#7c3aed' } }}
        >
          {submitting ? submittingLabel : submitLabel}
        </Button>
      </Box>
    </Box>
  );
}

// How far around today the planner looks for task blocks that were missed, and for room to move them.
const NEARBY_DAYS = 14;
const LEFT_KEY = 'smartsched.leftMissedBlocks';

function formatSlot(slot: Pick<Slot, 'date' | 'start_time' | 'end_time'>) {
  return `${format(parseISO(slot.date), 'EEE, MMM d')}, ${formatTime(slot.start_time)} – ${formatTime(slot.end_time)}`;
}

function durationText(block: TimeBlock) {
  const minutes = toMinutes(block.end_time) - toMinutes(block.start_time);
  return minutes % 60 === 0 ? `${minutes / 60}-hour` : `${minutes}-minute`;
}

// Missed blocks the user chose to leave where they are, remembered in this browser. Storage can be
// unavailable (private windows, blocked site data), so every access is guarded.
function readLeftBlocks(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(LEFT_KEY) ?? '[]'));
  } catch {
    return new Set();
  }
}

function saveLeftBlocks(ids: Set<string>) {
  try {
    localStorage.setItem(LEFT_KEY, JSON.stringify([...ids]));
  } catch {
    // Not remembered past this visit; the prompt just comes back next time.
  }
}

// Shared between the day view (one wide column) and week view (7 narrow columns) so both
// reuse the same duration-based sizing, colors, and click behavior.
interface TimeBlockItemProps {
  block: TimeBlock;
  column: number;
  columns: number;
  startHour: number;
  dense?: boolean;
  onClick: () => void;
  onToggleTask: (block: TimeBlock) => void;
}

function TimeBlockItem({ block, column, columns, startHour, dense, onClick, onToggleTask }: TimeBlockItemProps) {
  const start = toMinutes(block.start_time);
  const end = toMinutes(block.end_time);
  const top = ((start - startHour * 60) / 60) * HOUR_HEIGHT;
  const height = Math.max(((end - start) / 60) * HOUR_HEIGHT, MIN_BLOCK_HEIGHT);
  const compact = height < 48;
  const color = getTypeColor(block.type);
  const timeRange = `${formatTime(block.start_time)} – ${formatTime(block.end_time)}`;
  const gap = dense ? 2 : 4;
  // Task blocks show the task's current title and priority, and a checkbox that completes the task.
  const task = block.type === 'task' ? block.task : null;
  const title = task?.title ?? block.activity;

  return (
    <Box
      sx={{
        position: 'absolute',
        top,
        height,
        left: `calc(${(column * 100) / columns}% + ${gap}px)`,
        width: `calc(${100 / columns}% - ${gap * 2}px)`,
        backgroundColor: color + '20',
        border: `2px solid ${color}`,
        borderRadius: dense ? '6px' : '10px',
        display: 'flex',
        alignItems: compact ? 'center' : 'flex-start',
        overflow: 'hidden',
        boxSizing: 'border-box',
        opacity: task?.completed ? 0.6 : 1,
        '&:hover': { backgroundColor: color + '35' },
      }}
    >
      {task && (
        <Checkbox
          size="small"
          checked={task.completed}
          onChange={() => onToggleTask(block)}
          slotProps={{ input: { 'aria-label': `${task.completed ? 'Reopen' : 'Check off'} ${title}` } }}
          sx={{ p: dense ? 0.25 : 0.5, color, '&.Mui-checked': { color } }}
        />
      )}
      <ButtonBase
        onClick={onClick}
        aria-label={`Edit ${title}, ${timeRange}`}
        sx={{
          flex: 1,
          minWidth: 0,
          height: '100%',
          px: task ? 0.25 : dense ? 0.5 : 1.25,
          py: compact ? 0 : dense ? 0.25 : 0.75,
          display: 'flex',
          flexDirection: compact ? 'row' : 'column',
          alignItems: compact ? 'center' : 'flex-start',
          justifyContent: 'flex-start',
          gap: compact ? 1 : 0,
          textAlign: 'left',
        }}
      >
        <Typography
          variant={dense ? 'caption' : 'body2'}
          noWrap
          sx={{ fontWeight: 600, color, minWidth: 0, maxWidth: '100%', textDecoration: task?.completed ? 'line-through' : 'none' }}
        >
          {title}
        </Typography>
        {!dense && (
          <Typography variant="caption" color="text.secondary" noWrap sx={{ flexShrink: 0 }}>
            {timeRange}
            {task ? ` · ${task.priority} priority` : ''}
          </Typography>
        )}
      </ButtonBase>
    </Box>
  );
}

export function DailyPlanner() {
  const { user } = useAuth();
  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const { today, selectedDate, setSelectedDate } = useSelectedDay();
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingBlock, setEditingBlock] = useState<TimeBlock | null>(null);
  const [deletingBlock, setDeletingBlock] = useState<TimeBlock | null>(null);
  const [deleteInProgress, setDeleteInProgress] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  // Blocks from two weeks back to two weeks ahead, for spotting missed task blocks (#9) and finding room.
  const [nearbyBlocks, setNearbyBlocks] = useState<TimeBlock[]>([]);
  const [nearbyVersion, setNearbyVersion] = useState(0);
  const [finishingTask, setFinishingTask] = useState<BlockTask | null>(null);
  const [leftBlocks, setLeftBlocks] = useState<Set<string>>(readLeftBlocks);
  const [now, setNow] = useState(() => Date.now());

  const weekStart = useMemo(
    () => startOfWeek(parseISO(selectedDate), { weekStartsOn: WEEK_STARTS_ON }),
    [selectedDate]
  );
  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => format(addDays(weekStart, i), 'yyyy-MM-dd')),
    [weekStart]
  );

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    const query =
      viewMode === 'day'
        ? `date=${selectedDate}`
        : `start=${weekDates[0]}&end=${weekDates[6]}`;

    apiGet(`/api/time-blocks?${query}`)
      .then((data) => !cancelled && setTimeBlocks(data))
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [user, viewMode, selectedDate, weekDates]);

  useEffect(() => {
    if (!user) return;
    apiGet('/api/tasks')
      .then(setTasks)
      .catch(() => {}); // the task picker and due dates just stay empty; the Tasks page shows the error
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const start = format(subDays(parseISO(today), NEARBY_DAYS), 'yyyy-MM-dd');
    const end = format(addDays(parseISO(today), NEARBY_DAYS), 'yyyy-MM-dd');
    apiGet(`/api/time-blocks?start=${start}&end=${end}`)
      .then((data) => !cancelled && setNearbyBlocks(data))
      .catch(() => {}); // without these the missed-block prompts just don't show
    return () => {
      cancelled = true;
    };
  }, [user, today, nearbyVersion]);

  // Blocks end while the page is open, so re-check for missed ones every minute.
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const missed = useMemo(() => {
    const at = new Date(now);
    return missedTaskBlocks(nearbyBlocks, at)
      .filter((block) => !leftBlocks.has(block.id))
      .map((block) => ({
        block,
        slot: findOpenSlot(block, nearbyBlocks, at, block.task?.due_date ? new Date(block.task.due_date) : null),
      }));
  }, [nearbyBlocks, now, leftBlocks]);

  const warnings = useMemo(
    () => (viewMode === 'week' ? burnoutWarnings(timeBlocks, tasks, weekDates) : []),
    [viewMode, timeBlocks, tasks, weekDates],
  );

  const placedBlocks = useMemo(
    () => layoutBlocks(timeBlocks, (MIN_BLOCK_HEIGHT / HOUR_HEIGHT) * 60),
    [timeBlocks],
  );
  const blocksByDate = useMemo(() => {
    const map = new Map<string, TimeBlock[]>();
    for (const block of timeBlocks) {
      map.set(block.date, [...(map.get(block.date) ?? []), block]);
    }
    return map;
  }, [timeBlocks]);

  // Widen the grid past 7 AM–10 PM when a block starts earlier or ends later.
  const startHour = Math.min(DEFAULT_START_HOUR, ...timeBlocks.map((b) => Math.floor(toMinutes(b.start_time) / 60)));
  const endHour = Math.max(DEFAULT_END_HOUR, ...timeBlocks.map((b) => Math.ceil(toMinutes(b.end_time) / 60)));
  const hours = Array.from({ length: endHour - startHour }, (_, i) => i + startHour);

  const changeDay = (days: number) => {
    setSelectedDate((current) => format(addDays(parseISO(current), days), 'yyyy-MM-dd'));
  };

  const changeWeek = (weeks: number) => {
    setSelectedDate((current) => format(addDays(parseISO(current), weeks * 7), 'yyyy-MM-dd'));
  };

  const goToPrevious = () => (viewMode === 'day' ? changeDay(-1) : changeWeek(-1));
  const goToNext = () => (viewMode === 'day' ? changeDay(1) : changeWeek(1));

  // A block saved to another day takes the view to that day (in day mode), so it doesn't seem to vanish.
  const showSavedBlock = (saved: TimeBlock) => {
    if (viewMode === 'week' && weekDates.includes(saved.date)) {
      setTimeBlocks((current) => [...current.filter((b) => b.id !== saved.id), saved]);
    } else if (saved.date === selectedDate) {
      setTimeBlocks((current) => [...current.filter((b) => b.id !== saved.id), saved]);
    } else {
      setSelectedDate(saved.date);
      if (viewMode === 'week') setViewMode('day');
    }
  };

  const handleAddBlock = async (payload: BlockPayload) => {
    const created = await apiPost('/api/time-blocks', payload);
    showSavedBlock(created);
    setShowForm(false);
    setNearbyVersion((v) => v + 1);
  };

  const handleEditBlock = async (payload: BlockPayload) => {
    if (!editingBlock) return;
    const updated = await apiPatch(`/api/time-blocks/${editingBlock.id}`, payload);
    showSavedBlock(updated);
    setEditingBlock(null);
    setNearbyVersion((v) => v + 1);
  };

  // Every block for a task shows the task's latest state (checked or not).
  const applyTask = (updated: Task) => {
    setTasks((current) => current.map((t) => (t.id === updated.id ? updated : t)));
    const refresh = (blocks: TimeBlock[]) =>
      blocks.map((b) => (b.task_id === updated.id && b.task ? { ...b, task: { ...b.task, ...updated } } : b));
    setTimeBlocks(refresh);
    setNearbyBlocks(refresh);
  };

  const updateTask = async (taskId: string, changes: { completed: boolean; time_spent?: number }) => {
    try {
      applyTask(await apiPatch(`/api/tasks/${taskId}`, changes));
    } catch {
      setActionError("Couldn't update the task. Try again.");
    }
  };

  // Checking off a task block completes the task (after asking how long it took); unchecking reopens it.
  const handleToggleTask = (block: TimeBlock) => {
    if (!block.task) return;
    if (block.task.completed) updateTask(block.task.id, { completed: false });
    else setFinishingTask(block.task);
  };

  const finishTask = async (minutes: number | null) => {
    if (!finishingTask) return;
    const taskId = finishingTask.id;
    setFinishingTask(null);
    await updateTask(taskId, minutes === null ? { completed: true } : { completed: true, time_spent: minutes });
  };

  const isShown = (date: string) => (viewMode === 'day' ? date === selectedDate : weekDates.includes(date));

  const moveBlock = async (block: TimeBlock, slot: Slot) => {
    try {
      const moved: TimeBlock = await apiPatch(`/api/time-blocks/${block.id}`, slot);
      setNearbyBlocks((current) => current.map((b) => (b.id === moved.id ? moved : b)));
      setTimeBlocks((current) => [...current.filter((b) => b.id !== moved.id), ...(isShown(moved.date) ? [moved] : [])]);
      setNotice(`Moved “${moved.task?.title ?? moved.activity}” to ${formatSlot(moved)}.`);
    } catch {
      setActionError("Couldn't move the block. Try again.");
    }
  };

  const leaveBlock = (block: TimeBlock) => {
    const next = new Set(leftBlocks).add(block.id);
    setLeftBlocks(next);
    saveLeftBlocks(next);
  };

  const handleDeleteBlock = async () => {
    if (!deletingBlock) return;
    setDeleteInProgress(true);
    try {
      await apiDelete(`/api/time-blocks/${deletingBlock.id}`);
      setTimeBlocks((current) => current.filter((b) => b.id !== deletingBlock.id));
      setNearbyBlocks((current) => current.filter((b) => b.id !== deletingBlock.id));
      setDeletingBlock(null);
    } catch {
      setActionError("Couldn't delete time block. Try again.");
    } finally {
      setDeleteInProgress(false);
    }
  };

  if (!user) {
    return (
      <Typography variant="body2" color="text.secondary">
        <MuiLink component={RouterLink} to="/auth">Log in</MuiLink> to see and add your schedule.
      </Typography>
    );
  }

  const isToday = selectedDate === today;
  const isCurrentWeek = weekDates.includes(today);

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, color: '#8b5cf6' }}>
          {viewMode === 'day' ? 'Daily Schedule' : 'Weekly Schedule'}
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <ToggleButtonGroup
            value={viewMode}
            exclusive
            size="small"
            onChange={(_, newMode) => newMode && setViewMode(newMode)}
          >
            <ToggleButton value="day">Day</ToggleButton>
            <ToggleButton value="week">Week</ToggleButton>
          </ToggleButtonGroup>
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={() => setShowForm(!showForm)}
            sx={{ backgroundColor: '#8b5cf6', '&:hover': { backgroundColor: '#7c3aed' } }}
          >
            Add Time Block
          </Button>
        </Box>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
        <IconButton aria-label={viewMode === 'day' ? 'Previous day' : 'Previous week'} onClick={goToPrevious}>
          <ChevronLeft />
        </IconButton>
        <Typography variant="h6" sx={{ fontWeight: 600, minWidth: { sm: 260 }, textAlign: 'center' }}>
          {viewMode === 'day' ? formatDay(selectedDate) : formatWeekRange(weekStart)}
        </Typography>
        <IconButton aria-label={viewMode === 'day' ? 'Next day' : 'Next week'} onClick={goToNext}>
          <ChevronRight />
        </IconButton>
        <Button
          size="small"
          onClick={() => setSelectedDate(today)}
          disabled={viewMode === 'day' ? isToday : isCurrentWeek}
        >
          Today
        </Button>
      </Box>

      {missed.map(({ block, slot }) => {
        const title = block.task?.title ?? block.activity;
        const due = block.task?.due_date ? format(new Date(block.task.due_date), 'EEE, MMM d, h:mm a') : null;
        return slot ? (
          <Alert
            key={block.id}
            severity="info"
            sx={{ mb: 2, borderRadius: '12px' }}
            action={
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <Button size="small" variant="contained" onClick={() => moveBlock(block, slot)}>
                  Move it
                </Button>
                <Button size="small" color="inherit" onClick={() => leaveBlock(block)}>
                  Leave it
                </Button>
              </Box>
            }
          >
            “{title}” was planned for {formatSlot(block)} and isn't checked off. The next open time is{' '}
            <strong>{formatSlot(slot)}</strong>.
          </Alert>
        ) : (
          <Alert
            key={block.id}
            severity="warning"
            sx={{ mb: 2, borderRadius: '12px' }}
            action={
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <Button size="small" color="inherit" onClick={() => setEditingBlock(block)}>
                  Edit block
                </Button>
                <Button size="small" color="inherit" onClick={() => leaveBlock(block)}>
                  Leave it
                </Button>
              </Box>
            }
          >
            <strong>At risk:</strong> “{title}” was planned for {formatSlot(block)} and isn't checked off, and there's
            no open {durationText(block)} slot {due ? `before it's due (${due})` : 'in the next two weeks'}.
          </Alert>
        );
      })}

      {viewMode === 'week' && <BurnoutBanner warnings={warnings} />}

      {showForm && (
        <Card sx={{ mb: 3, borderRadius: '16px' }}>
          <CardContent>
            <BlockForm
              initial={emptyForm(viewMode === 'day' ? selectedDate : today)}
              submitLabel="Add Block"
              submittingLabel="Adding..."
              tasks={tasks}
              onSubmit={handleAddBlock}
              onCancel={() => setShowForm(false)}
            />
          </CardContent>
        </Card>
      )}

      {error && (
        <Typography variant="body2" color="error" sx={{ mb: 2 }}>
          {error}
        </Typography>
      )}

      {loading ? (
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
          Loading...
        </Typography>
      ) : viewMode === 'day' ? (
        <Card sx={{ borderRadius: '16px' }}>
          <CardContent>
            {timeBlocks.length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', pb: 2 }}>
                Nothing scheduled for this day — add a time block above
              </Typography>
            )}
            <Box sx={{ display: 'flex' }}>
              <Box sx={{ width: '80px', flexShrink: 0 }}>
                {hours.map((hour) => (
                  <Box key={hour} sx={{ height: HOUR_HEIGHT, pr: 2, pt: 0.5 }}>
                    <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                      {formatHour(hour)}
                    </Typography>
                  </Box>
                ))}
              </Box>
              <Box sx={{ flex: 1, position: 'relative', borderLeft: '2px solid #e5e7eb' }}>
                {hours.map((hour, index) => (
                  <Box key={hour} sx={{ height: HOUR_HEIGHT, borderTop: index > 0 ? '1px dashed #e5e7eb' : 'none' }} />
                ))}
                {placedBlocks.map(({ block, column, columns }) => (
                  <TimeBlockItem
                    key={block.id}
                    block={block}
                    column={column}
                    columns={columns}
                    startHour={startHour}
                    onClick={() => setEditingBlock(block)}
                    onToggleTask={handleToggleTask}
                  />
                ))}
              </Box>
            </Box>
          </CardContent>
        </Card>
      ) : (
        <Card sx={{ borderRadius: '16px' }}>
          <CardContent sx={{ overflowX: 'auto' }}>
            <Box sx={{ minWidth: 780 }}>
              <Box sx={{ display: 'flex' }}>
                <Box sx={{ width: '56px', flexShrink: 0 }} />
                {weekDates.map((date) => {
                  const day = parseISO(date);
                  const isDayToday = date === today;
                  return (
                    <Box key={date} sx={{ flex: 1, textAlign: 'center', pb: 1 }}>
                      <Typography
                        variant="body2"
                        sx={{ fontWeight: 700, color: isDayToday ? '#8b5cf6' : 'text.primary' }}
                      >
                        {format(day, 'EEE')}
                      </Typography>
                      <Typography variant="caption" sx={{ color: isDayToday ? '#8b5cf6' : 'text.secondary' }}>
                        {format(day, 'd')}
                      </Typography>
                    </Box>
                  );
                })}
              </Box>
              <Box sx={{ display: 'flex' }}>
                <Box sx={{ width: '56px', flexShrink: 0 }}>
                  {hours.map((hour) => (
                    <Box key={hour} sx={{ height: HOUR_HEIGHT, pr: 1, pt: 0.5 }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                        {formatHour(hour)}
                      </Typography>
                    </Box>
                  ))}
                </Box>
                {weekDates.map((date) => {
                  const dayBlocks = layoutBlocks(blocksByDate.get(date) ?? []);
                  return (
                    <Box
                      key={date}
                      sx={{ flex: 1, position: 'relative', borderLeft: '1px solid #e5e7eb' }}
                    >
                      {hours.map((hour, index) => (
                        <Box key={hour} sx={{ height: HOUR_HEIGHT, borderTop: index > 0 ? '1px dashed #e5e7eb' : 'none' }} />
                      ))}
                      {dayBlocks.map(({ block, column, columns }) => (
                        <TimeBlockItem
                          key={block.id}
                          block={block}
                          column={column}
                          columns={columns}
                          startHour={startHour}
                          dense
                          onClick={() => setEditingBlock(block)}
                          onToggleTask={handleToggleTask}
                        />
                      ))}
                    </Box>
                  );
                })}
              </Box>
            </Box>
          </CardContent>
        </Card>
      )}

      <Dialog open={editingBlock !== null} onClose={() => setEditingBlock(null)} fullWidth maxWidth="sm">
        <DialogTitle>Edit time block</DialogTitle>
        <DialogContent>
          {editingBlock && (
            <Box sx={{ pt: 1 }}>
              <BlockForm
                key={editingBlock.id}
                initial={toFormValues(editingBlock)}
                submitLabel="Save"
                submittingLabel="Saving..."
                tasks={tasks}
                onSubmit={handleEditBlock}
                onCancel={() => setEditingBlock(null)}
                onDelete={() => {
                  setDeletingBlock(editingBlock);
                  setEditingBlock(null);
                }}
              />
            </Box>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={deletingBlock !== null} onClose={() => !deleteInProgress && setDeletingBlock(null)}>
        <DialogTitle>Delete time block?</DialogTitle>
        <DialogContent>
          <DialogContentText>Delete "{deletingBlock?.activity}"? This can't be undone.</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeletingBlock(null)} disabled={deleteInProgress}>
            Cancel
          </Button>
          <Button color="error" variant="contained" onClick={handleDeleteBlock} disabled={deleteInProgress}>
            {deleteInProgress ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      <TimeSpentDialog task={finishingTask} onFinish={finishTask} onCancel={() => setFinishingTask(null)} />

      <Snackbar
        open={notice !== null}
        autoHideDuration={5000}
        onClose={() => setNotice(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="success" onClose={() => setNotice(null)} sx={{ width: '100%' }}>
          {notice}
        </Alert>
      </Snackbar>

      <Snackbar
        open={actionError !== null}
        autoHideDuration={5000}
        onClose={() => setActionError(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="error" onClose={() => setActionError(null)} sx={{ width: '100%' }}>
          {actionError}
        </Alert>
      </Snackbar>
    </Box>
  );
}
