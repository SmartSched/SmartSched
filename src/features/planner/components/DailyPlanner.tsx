import { useEffect, useMemo, useState, FormEvent, type MouseEvent } from 'react';
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
  Chip,
  Drawer,
  useMediaQuery,
  type Theme,
  Link as MuiLink,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import { Add, CheckCircleOutline, ChevronLeft, ChevronRight, Close, DensitySmallOutlined, NightsStayOutlined } from '@mui/icons-material';
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
  subDays,
} from 'date-fns';
import { Link as RouterLink, useNavigate } from 'react-router';
import { useAuth } from '../../../app/lib/AuthContext';
import { apiGet, apiPost, apiPatch, apiPut, apiDelete } from '../../../app/lib/api';
import { useSelectedDay } from '../../../app/lib/today';
import { layoutBlocks, toMinutes, type BlockTask, type TimeBlock } from '../../../app/lib/planner';
import { burnoutWarnings } from '../../../app/lib/burnout';
import { findOpenSlot, missedTaskBlocks, type Slot } from '../../../app/lib/reschedule';
import type { Task } from '../../../app/lib/tasks';
import { allPlaces, placeLabel } from '../../../app/lib/places';
import { readLeftBlocks, saveLeftBlocks } from '../../../app/lib/leftBlocks';
import { checkInTime, downtimeRanges, type DowntimeRange } from '../../../app/lib/downtime';
import { gridSegments, makeScale, type GridScale } from '../lib/gridScale';
import { PlannerKey, readCompact, readShowCommutes, saveCompact, saveShowCommutes } from './PlannerKey';
import { MonthGrid } from './MonthGrid';
import { useProfile } from '../../../app/lib/ProfileContext';
import { PROVIDER_LABELS } from '../../../app/lib/calendarFeeds';
import { CATEGORY_LABELS, categoryColor, colors, withAlpha } from '../../../app/theme';
import { BurnoutBanner } from './BurnoutBanner';
import { ListSkeleton } from '../../../shared/components/States';
import { TimeSpentDialog } from '../../tasks/components/TimeSpentDialog';
import { useCurrentTime } from '../../../shared/hooks/useCurrentTime';

type BlockPayload = Omit<TimeBlock, 'id' | 'task' | 'series' | 'series_id' | 'auto' | 'feed_id' | 'feed'>;

// What the server says about commutes after a save (see server/commute.js).
interface CommuteReport {
  failed?: boolean; // the block saved, but working out commutes didn't
  added: { activity: string; start_time: string }[];
  tight: { date: string; from: string; to: string; gap: number; needed: number; after: string; before: string }[];
}
type ViewMode = 'day' | 'week' | 'month';

const HOUR_HEIGHT = 64; // px per hour on the grid
const MIN_BLOCK_HEIGHT = 26; // px, so very short blocks stay readable and clickable
const COMPACT_HOUR_HEIGHT = 36;
const COMPACT_MIN_BLOCK_HEIGHT = 18;
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

