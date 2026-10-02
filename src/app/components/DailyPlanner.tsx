import { useEffect, useMemo, useState, FormEvent } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Button,
  ButtonBase,
  Checkbox,
  FormControlLabel,
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
import { apiGet, apiPost, apiPatch, apiPut, apiDelete } from '../lib/api';
import { useSelectedDay } from '../lib/today';
import { layoutBlocks, toMinutes, type BlockTask, type TimeBlock } from '../lib/planner';
import { burnoutWarnings } from '../lib/burnout';
import { findOpenSlot, missedTaskBlocks, type Slot } from '../lib/reschedule';
import type { Task } from '../lib/tasks';
import { allPlaces, placeLabel } from '../lib/places';
import { useProfile } from '../lib/ProfileContext';
import { BurnoutBanner } from './BurnoutBanner';
import { TimeSpentDialog } from './TimeSpentDialog';

type BlockPayload = Omit<TimeBlock, 'id' | 'task' | 'series' | 'series_id' | 'auto'>;

// What the server says about commutes after a save (see server/commute.js).
interface CommuteReport {
  failed?: boolean; // the block saved, but working out commutes didn't
  added: { activity: string; start_time: string }[];
  tight: { date: string; from: string; to: string; gap: number; needed: number; after: string; before: string }[];
}
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

// A new repeat runs about a semester unless the user changes it.
const REPEAT_WEEKS = 15;
const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface RepeatValues {
  enabled: boolean;
  days: number[]; // 0 = Sunday
  interval: 1 | 2;
  start_date: string;
  end_date: string;
}

interface BlockFormValues {
  activity: string;
  date: string;
  start_time: string; // HH:MM
  end_time: string; // HH:MM
  type: string;
  task_id: string; // '' unless type is 'task'
  location: string; // '' = not set
  repeat: RepeatValues;
}

type SeriesPayload = Omit<BlockPayload, 'date' | 'task_id'> & {
  days_of_week: number[];
  interval_weeks: 1 | 2;
  start_date: string;
  end_date: string;
};

// What the form hands back: this block's fields, the repeat rule when it repeats, and, for a block that's
// part of a repeat, whether the change is for just this one or all of them.
interface BlockSubmission {
  block: BlockPayload;
  repeat: SeriesPayload | null;
  scope: 'one' | 'all';
}

function defaultRepeat(date: string): RepeatValues {
  return {
    enabled: false,
    days: [parseISO(date).getDay()],
    interval: 1,
    start_date: date,
    end_date: format(addDays(parseISO(date), REPEAT_WEEKS * 7 - 1), 'yyyy-MM-dd'),
  };
}

function emptyForm(date: string): BlockFormValues {
  return {
    activity: '',
    date,
    start_time: '09:00',
    end_time: '10:00',
    type: 'study',
    task_id: '',
    location: '',
    repeat: defaultRepeat(date),
  };
}

function toFormValues(block: TimeBlock): BlockFormValues {
  return {
    activity: block.activity,
    date: block.date,
    start_time: block.start_time.slice(0, 5),
    end_time: block.end_time.slice(0, 5),
    type: block.type,
    task_id: block.task_id ?? '',
    location: block.location ?? '',
    repeat: block.series
      ? {
          enabled: true,
          days: block.series.days_of_week,
          interval: block.series.interval_weeks,
          start_date: block.series.start_date,
          end_date: block.series.end_date,
        }
      : defaultRepeat(block.date),
  };
}

interface BlockFormProps {
  initial: BlockFormValues;
  submitLabel: string;
  submittingLabel: string;
  tasks: Task[];
  places: string[];
  // Adding: the block can be set to repeat. Editing one from a repeat: save just it, or all of them.
  mode: 'add' | 'edit';
  inSeries?: boolean;
  onSubmit: (submission: BlockSubmission) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => void;
}

