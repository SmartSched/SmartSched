import { useEffect, useMemo, useState, FormEvent } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Button,
  ButtonBase,
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
} from '@mui/material';
import { Add, ChevronLeft, ChevronRight } from '@mui/icons-material';
import { addDays, format, parseISO } from 'date-fns';
import { Link as RouterLink } from 'react-router';
import { useAuth } from '../lib/AuthContext';
import { apiGet, apiPost, apiPatch, apiDelete } from '../lib/api';

export interface TimeBlock {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  activity: string;
  type: 'class' | 'study' | 'break' | 'personal' | 'commute' | 'meal';
}

type BlockPayload = Omit<TimeBlock, 'id'>;

const HOUR_HEIGHT = 64; // px per hour on the grid
const MIN_BLOCK_HEIGHT = 26; // px, so very short blocks stay readable and clickable
const DEFAULT_START_HOUR = 7;
const DEFAULT_END_HOUR = 22; // grid runs until 10 PM unless a block goes later

function todayIso() {
  return format(new Date(), 'yyyy-MM-dd');
}

// "09:30" or "09:30:00" -> minutes since midnight
function toMinutes(time: string) {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

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
    default:
      return '#6b7280';
  }
};

interface PlacedBlock {
  block: TimeBlock;
  column: number;
  columns: number;
}

// Overlapping blocks share the row side by side: each gets the first free column, and every
// block in a group of overlapping blocks is as wide as that group's column count allows.
function layoutBlocks(blocks: TimeBlock[]): PlacedBlock[] {
  const minVisualMinutes = (MIN_BLOCK_HEIGHT / HOUR_HEIGHT) * 60;
  const sorted = [...blocks].sort((a, b) => toMinutes(a.start_time) - toMinutes(b.start_time) || toMinutes(a.end_time) - toMinutes(b.end_time));
  const placed: PlacedBlock[] = [];
  let group: PlacedBlock[] = [];
  let columnEnds: number[] = [];
  let groupEnd = -1;

  const closeGroup = () => group.forEach((item) => (item.columns = columnEnds.length));

  for (const block of sorted) {
    const start = toMinutes(block.start_time);
    const end = Math.max(toMinutes(block.end_time), start + minVisualMinutes);
    if (start >= groupEnd) {
      closeGroup();
      group = [];
      columnEnds = [];
    }
    let column = columnEnds.findIndex((columnEnd) => columnEnd <= start);
    if (column === -1) {
      column = columnEnds.length;
      columnEnds.push(end);
    } else {
      columnEnds[column] = end;
    }
    const item = { block, column, columns: 1 };
    group.push(item);
    placed.push(item);
    groupEnd = Math.max(groupEnd, end);
  }
  closeGroup();
  return placed;
}

interface BlockFormValues {
  activity: string;
  date: string;
  start_time: string; // HH:MM
  end_time: string; // HH:MM
  type: string;
}

function emptyForm(date: string): BlockFormValues {
  return { activity: '', date, start_time: '09:00', end_time: '10:00', type: 'study' };
}

function toFormValues(block: TimeBlock): BlockFormValues {
  return {
    activity: block.activity,
    date: block.date,
    start_time: block.start_time.slice(0, 5),
    end_time: block.end_time.slice(0, 5),
    type: block.type,
  };
}

interface BlockFormProps {
  initial: BlockFormValues;
  submitLabel: string;
  submittingLabel: string;
  onSubmit: (payload: BlockPayload) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => void;
}