function ordinal(value: number) {
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`;
  return `${value}${['th', 'st', 'nd', 'rd'][value % 10] ?? 'th'}`;
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


const BLOCK_TYPES: TimeBlock['type'][] = ['class', 'study', 'task', 'work', 'meal', 'break', 'personal', 'commute'];

// A new repeat runs about a semester unless the user changes it.
const REPEAT_WEEKS = 15;
const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface RepeatValues {
  enabled: boolean;
  days: number[]; // 0 = Sunday
  interval: 1 | 2;
  recurrence_type: 'weekly' | 'monthly_date' | 'monthly_weekday';
  day_of_month: number;
  week_of_month: 1 | 2 | 3 | 4 | 5;
  weekday: number;
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
  recurrence_type: 'weekly' | 'monthly_date' | 'monthly_weekday';
  day_of_month: number | null;
  week_of_month: number | null;
  weekday: number | null;
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
  const selectedDate = parseISO(date);
  return {
    enabled: false,
    days: [selectedDate.getDay()],
    interval: 1,
    recurrence_type: 'weekly',
    day_of_month: selectedDate.getDate(),
    week_of_month: Math.ceil(selectedDate.getDate() / 7) as 1 | 2 | 3 | 4 | 5,
    weekday: selectedDate.getDay(),
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
          recurrence_type: block.series.recurrence_type ?? 'weekly',
          day_of_month: block.series.day_of_month ?? parseISO(block.date).getDate(),
          week_of_month: (block.series.week_of_month ?? Math.ceil(parseISO(block.date).getDate() / 7)) as 1 | 2 | 3 | 4 | 5,
          weekday: block.series.weekday ?? parseISO(block.date).getDay(),
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
    if (repeating && (values.repeat.recurrence_type === 'weekly' && values.repeat.days.length === 0 || !values.repeat.start_date || !values.repeat.end_date)) {
      setError('Pick the repeat pattern, and when it starts and ends.');
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
          recurrence_type: values.repeat.recurrence_type,
          day_of_month: values.repeat.recurrence_type === 'monthly_date' ? values.repeat.day_of_month : null,
          week_of_month: values.repeat.recurrence_type === 'monthly_weekday' ? values.repeat.week_of_month : null,
          weekday: values.repeat.recurrence_type === 'monthly_weekday' ? values.repeat.weekday : null,
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
      <Box>
        <Typography id="block-type-label" variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
          Type
        </Typography>
        <Box role="radiogroup" aria-labelledby="block-type-label" sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
          {BLOCK_TYPES.map((type) => {
            const selected = values.type === type;
            return (
              <Chip
                key={type}
                role="radio"
                aria-checked={selected}
                label={CATEGORY_LABELS[type]}
                onClick={() => setValues({ ...values, type })}
                variant="outlined"
                sx={{
                  height: 32,
                  borderRadius: '999px',
                  borderColor: selected ? colors.accent500 : colors.grey200,
                  backgroundColor: selected ? colors.accent100 : colors.surface,
                  color: selected ? colors.accent800 : 'text.secondary',
                  '&&:hover': { backgroundColor: selected ? colors.accent100 : colors.surfaceMuted },
                }}
              />
            );
          })}
        </Box>
        {isTask && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
            Time set aside for one of your tasks. Checking it off here completes the task.
          </Typography>
        )}
      </Box>
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
        <Box sx={{ border: `1px solid ${colors.grey200}`, borderRadius: '12px', p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <FormControlLabel
            control={
              <Checkbox
                checked={values.repeat.enabled}
                disabled={inSeries}
                onChange={(e) => setRepeat({ enabled: e.target.checked })}
              />
            }
            label={inSeries ? 'Repeats' : 'Repeat'}
            sx={{ m: 0 }}
          />
          {values.repeat.enabled && (
            <>
              {inSeries && (
                <Typography variant="caption" color="text.secondary">
                  Changes here only apply if you save all in the series.
                </Typography>
              )}
              <FormControl fullWidth size="small">
                <InputLabel>Repeats</InputLabel>
                <Select
                  value={values.repeat.recurrence_type}
                  label="Repeats"
                  onChange={(e) => setRepeat({ recurrence_type: e.target.value as RepeatValues['recurrence_type'] })}
                >
                  <MenuItem value="weekly">Weekly</MenuItem>
                  <MenuItem value="monthly_date">Monthly, on a date</MenuItem>
                  <MenuItem value="monthly_weekday">Monthly, on a weekday</MenuItem>
                </Select>
              </FormControl>
              {values.repeat.recurrence_type === 'weekly' ? (
                <>
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
                </>
              ) : values.repeat.recurrence_type === 'monthly_date' ? (
                <FormControl fullWidth size="small">
                  <InputLabel>Day of month</InputLabel>
                  <Select
                    value={values.repeat.day_of_month}
                    label="Day of month"
                    onChange={(e) => setRepeat({ day_of_month: Number(e.target.value) })}
                  >
                    {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => <MenuItem key={day} value={day}>{ordinal(day)} of each month</MenuItem>)}
                  </Select>
                </FormControl>
              ) : (
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Week</InputLabel>
                    <Select value={values.repeat.week_of_month} label="Week" onChange={(e) => setRepeat({ week_of_month: Number(e.target.value) as 1 | 2 | 3 | 4 | 5 })}>
                      {[1, 2, 3, 4, 5].map((week) => <MenuItem key={week} value={week}>{ordinal(week)}</MenuItem>)}
                    </Select>
                  </FormControl>
                  <FormControl fullWidth size="small">
                    <InputLabel>Weekday</InputLabel>
                    <Select value={values.repeat.weekday} label="Weekday" onChange={(e) => setRepeat({ weekday: Number(e.target.value) })}>
                      {WEEKDAY_NAMES.map((day, index) => <MenuItem key={day} value={index}>{day}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Box>
              )}
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
            >
              {submitting ? submittingLabel : 'Save all in the series'}
            </Button>
          </>
        ) : (
          <Button
            type="submit"
            variant="contained"
            disabled={submitting || endBeforeStart}
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

function formatSlot(slot: Pick<Slot, 'date' | 'start_time' | 'end_time'>) {
  return `${format(parseISO(slot.date), 'EEE, MMM d')}, ${formatTime(slot.start_time)} – ${formatTime(slot.end_time)}`;
}

function durationText(block: TimeBlock) {
  const minutes = toMinutes(block.end_time) - toMinutes(block.start_time);
  return minutes % 60 === 0 ? `${minutes / 60}-hour` : `${minutes}-minute`;
}

// The red line across today's column at the current time.
function NowLine({ scale, now }: { scale: GridScale; now: Date }) {
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (!scale.shows(minutes, minutes + 1)) return null;
  return (
    <Box
      aria-hidden
      sx={{
        position: 'absolute',
        left: -5,
        right: 0,
        top: scale.toY(minutes) - 1,
        height: 2,
        backgroundColor: colors.error,
        zIndex: 2,
        pointerEvents: 'none',
        '&::before': {
          content: '""',
          position: 'absolute',
          left: 0,
          top: -4,
          width: 10,
          height: 10,
          borderRadius: '50%',
          backgroundColor: colors.error,
        },
      }}
    />
  );
}

// Grey bands over the hours we assume someone is asleep, winding down or getting up. Clicks pass through,
// so a block can still be added there.
function DowntimeShade({ ranges, scale }: { ranges: DowntimeRange[]; scale: GridScale }) {
  return (
    <>
      {scale.segments.flatMap((segment) =>
        ranges.map((range) => {
          const start = Math.max(range.start, segment.from * 60);
          const end = Math.min(range.end, segment.to * 60);
          if (end <= start) return null;
          return (
            <Box
              key={`${segment.from}-${range.start}`}
              aria-hidden
              title={range.label}
              sx={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: scale.toY(start),
                height: ((end - start) / 60) * scale.hourHeight,
                backgroundColor: colors.surfaceMuted,
                backgroundImage: `repeating-linear-gradient(135deg, transparent 0 8px, ${withAlpha(colors.grey200, 50)} 8px 9px)`,
                pointerEvents: 'none',
              }}
            />
          );
        }),
      )}
    </>
  );
}

// The hour lines in a day column, with a band where hours are left out.
function GridLines({ scale }: { scale: GridScale }) {
  return (
    <>
      {scale.segments.map((segment, i) => (
        <Box key={segment.from}>
          {i > 0 && <GapBand height={scale.gap} />}
          {Array.from({ length: segment.to - segment.from }, (_, j) => (
            <Box
              key={j}
              sx={{ height: scale.hourHeight, borderTop: i + j > 0 ? `1px dashed ${colors.grey200}` : 'none', boxSizing: 'border-box' }}
            />
          ))}
        </Box>
      ))}
    </>
  );
}

function GapBand({ height, label }: { height: number; label?: string }) {
  return (
    <Box
      sx={{
        height,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        pr: 1,
        borderTop: `1px solid ${colors.grey200}`,
        borderBottom: `1px solid ${colors.grey200}`,
        backgroundImage: `repeating-linear-gradient(90deg, ${colors.grey200} 0 4px, transparent 4px 8px)`,
        backgroundSize: '100% 1px',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      {label && (
        <Typography sx={{ fontSize: 10, fontWeight: 600, color: 'text.secondary', backgroundColor: colors.surface, px: 0.5 }}>
          {label}
        </Typography>
      )}
    </Box>
  );
}

// The hour labels down the left of the grid, lined up with GridLines.
function HourLabels({ scale, width, small }: { scale: GridScale; width: number; small?: boolean }) {
  return (
    <Box sx={{ width, flexShrink: 0 }}>
      {scale.segments.map((segment, i) => (
        <Box key={segment.from}>
          {i > 0 && <GapBand height={scale.gap} label={`${formatHour(scale.segments[i - 1].to)}–${formatHour(segment.from)}`} />}
          {Array.from({ length: segment.to - segment.from }, (_, j) => (
            <Box key={j} sx={{ height: scale.hourHeight, pr: small ? 1 : 2, pt: 0.25, boxSizing: 'border-box' }}>
              <Typography variant={small ? 'caption' : 'body2'} sx={{ color: 'text.secondary', fontWeight: 600, lineHeight: 1.2 }}>
                {formatHour(segment.from + j)}
              </Typography>
            </Box>
          ))}
        </Box>
      ))}
    </Box>
  );
}

// The evening "reflect on your day" check-in: not a saved block, just a reminder drawn at the start of the
// wind-down hour. Ticked once that day has a reflection; opens the Reflect page for that day.
function CheckIn({ date, done, time, scale }: { date: string; done: boolean; time: { start: number; end: number }; scale: GridScale }) {
  const navigate = useNavigate();
  if (!scale.shows(time.start, time.end)) return null;
  return (
    <ButtonBase
      onClick={(e) => {
        e.stopPropagation();
        navigate(`/reflection?date=${date}`);
      }}
      aria-label={done ? `Reflection for ${formatDay(date)} saved. Open it` : `Reflect on ${formatDay(date)}`}
      sx={{
        position: 'absolute',
        left: 3,
        right: 3,
        top: scale.toY(time.start) + 1,
        height: Math.max(((time.end - time.start) / 60) * scale.hourHeight - 2, 16),
        zIndex: 1,
        justifyContent: 'flex-start',
        gap: 0.5,
        px: 0.75,
        borderRadius: '6px',
        border: `1.5px dashed ${colors.accent600}`,
        backgroundColor: done ? colors.surface : colors.accent100,
        color: done ? 'text.secondary' : colors.accent800,
        fontSize: 11,
        fontWeight: 700,
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        opacity: done ? 0.75 : 1,
        '&:hover': { backgroundColor: colors.accent200 },
        '&:focus-visible': { outline: `2px solid ${colors.accent600}`, outlineOffset: 1 },
      }}
    >
      {done ? <CheckCircleOutline sx={{ fontSize: 14 }} aria-hidden /> : <NightsStayOutlined sx={{ fontSize: 14 }} aria-hidden />}
      <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {done ? 'Reflected' : 'Reflect on your day'}
      </Box>
    </ButtonBase>
  );
}

// Where in a day column the user clicked, as a start time rounded down to the half hour.
function timeAtClick(e: MouseEvent<HTMLElement>, scale: GridScale) {
  const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
  const minutes = Math.floor(scale.fromY(y) / 30) * 30;
  const clamped = Math.min(Math.max(minutes, 0), 23 * 60);
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
}

function plusOneHour(time: string) {
  const minutes = Math.min(toMinutes(time) + 60, 23 * 60 + 59);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

// Shared between the day view (one wide column) and week view (7 narrow columns) so both
// reuse the same duration-based sizing, colors, and click behavior.
interface TimeBlockItemProps {
  block: TimeBlock;
  column: number;
  columns: number;
  scale: GridScale;
  minHeight: number;
  dense?: boolean;
  onClick: () => void;
  onToggleTask: (block: TimeBlock) => void;
}

function TimeBlockItem({ block, column, columns, scale, minHeight, dense, onClick, onToggleTask }: TimeBlockItemProps) {
  const start = toMinutes(block.start_time);
  const end = toMinutes(block.end_time);
  const top = scale.toY(start, 'start');
  const height = Math.max(scale.toY(end, 'end') - top, minHeight);
  const compact = height < 48;
  const color = categoryColor(block.type);
  const timeRange = `${formatTime(block.start_time)} – ${formatTime(block.end_time)}`;
  const gap = dense ? 2 : 4;
  // Task blocks show the task's current title and priority, and a checkbox that completes the task.
  const task = block.type === 'task' ? block.task : null;
  const title = task?.title ?? block.activity;
  // Compact view leaves 2–6 AM out; a block entirely in there isn't drawn.
  if (!scale.shows(start, end)) return null;

  return (
    <Box
      // Clicks on a block mustn't reach the column underneath, which would start a new block there.
      onClick={(e) => e.stopPropagation()}
      sx={{
        position: 'absolute',
        top,
        height,
        zIndex: 1,
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
        transition: 'background-color 0.15s ease',
        '&:hover': { backgroundColor: color + '35' },
        '&:focus-within': { outline: `2px solid ${colors.accent600}`, outlineOffset: 1 },
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
        aria-label={`${block.feed_id ? 'View' : 'Edit'} ${title}, ${timeRange}`}
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
          sx={{ fontWeight: 600, color: 'text.primary', minWidth: 0, maxWidth: '100%', textDecoration: task?.completed ? 'line-through' : 'none' }}
        >
          {title}
        </Typography>
        {!dense && (
          <Typography variant="caption" color="text.secondary" noWrap sx={{ flexShrink: 0 }}>
            {timeRange}
            {task ? ` · ${task.priority} priority` : ''}
            {block.location ? ` · ${placeLabel(block.location)}` : ''}
            {block.feed ? ` · ${PROVIDER_LABELS[block.feed.provider]}` : ''}
          </Typography>
        )}
      </ButtonBase>
    </Box>
  );
}

export function DailyPlanner() {
  const { user } = useAuth();
  // Week on wide screens, one day at a time on phones.
  const wide = useMediaQuery((t: Theme) => t.breakpoints.up('md'), { noSsr: true });
  const [viewMode, setViewMode] = useState<ViewMode>(wide ? 'week' : 'day');
  const { today, selectedDate, setSelectedDate } = useSelectedDay();
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // The add form's starting values while it's open (from the button or a click on an empty slot).
  const [adding, setAdding] = useState<BlockFormValues | null>(null);
  const [showCommutes, setShowCommutes] = useState(readShowCommutes);
  const [compact, setCompact] = useState(readCompact);
  const hourHeight = compact ? COMPACT_HOUR_HEIGHT : HOUR_HEIGHT;
  const minBlockHeight = compact ? COMPACT_MIN_BLOCK_HEIGHT : MIN_BLOCK_HEIGHT;
  const [editingBlock, setEditingBlock] = useState<TimeBlock | null>(null);
  const [deletingBlock, setDeletingBlock] = useState<TimeBlock | null>(null);
  const [deleteInProgress, setDeleteInProgress] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; severity: 'success' | 'info' | 'warning' } | null>(null);
  const { profile } = useProfile();
  const places = allPlaces(profile?.travel);
  const downtime = useMemo(() => downtimeRanges(profile?.survey), [profile?.survey]);
  const checkIn = useMemo(() => checkInTime(profile?.survey), [profile?.survey]);
  // Days in view that already have a reflection, so their check-in shows as done.
  const [reflectedDates, setReflectedDates] = useState<Set<string>>(new Set());
  // Saving can add or remove automatic commutes elsewhere on the day, so the view reloads after each change.
  const [reloadVersion, setReloadVersion] = useState(0);
  const [tasks, setTasks] = useState<Task[]>([]);
  // Blocks from two weeks back to two weeks ahead, for spotting missed task blocks (#9) and finding room.
  const [nearbyBlocks, setNearbyBlocks] = useState<TimeBlock[]>([]);
  const [nearbyVersion, setNearbyVersion] = useState(0);
  const [finishingTask, setFinishingTask] = useState<BlockTask | null>(null);
  const [leftBlocks, setLeftBlocks] = useState<Set<string>>(readLeftBlocks);
  // Whether any Google / Outlook calendar is linked (null until the first sync answers), for the note at the bottom.
  const [calendarsLinked, setCalendarsLinked] = useState<boolean | null>(null);
  const now = useCurrentTime();

  const weekStart = useMemo(
    () => startOfWeek(parseISO(selectedDate), { weekStartsOn: WEEK_STARTS_ON }),
    [selectedDate]
  );
  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => format(addDays(weekStart, i), 'yyyy-MM-dd')),
    [weekStart]
  );
  // Every day the month view shows: whole weeks from the one the 1st falls in to the one the last day falls in.
  const monthDates = useMemo(() => {
    const month = parseISO(selectedDate);
    return eachDayOfInterval({
      start: startOfWeek(startOfMonth(month), { weekStartsOn: WEEK_STARTS_ON }),
      end: endOfWeek(endOfMonth(month), { weekStartsOn: WEEK_STARTS_ON }),
    }).map((day) => format(day, 'yyyy-MM-dd'));
  }, [selectedDate]);

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
        : viewMode === 'week'
          ? `start=${weekDates[0]}&end=${weekDates[6]}`
          : `start=${monthDates[0]}&end=${monthDates[monthDates.length - 1]}`;

    apiGet(`/api/time-blocks?${query}`)
      .then((data) => !cancelled && setTimeBlocks(data))
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [user, viewMode, selectedDate, weekDates, monthDates, reloadVersion]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const [start, end] =
      viewMode === 'day'
        ? [selectedDate, selectedDate]
        : viewMode === 'week'
          ? [weekDates[0], weekDates[6]]
          : [monthDates[0], monthDates[monthDates.length - 1]];
    apiGet(`/api/reflections?start=${start}&end=${end}`)
      .then((rows: { date: string }[]) => !cancelled && setReflectedDates(new Set(rows.map((r) => r.date))))
      .catch(() => {}); // check-ins just show as not done
    return () => {
      cancelled = true;
    };
  }, [user, viewMode, selectedDate, weekDates, monthDates]);

  useEffect(() => {
    if (!user) return;
    apiGet('/api/tasks')
      .then(setTasks)
      .catch(() => {}); // the task picker and due dates just stay empty; the Tasks page shows the error
  }, [user]);

  // Linked Google / Outlook calendars are synced when the planner opens (the server skips ones synced in the
  // last few minutes), and the view reloads if anything was brought in.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    apiPost('/api/calendar-feeds/sync', {})
      .then((result: { synced: number; feeds: unknown[] }) => {
        if (cancelled) return;
        setCalendarsLinked(result.feeds.length > 0);
        if (result.synced === 0) return;
        setReloadVersion((v) => v + 1);
        setNearbyVersion((v) => v + 1);
      })
      .catch(() => {}); // the last copy of the calendar still shows
    return () => {
      cancelled = true;
    };
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

  // Commutes can be hidden from the grid; they're still there and still counted in warnings.
  const visibleBlocks = useMemo(
    () => (showCommutes ? timeBlocks : timeBlocks.filter((b) => b.type !== 'commute')),
    [timeBlocks, showCommutes],
  );
  const placedBlocks = useMemo(
    () => layoutBlocks(visibleBlocks, (minBlockHeight / hourHeight) * 60),
    [visibleBlocks, minBlockHeight, hourHeight],
  );
  const blocksByDate = useMemo(() => {
    const map = new Map<string, TimeBlock[]>();
    for (const block of visibleBlocks) {
      map.set(block.date, [...(map.get(block.date) ?? []), block]);
    }
    return map;
  }, [visibleBlocks]);

  // Normal view widens past 7 AM–10 PM when something starts earlier or ends later; compact view is shorter rows
  // and never shows 2–6 AM.
  const scale = useMemo(
    () =>
      makeScale(
        gridSegments({
          compact,
          defaultStart: DEFAULT_START_HOUR,
          defaultEnd: DEFAULT_END_HOUR,
          starts: visibleBlocks.map((b) => toMinutes(b.start_time)),
          ends: [...visibleBlocks.map((b) => toMinutes(b.end_time)), checkIn.end], // so the evening check-in fits
        }),
        hourHeight,
      ),
    [compact, visibleBlocks, checkIn.end, hourHeight],
  );

  const changeDay = (days: number) => {
    setSelectedDate((current) => format(addDays(parseISO(current), days), 'yyyy-MM-dd'));
  };

  const changeWeek = (weeks: number) => {
    setSelectedDate((current) => format(addDays(parseISO(current), weeks * 7), 'yyyy-MM-dd'));
  };

  const changeMonth = (months: number) => {
    setSelectedDate((current) => format(addMonths(parseISO(current), months), 'yyyy-MM-dd'));
  };

  const goToPrevious = () => (viewMode === 'day' ? changeDay(-1) : viewMode === 'week' ? changeWeek(-1) : changeMonth(-1));
  const goToNext = () => (viewMode === 'day' ? changeDay(1) : viewMode === 'week' ? changeWeek(1) : changeMonth(1));

  // A block saved to another day takes the view to that day (in day mode), so it doesn't seem to vanish.
  const showSavedBlock = (saved: TimeBlock) => {
    if ((viewMode === 'week' && weekDates.includes(saved.date)) || (viewMode === 'month' && monthDates.includes(saved.date))) {
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
    setAdding(null);
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

  const isShown = (date: string) =>
    viewMode === 'day' ? date === selectedDate : viewMode === 'week' ? weekDates.includes(date) : monthDates.includes(date);

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
  const isCurrentMonth = selectedDate.slice(0, 7) === today.slice(0, 7);
  const unit = viewMode === 'day' ? 'day' : viewMode === 'week' ? 'week' : 'month';

  // A click on an empty part of a day column starts a block there.
  const openAddAt = (date: string, e: MouseEvent<HTMLElement>) => {
    const start = timeAtClick(e, scale);
    setEditingBlock(null);
    setAdding({ ...emptyForm(date), start_time: start, end_time: plusOneHour(start) });
  };

  const openEdit = (block: TimeBlock) => {
    setAdding(null);
    setEditingBlock(block);
  };

  const closePanel = () => {
    setAdding(null);
    setEditingBlock(null);
  };

  const panelBlock = editingBlock ?? adding;
  const panelWhen = panelBlock?.date
    ? `${format(parseISO(panelBlock.date), 'EEEE, MMM d')} · ${formatTime(panelBlock.start_time)} – ${formatTime(panelBlock.end_time)}`
    : null;

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5, flexWrap: 'wrap' }}>
        <Typography variant="h5" component="h1" sx={{ color: colors.accent500, mr: 1, minWidth: { sm: 220 } }}>
          {viewMode === 'day'
            ? formatDay(selectedDate)
            : viewMode === 'week'
              ? formatWeekRange(weekStart)
              : format(parseISO(selectedDate), 'MMMM yyyy')}
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.75 }}>
          <IconButton
            aria-label={`Previous ${unit}`}
            onClick={goToPrevious}
            sx={{ border: `1px solid ${colors.grey200}`, borderRadius: '12px' }}
          >
            <ChevronLeft />
          </IconButton>
          <IconButton
            aria-label={`Next ${unit}`}
            onClick={goToNext}
            sx={{ border: `1px solid ${colors.grey200}`, borderRadius: '12px' }}
          >
            <ChevronRight />
          </IconButton>
        </Box>
        <Button variant="outlined" onClick={() => setSelectedDate(today)} disabled={viewMode === 'day' ? isToday : viewMode === 'week' ? isCurrentWeek : isCurrentMonth}>
          Today
        </Button>
        <Box sx={{ flex: 1 }} />
        <ToggleButtonGroup
          value={viewMode}
          exclusive
          size="small"
          aria-label="View"
          onChange={(_, newMode) => newMode && setViewMode(newMode)}
        >
          <ToggleButton value="day" sx={{ px: 2 }}>Day</ToggleButton>
          <ToggleButton value="week" sx={{ px: 2 }}>Week</ToggleButton>
          <ToggleButton value="month" sx={{ px: 2 }}>Month</ToggleButton>
        </ToggleButtonGroup>
        {viewMode !== 'month' && (
          <ToggleButton
            value="compact"
            size="small"
            selected={compact}
            onChange={() => {
              setCompact(!compact);
              saveCompact(!compact);
            }}
            sx={{ px: 1.5, gap: 0.75 }}
          >
            <DensitySmallOutlined fontSize="small" aria-hidden />
            Compact
          </ToggleButton>
        )}
        <Button variant="contained" startIcon={<Add />} onClick={() => setAdding(emptyForm(viewMode === 'day' ? selectedDate : today))}>
          Add block
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
                <Button size="small" color="inherit" onClick={() => openEdit(block)}>
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

      {error && (
        <Typography variant="body2" color="error" sx={{ mb: 2 }}>
          {error}
        </Typography>
      )}

      <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      <Box sx={{ flex: '999 1 600px', minWidth: 0 }}>
      {loading ? (
        <ListSkeleton rows={6} height={64} />
      ) : viewMode === 'month' ? (
        <MonthGrid
          dates={monthDates}
          month={selectedDate.slice(0, 7)}
          today={today}
          blocksByDate={blocksByDate}
          onOpenDay={(date) => {
            setSelectedDate(date);
            setViewMode('day');
          }}
          onOpenBlock={openEdit}
        />
      ) : viewMode === 'day' ? (
        <Card sx={{ borderRadius: '16px' }}>
          <CardContent>
            {timeBlocks.length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', pb: 2 }}>
                Nothing planned for this day. Click a time below to add a block.
              </Typography>
            )}
            <Box sx={{ display: 'flex' }}>
              <HourLabels scale={scale} width={compact ? 56 : 80} small={compact} />
              <Box
                onClick={(e) => openAddAt(selectedDate, e)}
                sx={{ flex: 1, position: 'relative', borderLeft: `2px solid ${colors.grey200}`, cursor: 'copy' }}
              >
                <GridLines scale={scale} />
                <DowntimeShade ranges={downtime} scale={scale} />
                <CheckIn date={selectedDate} done={reflectedDates.has(selectedDate)} time={checkIn} scale={scale} />
                {isToday && <NowLine scale={scale} now={new Date(now)} />}
                {placedBlocks.map(({ block, column, columns }) => (
                  <TimeBlockItem
                    key={block.id}
                    block={block}
                    column={column}
                    columns={columns}
                    scale={scale}
                    minHeight={minBlockHeight}
                    dense={compact}
                    onClick={() => openEdit(block)}
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
            <Box sx={{ minWidth: compact ? 640 : 780 }}>
              <Box sx={{ display: 'flex' }}>
                <Box sx={{ width: '56px', flexShrink: 0 }} />
                {weekDates.map((date) => {
                  const day = parseISO(date);
                  const isDayToday = date === today;
                  return (
                    <Box key={date} sx={{ flex: 1, textAlign: 'center', pb: 1 }}>
                      <Typography
                        variant="body2"
                        sx={{ fontWeight: 700, color: isDayToday ? colors.accent600 : 'text.secondary' }}
                      >
                        {format(day, 'EEE')}
                      </Typography>
                      <Box
                        sx={{
                          mx: 'auto',
                          mt: 0.5,
                          width: 32,
                          height: 32,
                          lineHeight: '32px',
                          borderRadius: '50%',
                          fontWeight: 700,
                          backgroundColor: isDayToday ? colors.accent600 : 'transparent',
                          color: isDayToday ? colors.surface : 'text.primary',
                        }}
                      >
                        {format(day, 'd')}
                      </Box>
                    </Box>
                  );
                })}
              </Box>
              <Box sx={{ display: 'flex' }}>
                <HourLabels scale={scale} width={56} small />
                {weekDates.map((date) => {
                  const dayBlocks = layoutBlocks(blocksByDate.get(date) ?? [], (minBlockHeight / hourHeight) * 60);
                  return (
                    <Box
                      key={date}
                      onClick={(e) => openAddAt(date, e)}
                      sx={{
                        flex: 1,
                        position: 'relative',
                        borderLeft: `1px solid ${colors.grey200}`,
                        backgroundColor: date === today ? withAlpha(colors.accent100, 25) : 'transparent',
                        cursor: 'copy',
                      }}
                    >
                      <GridLines scale={scale} />
                      <DowntimeShade ranges={downtime} scale={scale} />
                      <CheckIn date={date} done={reflectedDates.has(date)} time={checkIn} scale={scale} />
                      {date === today && <NowLine scale={scale} now={new Date(now)} />}
                      {dayBlocks.map(({ block, column, columns }) => (
                        <TimeBlockItem
                          key={block.id}
                          block={block}
                          column={column}
                          columns={columns}
                          scale={scale}
                          minHeight={minBlockHeight}
                          dense
                          onClick={() => openEdit(block)}
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

      </Box>
      <PlannerKey
        showCommutes={showCommutes}
        onShowCommutesChange={(show) => {
          setShowCommutes(show);
          saveShowCommutes(show);
        }}
        hasSurvey={Boolean(profile?.survey)}
        compact={compact && viewMode !== 'month'}
      />
      </Box>

      {calendarsLinked === false && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 3, textAlign: 'center' }}>
          Use Google Calendar or Outlook? You can{' '}
          <MuiLink component={RouterLink} to="/profile">
            link them on your Profile page
          </MuiLink>{' '}
          to see those events here, and suggested plans will fit around them.
        </Typography>
      )}

      <Drawer
        anchor="right"
        open={adding !== null || editingBlock !== null}
        onClose={closePanel}
        slotProps={{ paper: { sx: { width: { xs: '100%', sm: 440 }, borderRadius: { xs: 0, sm: '16px 0 0 16px' } } } }}
      >
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', px: 3, pt: 2.5, pb: 1 }}>
          <Box>
            <Typography variant="h6" component="h2">
              {editingBlock?.feed_id ? editingBlock.activity : editingBlock ? 'Edit block' : 'New block'}
            </Typography>
            {panelWhen && (
              <Typography variant="body2" color="text.secondary">
                {panelWhen}
              </Typography>
            )}
          </Box>
          <IconButton aria-label="Close" onClick={closePanel} sx={{ mr: -1 }}>
            <Close />
          </IconButton>
        </Box>
        <Box sx={{ px: 3, pt: 1, pb: 3 }}>
          {editingBlock?.feed_id ? (
            <Box>
              <Typography variant="body2" color="text.secondary">
                {editingBlock.feed ? `From your ${PROVIDER_LABELS[editingBlock.feed.provider]}. ` : 'From a linked calendar. '}
                To change or remove it, edit it there. SmartSched picks up the change the next time the planner opens.
              </Typography>
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 3 }}>
                <Button onClick={closePanel}>Close</Button>
              </Box>
            </Box>
          ) : editingBlock ? (
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
              onCancel={closePanel}
              onDelete={() => {
                setDeletingBlock(editingBlock);
                setEditingBlock(null);
              }}
            />
          ) : (
            adding && (
              <BlockForm
                key={`${adding.date}-${adding.start_time}`}
                initial={adding}
                submitLabel="Add block"
                submittingLabel="Adding..."
                tasks={tasks}
                places={places}
                mode="add"
                onSubmit={handleAddBlock}
                onCancel={closePanel}
              />
            )
          )}
        </Box>
      </Drawer>

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