function BlockForm({
  initial,
  submitLabel,
  submittingLabel,
  tasks,
  places,
  mode,
  inSeries = false,
  onSubmit,
  onCancel,
  onDelete,
}: BlockFormProps) {
  const [values, setValues] = useState(initial);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const endBeforeStart = values.start_time !== '' && values.end_time !== '' && values.end_time <= values.start_time;
  const isTask = values.type === 'task';
  // Open tasks, plus this block's own task even if it's been finished since.
  const taskOptions = tasks.filter((t) => !t.completed || t.id === values.task_id);
  const pickedTask = tasks.find((t) => t.id === values.task_id);
  // Task blocks are one-offs; anything else can repeat when it's being added.
  const canRepeat = !isTask && (mode === 'add' || inSeries);
  const repeating = canRepeat && values.repeat.enabled;
  const placeOptions = values.location && !places.includes(values.location) ? [...places, values.location] : places;
  const setRepeat = (changes: Partial<RepeatValues>) => setValues({ ...values, repeat: { ...values.repeat, ...changes } });

  const submit = async (scope: 'one' | 'all') => {
    if (isTask && !pickedTask) {
      setError('Pick the task this time is for.');
      return;
    }
    if (!isTask && !values.activity.trim()) {
      setError('Give the block an activity name.');
      return;
    }
    if (!values.start_time || !values.end_time || (!repeating && !values.date)) {
      setError('Pick a date, start time, and end time.');
      return;
    }
    if (endBeforeStart) {
      setError('End time must be after the start time.');
      return;
    }
    if (repeating && (values.repeat.days.length === 0 || !values.repeat.start_date || !values.repeat.end_date)) {
      setError('Pick the days it repeats on, and when it starts and ends.');
      return;
    }
    if (repeating && values.repeat.end_date < values.repeat.start_date) {
      setError('The repeat has to end on or after the day it starts.');
      return;
    }
    const block: BlockPayload = {
      // A task block is named after its task, so it still reads sensibly anywhere the task isn't attached.
      activity: isTask && pickedTask ? pickedTask.title : values.activity.trim(),
      date: repeating && mode === 'add' ? values.repeat.start_date : values.date,
      start_time: values.start_time,
      end_time: values.end_time,
      type: values.type as TimeBlock['type'],
      task_id: isTask ? values.task_id : null,
      location: values.location || null,
    };
    const { date, task_id, ...fields } = block;
    const repeat: SeriesPayload | null = repeating
      ? {
          ...fields,
          days_of_week: values.repeat.days,
          interval_weeks: values.repeat.interval,
          start_date: values.repeat.start_date,
          end_date: values.repeat.end_date,
        }
      : null;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ block, repeat, scope });
    } catch (err: any) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit('one');
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
      <FormControl fullWidth>
        <InputLabel>Where (optional)</InputLabel>
        <Select
          value={values.location}
          label="Where (optional)"
          onChange={(e) => setValues({ ...values, location: e.target.value })}
        >
          <MenuItem value="">
            <em>Not set</em>
          </MenuItem>
          {placeOptions.map((place) => (
            <MenuItem key={place} value={place}>
              {placeLabel(place)}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      {!(repeating && mode === 'add') && (
        <TextField
          fullWidth
          label="Date"
          type="date"
          value={values.date}
          onChange={(e) => setValues({ ...values, date: e.target.value })}
          slotProps={{ inputLabel: { shrink: true } }}
        />
      )}
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

      {canRepeat && (
        <Box sx={{ border: '1px solid #e5e7eb', borderRadius: '12px', p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <FormControlLabel
            control={
              <Checkbox
                checked={values.repeat.enabled}
                disabled={inSeries}
                onChange={(e) => setRepeat({ enabled: e.target.checked })}
              />
            }
            label={inSeries ? 'Repeats' : 'Repeat weekly'}
            sx={{ m: 0 }}
          />
          {values.repeat.enabled && (
            <>
              {inSeries && (
                <Typography variant="caption" color="text.secondary">
                  Changes here only apply if you save all in the series.
                </Typography>
              )}
              <ToggleButtonGroup
                size="small"
                value={values.repeat.days}
                onChange={(_, days: number[]) => setRepeat({ days: [...days].sort((a, b) => a - b) })}
                aria-label="Days it repeats on"
              >
                {WEEKDAY_LETTERS.map((letter, day) => (
                  <ToggleButton key={day} value={day} aria-label={WEEKDAY_NAMES[day]} sx={{ width: 40 }}>
                    {letter}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
              <FormControl fullWidth size="small">
                <InputLabel>How often</InputLabel>
                <Select
                  value={values.repeat.interval}
                  label="How often"
                  onChange={(e) => setRepeat({ interval: Number(e.target.value) as 1 | 2 })}
                >
                  <MenuItem value={1}>Every week</MenuItem>
                  <MenuItem value={2}>Every other week</MenuItem>
                </Select>
              </FormControl>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                <TextField
                  size="small"
                  label="From"
                  type="date"
                  value={values.repeat.start_date}
                  onChange={(e) => setRepeat({ start_date: e.target.value })}
                  slotProps={{ inputLabel: { shrink: true } }}
                />
                <TextField
                  size="small"
                  label="Until"
                  type="date"
                  value={values.repeat.end_date}
                  onChange={(e) => setRepeat({ end_date: e.target.value })}
                  slotProps={{ inputLabel: { shrink: true } }}
                />
              </Box>
            </>
          )}
        </Box>
      )}

      {error && (
        <Typography variant="body2" color="error">
          {error}
        </Typography>
      )}
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        {onDelete && (
          <Button color="error" onClick={onDelete} disabled={submitting}>
            Delete
          </Button>
        )}
        <Box sx={{ flex: 1 }} />
        <Button onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        {inSeries ? (
          <>
            <Button variant="outlined" disabled={submitting || endBeforeStart} onClick={() => submit('one')}>
              Save just this one
            </Button>
            <Button
              variant="contained"
              disabled={submitting || endBeforeStart}
              onClick={() => submit('all')}
              sx={{ backgroundColor: '#8b5cf6', '&:hover': { backgroundColor: '#7c3aed' } }}
            >
              {submitting ? submittingLabel : 'Save all in the series'}
            </Button>
          </>
        ) : (
          <Button
            type="submit"
            variant="contained"
            disabled={submitting || endBeforeStart}
            sx={{ backgroundColor: '#8b5cf6', '&:hover': { backgroundColor: '#7c3aed' } }}
          >
            {submitting ? submittingLabel : submitLabel}
          </Button>
        )}
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
        // Commutes the app added itself get a dashed border.
        border: `2px ${block.auto ? 'dashed' : 'solid'} ${color}`,
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
            {block.location ? ` · ${placeLabel(block.location)}` : ''}
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
  const [notice, setNotice] = useState<{ text: string; severity: 'success' | 'info' | 'warning' } | null>(null);
  const { profile } = useProfile();
  const places = allPlaces(profile?.travel);
  // Saving can add or remove automatic commutes elsewhere on the day, so the view reloads after each change.
  const [reloadVersion, setReloadVersion] = useState(0);
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
  }, [user, viewMode, selectedDate, weekDates, reloadVersion]);

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

  const reload = () => {
    setReloadVersion((v) => v + 1);
    setNearbyVersion((v) => v + 1);
  };

  // What the server did about commutes after a save: a trip that doesn't fit matters more than one added.
  const reportCommutes = (commutes: CommuteReport | undefined, fallback: string | null = null) => {
    const [tight] = commutes?.tight ?? [];
    const added = commutes?.added ?? [];
    if (commutes?.failed) {
      setNotice({ severity: 'warning', text: "Saved, but commutes for that day couldn't be worked out. Try saving again." });
    } else if (tight) {
      const more = commutes!.tight.length > 1 ? ` (and ${commutes!.tight.length - 1} more like it)` : '';
      const day = format(parseISO(tight.date), 'EEE, MMM d');
      const trip = `${placeLabel(tight.from)} to ${placeLabel(tight.to)}`;
      setNotice({
        severity: 'warning',
        text:
          tight.gap <= 0
            ? `On ${day}, “${tight.before}” starts before “${tight.after}” ends, so there's no time to get from ${trip}.${more}`
            : `Only ${tight.gap} min to get from ${trip} before “${tight.before}” on ${day}. ` +
              `The trip usually takes ${tight.needed}.${more}`,
      });
    } else if (added.length === 1) {
      setNotice({ severity: 'info', text: `Added “${added[0].activity}” at ${formatTime(added[0].start_time)}.` });
    } else if (added.length > 1) {
      setNotice({ severity: 'info', text: `Added ${added.length} commutes.` });
    } else if (fallback) {
      setNotice({ severity: 'success', text: fallback });
    }
  };

  const handleAddBlock = async ({ block, repeat }: BlockSubmission) => {
    if (repeat) {
      const created = await apiPost('/api/block-series', repeat);
      showSavedBlock(created.blocks[0]);
      reportCommutes(created.commutes, `Added ${created.blocks.length} blocks.`);
    } else {
      const created = await apiPost('/api/time-blocks', block);
      showSavedBlock(created.block);
      reportCommutes(created.commutes);
    }
    setShowForm(false);
    reload();
  };

  const handleEditBlock = async ({ block, repeat, scope }: BlockSubmission) => {
    if (!editingBlock) return;
    if (scope === 'all' && editingBlock.series_id && repeat) {
      const updated = await apiPut(`/api/block-series/${editingBlock.series_id}`, repeat);
      reportCommutes(updated.commutes, `Updated all ${updated.blocks.length} blocks.`);
    } else {
      const updated = await apiPatch(`/api/time-blocks/${editingBlock.id}`, block);
      showSavedBlock(updated.block);
      reportCommutes(updated.commutes);
    }
    setEditingBlock(null);
    reload();
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
      const { block: moved, commutes }: { block: TimeBlock; commutes: CommuteReport } = await apiPatch(
        `/api/time-blocks/${block.id}`,
        slot,
      );
      setNearbyBlocks((current) => current.map((b) => (b.id === moved.id ? moved : b)));
      setTimeBlocks((current) => [...current.filter((b) => b.id !== moved.id), ...(isShown(moved.date) ? [moved] : [])]);
      reportCommutes(commutes, `Moved “${moved.task?.title ?? moved.activity}” to ${formatSlot(moved)}.`);
      reload();
    } catch {
      setActionError("Couldn't move the block. Try again.");
    }
  };

  const leaveBlock = (block: TimeBlock) => {
    const next = new Set(leftBlocks).add(block.id);
    setLeftBlocks(next);
    saveLeftBlocks(next);
  };

  // scope 'all' deletes every block in the block's repeat.
  const handleDeleteBlock = async (scope: 'one' | 'all' = 'one') => {
    if (!deletingBlock) return;
    setDeleteInProgress(true);
    try {
      if (scope === 'all' && deletingBlock.series_id) {
        await apiDelete(`/api/block-series/${deletingBlock.series_id}`);
      } else {
        await apiDelete(`/api/time-blocks/${deletingBlock.id}`);
      }
      setTimeBlocks((current) => current.filter((b) => b.id !== deletingBlock.id));
      setNearbyBlocks((current) => current.filter((b) => b.id !== deletingBlock.id));
      setDeletingBlock(null);
      reload();
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
              places={places}
              mode="add"
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
                places={places}
                mode="edit"
                inSeries={Boolean(editingBlock.series_id)}
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
          <DialogContentText>
            {deletingBlock?.series_id
              ? `"${deletingBlock.activity}" repeats. Delete just this one, or every block in the series? This can't be undone.`
              : `Delete "${deletingBlock?.activity}"? This can't be undone.`}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeletingBlock(null)} disabled={deleteInProgress}>
            Cancel
          </Button>
          {deletingBlock?.series_id ? (
            <>
              <Button color="error" onClick={() => handleDeleteBlock('one')} disabled={deleteInProgress}>
                Just this one
              </Button>
              <Button color="error" variant="contained" onClick={() => handleDeleteBlock('all')} disabled={deleteInProgress}>
                {deleteInProgress ? 'Deleting...' : 'All in the series'}
              </Button>
            </>
          ) : (
            <Button color="error" variant="contained" onClick={() => handleDeleteBlock()} disabled={deleteInProgress}>
              {deleteInProgress ? 'Deleting...' : 'Delete'}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      <TimeSpentDialog task={finishingTask} onFinish={finishTask} onCancel={() => setFinishingTask(null)} />

      <Snackbar
        open={notice !== null}
        autoHideDuration={notice?.severity === 'warning' ? 10000 : 5000}
        onClose={() => setNotice(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={notice?.severity ?? 'success'} onClose={() => setNotice(null)} sx={{ width: '100%' }}>
          {notice?.text}
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