function BlockForm({ initial, submitLabel, submittingLabel, onSubmit, onCancel, onDelete }: BlockFormProps) {
  const [values, setValues] = useState(initial);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // HH:MM strings compare correctly as text.
  const endBeforeStart = values.start_time !== '' && values.end_time !== '' && values.end_time <= values.start_time;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!values.activity.trim()) {
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
        activity: values.activity.trim(),
        date: values.date,
        start_time: values.start_time,
        end_time: values.end_time,
        type: values.type as TimeBlock['type'],
      });
    } catch (err: any) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  return (
    <Box component="form" onSubmit={handleSubmit} noValidate sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <TextField
        fullWidth
        label="Activity"
        value={values.activity}
        onChange={(e) => setValues({ ...values, activity: e.target.value })}
        placeholder="e.g., CSC 453 Lecture"
        autoFocus
      />
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
      <FormControl fullWidth>
        <InputLabel>Type</InputLabel>
        <Select value={values.type} label="Type" onChange={(e) => setValues({ ...values, type: e.target.value })}>
          <MenuItem value="class">Class</MenuItem>
          <MenuItem value="study">Study</MenuItem>
          <MenuItem value="break">Break</MenuItem>
          <MenuItem value="personal">Personal</MenuItem>
          <MenuItem value="commute">Commute</MenuItem>
          <MenuItem value="meal">Meal</MenuItem>
        </Select>
      </FormControl>
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

export function DailyPlanner() {
  const { user } = useAuth();
  const [selectedDate, setSelectedDate] = useState(todayIso);
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingBlock, setEditingBlock] = useState<TimeBlock | null>(null);
  const [deletingBlock, setDeletingBlock] = useState<TimeBlock | null>(null);
  const [deleteInProgress, setDeleteInProgress] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    // Ignore a slow response for a day the user has already clicked past.
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiGet(`/api/time-blocks?date=${selectedDate}`)
      .then((data) => !cancelled && setTimeBlocks(data))
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [user, selectedDate]);

  const placedBlocks = useMemo(() => layoutBlocks(timeBlocks), [timeBlocks]);

  // Widen the grid past 7 AM–10 PM when a block starts earlier or ends later.
  const startHour = Math.min(DEFAULT_START_HOUR, ...timeBlocks.map((b) => Math.floor(toMinutes(b.start_time) / 60)));
  const endHour = Math.max(DEFAULT_END_HOUR, ...timeBlocks.map((b) => Math.ceil(toMinutes(b.end_time) / 60)));
  const hours = Array.from({ length: endHour - startHour }, (_, i) => i + startHour);

  const changeDay = (days: number) => {
    setSelectedDate((current) => format(addDays(parseISO(current), days), 'yyyy-MM-dd'));
  };

  // A block saved to another day takes the view to that day, so it doesn't seem to vanish.
  const showSavedBlock = (saved: TimeBlock) => {
    if (saved.date === selectedDate) {
      setTimeBlocks((current) => [...current.filter((b) => b.id !== saved.id), saved]);
    } else {
      setSelectedDate(saved.date);
    }
  };

  const handleAddBlock = async (payload: BlockPayload) => {
    const created = await apiPost('/api/time-blocks', payload);
    showSavedBlock(created);
    setShowForm(false);
  };

  const handleEditBlock = async (payload: BlockPayload) => {
    if (!editingBlock) return;
    const updated = await apiPatch(`/api/time-blocks/${editingBlock.id}`, payload);
    showSavedBlock(updated);
    setEditingBlock(null);
  };

  const handleDeleteBlock = async () => {
    if (!deletingBlock) return;
    setDeleteInProgress(true);
    try {
      await apiDelete(`/api/time-blocks/${deletingBlock.id}`);
      setTimeBlocks((current) => current.filter((b) => b.id !== deletingBlock.id));
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

  const isToday = selectedDate === todayIso();

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, color: '#8b5cf6' }}>
          Daily Schedule
        </Typography>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => setShowForm(!showForm)}
          sx={{ backgroundColor: '#8b5cf6', '&:hover': { backgroundColor: '#7c3aed' } }}
        >
          Add Time Block
        </Button>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
        <IconButton aria-label="Previous day" onClick={() => changeDay(-1)}>
          <ChevronLeft />
        </IconButton>
        <Typography variant="h6" sx={{ fontWeight: 600, minWidth: { sm: 260 }, textAlign: 'center' }}>
          {formatDay(selectedDate)}
        </Typography>
        <IconButton aria-label="Next day" onClick={() => changeDay(1)}>
          <ChevronRight />
        </IconButton>
        <Button size="small" onClick={() => setSelectedDate(todayIso())} disabled={isToday}>
          Today
        </Button>
      </Box>

      {showForm && (
        <Card sx={{ mb: 3, borderRadius: '16px' }}>
          <CardContent>
            <BlockForm
              initial={emptyForm(selectedDate)}
              submitLabel="Add Block"
              submittingLabel="Adding..."
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
      ) : (
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
                {placedBlocks.map(({ block, column, columns }) => {
                  const start = toMinutes(block.start_time);
                  const end = toMinutes(block.end_time);
                  const top = ((start - startHour * 60) / 60) * HOUR_HEIGHT;
                  const height = Math.max(((end - start) / 60) * HOUR_HEIGHT, MIN_BLOCK_HEIGHT);
                  const compact = height < 48;
                  const color = getTypeColor(block.type);
                  const timeRange = `${formatTime(block.start_time)} – ${formatTime(block.end_time)}`;
                  return (
                    <ButtonBase
                      key={block.id}
                      onClick={() => setEditingBlock(block)}
                      aria-label={`Edit ${block.activity}, ${timeRange}`}
                      sx={{
                        position: 'absolute',
                        top,
                        height,
                        left: `calc(${(column * 100) / columns}% + 4px)`,
                        width: `calc(${100 / columns}% - 8px)`,
                        px: 1.25,
                        py: compact ? 0 : 0.75,
                        backgroundColor: color + '20',
                        border: `2px solid ${color}`,
                        borderRadius: '10px',
                        display: 'flex',
                        flexDirection: compact ? 'row' : 'column',
                        alignItems: compact ? 'center' : 'flex-start',
                        justifyContent: 'flex-start',
                        gap: compact ? 1 : 0,
                        overflow: 'hidden',
                        textAlign: 'left',
                        boxSizing: 'border-box',
                        '&:hover': { backgroundColor: color + '35' },
                      }}
                    >
                      <Typography variant="body2" noWrap sx={{ fontWeight: 600, color, minWidth: 0 }}>
                        {block.activity}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" noWrap sx={{ flexShrink: 0 }}>
                        {timeRange}
                      </Typography>
                    </ButtonBase>
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
