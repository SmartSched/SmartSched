import { useEffect, useMemo, useState, FormEvent } from 'react';
import {
  Card,
  CardContent,
  Typography,
  List,
  ListItem,
  ListItemText,
  Checkbox,
  Chip,
  Box,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Snackbar,
  Alert,
  Collapse,
  Link as MuiLink,
} from '@mui/material';
import { Add, AutoAwesomeOutlined, Close, EditOutlined, DeleteOutline, ExpandLess, ExpandMore } from '@mui/icons-material';
import { Link as RouterLink, useNavigate } from 'react-router';
import { format, parseISO } from 'date-fns';
import { useAuth } from '../../../app/lib/AuthContext';
import { apiPost } from '../../../app/lib/api';
import { estimateRatios, sortTasks, type EstimateRatio, type Task } from '../../../app/lib/tasks';
import { localNow } from '../../../app/lib/today';
import { useTasks, type TaskPayload } from '../hooks/useTasks';
import { useCurrentTime } from '../../../shared/hooks/useCurrentTime';
import { TimeSpentDialog } from './TimeSpentDialog';
import { colors } from '../../../app/theme';
import { EmptyState, ListSkeleton } from '../../../shared/components/States';


interface TaskFormValues {
  title: string;
  description: string;
  type: string;
  priority: string;
  due: string; // datetime-local value, in the browser's local time
  estimatedTime: string;
}

const EMPTY_FORM: TaskFormValues = { title: '', description: '', type: 'study', priority: 'medium', due: '', estimatedTime: '' };


function toFormValues(task: Task): TaskFormValues {
  return {
    title: task.title,
    description: task.description ?? '',
    type: task.type,
    priority: task.priority,
    due: task.due_date ? format(new Date(task.due_date), "yyyy-MM-dd'T'HH:mm") : '',
    estimatedTime: task.estimated_time ? String(task.estimated_time) : '',
  };
}

function formatDue(dueDate: string) {
  const due = new Date(dueDate);
  const pattern = due.getFullYear() === new Date().getFullYear() ? 'EEE MMM d, h:mm a' : 'EEE MMM d yyyy, h:mm a';
  return format(due, pattern);
}

type Ratios = ReturnType<typeof estimateRatios>;

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function ratioText(ratio: EstimateRatio) {
  return `${ratio.ratio}× your estimate`;
}

interface TaskFormProps {
  initial: TaskFormValues;
  submitLabel: string;
  submittingLabel: string;
  ratios: Ratios;
  onSubmit: (payload: TaskPayload) => Promise<void>;
  onCancel: () => void;
}

function TaskForm({ initial, submitLabel, submittingLabel, ratios, onSubmit, onCancel }: TaskFormProps) {
  const [values, setValues] = useState(initial);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // What past tasks of this type say about the estimate being typed in.
  const ratio = ratios[values.type as Task['type']];
  const estimate = Number(values.estimatedTime);
  const estimateHint =
    ratio && ratio.ratio !== 1 && Number.isInteger(estimate) && estimate > 0
      ? `Your ${values.type} tasks usually take ${ratioText(ratio)}, so about ${Math.round(estimate * ratio.ratio)} min`
      : undefined;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!values.title.trim()) {
      setError('Give the task a title.');
      return;
    }
    const estimated = values.estimatedTime ? Number(values.estimatedTime) : null;
    if (estimated !== null && (!Number.isInteger(estimated) || estimated <= 0)) {
      setError('Estimated time must be a whole number of minutes.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        title: values.title.trim(),
        description: values.description.trim() || null,
        type: values.type as Task['type'],
        priority: values.priority as Task['priority'],
        due_date: values.due ? new Date(values.due).toISOString() : null,
        estimated_time: estimated,
      });
    } catch (err: any) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  return (
    <Box component="form" onSubmit={handleSubmit} noValidate>
      <TextField
        fullWidth
        size="small"
        placeholder="Task title"
        value={values.title}
        onChange={(e) => setValues({ ...values, title: e.target.value })}
        sx={{ mb: 1.5 }}
        autoFocus
      />
      <TextField
        fullWidth
        size="small"
        multiline
        minRows={2}
        placeholder="Description (optional)"
        value={values.description}
        onChange={(e) => setValues({ ...values, description: e.target.value })}
        sx={{ mb: 1.5 }}
      />
      <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
        <FormControl size="small" sx={{ flex: 1 }}>
          <InputLabel>Type</InputLabel>
          <Select value={values.type} label="Type" onChange={(e) => setValues({ ...values, type: e.target.value })}>
            <MenuItem value="study">Study</MenuItem>
            <MenuItem value="homework">Homework</MenuItem>
            <MenuItem value="exam">Exam</MenuItem>
            <MenuItem value="project">Project</MenuItem>
            <MenuItem value="work">Work</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ flex: 1 }}>
          <InputLabel>Priority</InputLabel>
          <Select value={values.priority} label="Priority" onChange={(e) => setValues({ ...values, priority: e.target.value })}>
            <MenuItem value="low">Low</MenuItem>
            <MenuItem value="medium">Medium</MenuItem>
            <MenuItem value="high">High</MenuItem>
          </Select>
        </FormControl>
      </Box>
      <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
        <TextField
          size="small"
          type="datetime-local"
          label="Due (optional)"
          value={values.due}
          onChange={(e) => setValues({ ...values, due: e.target.value })}
          slotProps={{ inputLabel: { shrink: true } }}
          sx={{ flex: 1 }}
        />
        <TextField
          size="small"
          type="number"
          label="Estimated minutes"
          value={values.estimatedTime}
          onChange={(e) => setValues({ ...values, estimatedTime: e.target.value })}
          helperText={estimateHint}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: 1, step: 5 } }}
          sx={{ flex: 1 }}
        />
      </Box>
      {error && (
        <Typography variant="body2" color="error" sx={{ mb: 1.5 }}>
          {error}
        </Typography>
      )}
      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button type="submit" variant="contained" size="small" disabled={submitting}>
          {submitting ? submittingLabel : submitLabel}
        </Button>
        <Button variant="text" size="small" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
      </Box>
    </Box>
  );
}

function currentWeekStart() {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));

  const pad = (value: number) => String(value).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function TaskList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { tasks, loading, error, createTask, updateTask, removeTask } = useTasks(user?.id);
  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [deletingTask, setDeletingTask] = useState<Task | null>(null);
  const [deleteInProgress, setDeleteInProgress] = useState(false);
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
  const [actionError, setActionError] = useState<string | null>(null);
  const now = useCurrentTime();
  const [finishingTask, setFinishingTask] = useState<Task | null>(null);
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  // Shown instead of the options when there was nothing to plan.
  const [suggestionNote, setSuggestionNote] = useState<string | null>(null);
  const [acceptingPlanId, setAcceptingPlanId] = useState<string | null>(null);

  const sortedTasks = useMemo(() => sortTasks(tasks), [tasks]);
  const [showDone, setShowDone] = useState(false);

  // Open tasks by when they're due; finished ones go in their own section, folded away.
  const groups = useMemo(() => {
    const weekAhead = now + 7 * 24 * 60 * 60 * 1000;
    const open = sortedTasks.filter((t) => !t.completed);
    const due = (t: Task) => (t.due_date ? new Date(t.due_date).getTime() : null);
    return [
      { key: 'overdue', title: 'Overdue', tasks: open.filter((t) => due(t) !== null && due(t)! < now) },
      { key: 'week', title: 'Due in the next 7 days', tasks: open.filter((t) => due(t) !== null && due(t)! >= now && due(t)! <= weekAhead) },
      { key: 'later', title: 'Due later', tasks: open.filter((t) => due(t) !== null && due(t)! > weekAhead) },
      { key: 'undated', title: 'No due date', tasks: open.filter((t) => due(t) === null) },
    ].filter((group) => group.tasks.length > 0);
  }, [sortedTasks, now]);
  const doneTasks = useMemo(() => sortedTasks.filter((t) => t.completed), [sortedTasks]);
  const ratios = useMemo(() => estimateRatios(tasks), [tasks]);
  const ratioEntries = Object.entries(ratios) as [Task['type'], EstimateRatio][];

  const handleAddTask = async (payload: TaskPayload) => {
    await createTask(payload);
    setShowForm(false);
  };

  const handleEditTask = async (payload: TaskPayload) => {
    if (!editingTask) return;
    await updateTask(editingTask.id, payload);
    setEditingTask(null);
  };

  const handleDeleteTask = async () => {
    if (!deletingTask) return;
    setDeleteInProgress(true);
    try {
      await removeTask(deletingTask.id);
      setDeletingTask(null);
    } catch {
      setActionError("Couldn't delete task. Try again.");
    } finally {
      setDeleteInProgress(false);
    }
  };

  const setToggling = (id: string, toggling: boolean) => {
    setTogglingIds((current) => {
      const next = new Set(current);
      if (toggling) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const updateCompleted = async (task: Task, changes: { completed: boolean; time_spent?: number }) => {
    const { completed } = changes;
    setToggling(task.id, true);
    try {
      await updateTask(task.id, changes);
    } catch {
      setActionError("Couldn't update task. Try again.");
    } finally {
      setToggling(task.id, false);
    }
  };

  // Checking a task off asks how long it took first; unchecking just reopens it.
  const handleToggleTask = (task: Task) => {
    if (task.completed) updateCompleted(task, { completed: false });
    else setFinishingTask(task);
  };

  const finishTask = async (minutes: number | null) => {
    if (!finishingTask) return;
    const task = finishingTask;
    setFinishingTask(null);
    await updateCompleted(task, minutes === null ? { completed: true } : { completed: true, time_spent: minutes });
  };


  // The scheduler service sleeps when idle; wake it now so a plan is quick when asked for. Best effort.
  useEffect(() => {
    if (user) apiPost('/api/schedule/warm', {}).catch(() => {});
  }, [user]);

  const handleSuggestPlan = async () => {
  setLoadingSuggestion(true);
  setSuggestionNote(null);

  try {
    const data = await apiPost('/api/schedule/suggest', {
      now: localNow(),
      weekStart: currentWeekStart(),
      tzOffset: new Date().getTimezoneOffset(),
    });

    setSuggestions(data.suggestions);
    if (data.suggestions.length === 0) {
      setSuggestionNote('Nothing to plan this week. Plans include unfinished tasks with an estimate and a due date that is still ahead.');
    }
  } catch (err: any) {
    setActionError(err.message ?? "Couldn't build a plan. Try again.");
  } finally {
    setLoadingSuggestion(false);
  }
};

// Takes one block out of an option before it's chosen.
const removeSuggestedBlock = (planId: string, blockIndex: number) => {
  setSuggestions((current) =>
    current.map((plan) =>
      plan.id === planId
        ? { ...plan, blocks: plan.blocks.filter((_: any, i: number) => i !== blockIndex), removed: (plan.removed ?? 0) + 1 }
        : plan,
    ),
  );
};

const handleAcceptPlan = async (plan: any) => {
  setAcceptingPlanId(plan.id);

  try {
    await apiPost('/api/schedule/accept', {
      now: localNow(),
      weekStart: currentWeekStart(),
      blocks: plan.blocks,
      // Which option was chosen out of which, recorded for the preference model.
      options: suggestions.map((s) => s.style),
      chosen: suggestions.indexOf(plan),
      removed: plan.removed ?? 0,
    });

    setSuggestions([]);
    navigate('/planner');
  } catch (err: any) {
    setActionError(err.message ?? "Couldn't save this plan. Try again.");
  } finally {
    setAcceptingPlanId(null);
  }
};

  if (!user) {
    return (
      <Card>
        <CardContent>
          <Typography variant="body2" color="text.secondary">
            <MuiLink component={RouterLink} to="/auth">Log in</MuiLink> to see and add your tasks.
          </Typography>
        </CardContent>
      </Card>
    );
  }

  const renderTask = (task: Task) => {
    const overdue = !task.completed && task.due_date !== null && new Date(task.due_date).getTime() < now;
    return (
      <ListItem
        key={task.id}
        disablePadding
        sx={{
          alignItems: 'flex-start',
          gap: 0.5,
          px: { xs: 1, sm: 2 },
          py: 1,
          borderTop: `1px solid ${colors.grey200}`,
          transition: 'background-color 0.15s ease',
          '&:hover': { backgroundColor: colors.surfaceMuted },
        }}
      >
        <Checkbox
          checked={task.completed}
          disabled={togglingIds.has(task.id)}
          onChange={() => handleToggleTask(task)}
          slotProps={{ input: { 'aria-label': `${task.completed ? 'Reopen' : 'Complete'} ${task.title}` } }}
        />
        <Box sx={{ flex: 1, minWidth: 0, pt: 1 }}>
          <Typography
            sx={{
              fontWeight: 600,
              color: task.completed ? colors.grey500 : 'text.primary',
              textDecoration: task.completed ? 'line-through' : 'none',
            }}
          >
            {task.title}
          </Typography>
          {task.description && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25, whiteSpace: 'pre-line' }}>
              {task.description}
            </Typography>
          )}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 0.75 }}>
            {task.due_date && (
              <Chip
                size="small"
                label={`${overdue ? 'Overdue · ' : 'Due '}${formatDue(task.due_date)}`}
                sx={
                  overdue
                    ? { backgroundColor: colors.warningBg, color: colors.warningInk }
                    : { backgroundColor: colors.surfaceMuted, color: 'text.secondary' }
                }
              />
            )}
            <Chip size="small" label={capitalize(task.type)} sx={{ backgroundColor: colors.surfaceMuted, color: 'text.secondary' }} />
            {task.priority === 'high' ? (
              <Chip size="small" variant="outlined" color="error" label="High priority" />
            ) : (
              <Chip size="small" variant="outlined" label={`${capitalize(task.priority)} priority`} sx={{ color: 'text.secondary' }} />
            )}
            {task.estimated_time && <Chip size="small" variant="outlined" label={`About ${task.estimated_time} min`} sx={{ color: 'text.secondary' }} />}
            {task.completed && task.time_spent > 0 && (
              <Chip size="small" variant="outlined" label={`Took ${task.time_spent} min`} sx={{ color: 'text.secondary' }} />
            )}
          </Box>
        </Box>
        <Box sx={{ display: 'flex', pt: 0.5 }}>
          <IconButton aria-label={`Edit ${task.title}`} onClick={() => setEditingTask(task)}>
            <EditOutlined fontSize="small" />
          </IconButton>
          <IconButton aria-label={`Delete ${task.title}`} onClick={() => setDeletingTask(task)}>
            <DeleteOutline fontSize="small" />
          </IconButton>
        </Box>
      </ListItem>
    );
  };

  const openCount = tasks.filter((t) => !t.completed).length;

  return (
    <Box sx={{ maxWidth: 960, mx: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 2, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="h5" component="h1" sx={{ color: colors.violet500 }}>
            Tasks
          </Typography>
          {!loading && tasks.length > 0 && (
            <Typography variant="body2" color="text.secondary">
              {openCount === 0 ? 'Everything is checked off.' : `${openCount} open`}
            </Typography>
          )}
        </Box>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button variant="outlined" startIcon={<AutoAwesomeOutlined />} onClick={handleSuggestPlan} disabled={loadingSuggestion}>
            {loadingSuggestion ? 'Building plan…' : 'Suggest a plan'}
          </Button>
          <Button variant="contained" startIcon={<Add />} onClick={() => setShowForm(!showForm)}>
            Add task
          </Button>
        </Box>
      </Box>

      {suggestionNote && <Alert severity="info">{suggestionNote}</Alert>}

      {suggestions.length > 0 && (
        <Card component="section" sx={{ p: { xs: 2, sm: 3 } }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="h6" component="h2">
              Choose a suggested plan
            </Typography>
            <Button onClick={() => setSuggestions([])} disabled={acceptingPlanId !== null}>
              Dismiss
            </Button>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Remove any session you don't want before choosing. Nothing is saved until you choose a plan.
          </Typography>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2 }}>
            {suggestions.map((plan, index) => (
              <Box
                key={plan.id}
                sx={{ display: 'flex', flexDirection: 'column', border: `1px solid ${colors.grey200}`, borderRadius: '12px', p: 2 }}
              >
                <Typography sx={{ fontWeight: 700, color: colors.violet800 }}>Option {index + 1}</Typography>
                {plan.why && (
                  <Typography variant="body2" sx={{ mb: 1 }}>
                    {plan.why}
                  </Typography>
                )}

                <Box sx={{ flex: 1 }}>
                  {plan.blocks.map((block: any, blockIndex: number) => (
                    <Box
                      key={`${block.task_id}-${block.date}-${block.start_time}`}
                      sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}
                    >
                      <Typography variant="body2" color="text.secondary">
                        {block.activity} · {format(parseISO(block.date), 'EEE MMM d')} ·{' '}
                        {block.start_time.slice(0, 5)}–{block.end_time.slice(0, 5)}
                      </Typography>
                      <IconButton
                        size="small"
                        aria-label={`Remove ${block.activity} on ${block.date} at ${block.start_time.slice(0, 5)}`}
                        onClick={() => removeSuggestedBlock(plan.id, blockIndex)}
                        disabled={acceptingPlanId !== null}
                      >
                        <Close fontSize="small" />
                      </IconButton>
                    </Box>
                  ))}
                  {plan.blocks.length === 0 && (
                    <Typography variant="body2" color="text.secondary">
                      Every session was removed from this option.
                    </Typography>
                  )}
                  {plan.unscheduled?.length > 0 && (
                    <Typography variant="body2" sx={{ mt: 1, color: colors.warningInk }}>
                      Not enough time this week for:{' '}
                      {plan.unscheduled
                        .map((u: any) => `${tasks.find((t) => t.id === u.task)?.title ?? 'a task'} (${u.minutes} min)`)
                        .join(', ')}
                    </Typography>
                  )}
                </Box>

                <Button
                  variant="contained"
                  size="small"
                  sx={{ mt: 1.5, alignSelf: 'flex-start' }}
                  onClick={() => handleAcceptPlan(plan)}
                  disabled={acceptingPlanId !== null || plan.blocks.length === 0}
                >
                  {acceptingPlanId === plan.id ? 'Saving…' : 'Choose this plan'}
                </Button>
              </Box>
            ))}
          </Box>
        </Card>
      )}

      {showForm && (
        <Card component="section" sx={{ p: { xs: 2, sm: 3 } }}>
          <Typography variant="h6" component="h2" sx={{ mb: 2 }}>
            New task
          </Typography>
          <TaskForm
            initial={EMPTY_FORM}
            ratios={ratios}
            submitLabel="Add task"
            submittingLabel="Adding..."
            onSubmit={handleAddTask}
            onCancel={() => setShowForm(false)}
          />
        </Card>
      )}

      {error && <Alert severity="error">{error}</Alert>}

      {loading ? (
        <ListSkeleton rows={4} height={72} />
      ) : tasks.length === 0 ? (
        !showForm && (
          <Card>
            <EmptyState
              title="No tasks yet"
              body="Add homework, exams and projects, and the planner can fit them into your week."
              action={
                <Button variant="contained" startIcon={<Add />} onClick={() => setShowForm(true)}>
                  Add a task
                </Button>
              }
            />
          </Card>
        )
      ) : (
        <>
          {groups.map((group) => (
            <Card component="section" key={group.key} sx={{ pt: 1.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: { xs: 2, sm: 3 }, pb: 1 }}>
                <Typography variant="h6" component="h2" sx={{ fontSize: '1.0625rem' }}>
                  {group.title}
                </Typography>
                <Chip
                  size="small"
                  label={group.tasks.length}
                  sx={group.key === 'overdue' ? { backgroundColor: colors.warningBg, color: colors.warningInk } : { backgroundColor: colors.surfaceMuted, color: 'text.secondary' }}
                />
              </Box>
              <List sx={{ p: 0 }}>{group.tasks.map(renderTask)}</List>
            </Card>
          ))}

          {doneTasks.length > 0 && (
            <Card component="section" sx={{ pt: 1 }}>
              <Button
                onClick={() => setShowDone(!showDone)}
                aria-expanded={showDone}
                endIcon={showDone ? <ExpandLess /> : <ExpandMore />}
                sx={{ mx: { xs: 1, sm: 2 }, mb: 1, color: 'text.secondary' }}
              >
                {showDone ? 'Hide' : 'Show'} {doneTasks.length} finished
              </Button>
              <Collapse in={showDone} unmountOnExit>
                {ratioEntries.length > 0 && (
                  <Typography variant="body2" color="text.secondary" sx={{ px: { xs: 2, sm: 3 }, pb: 1.5 }}>
                    How long finished tasks took:{' '}
                    {ratioEntries.map(([type, ratio]) => `${type} tasks ${ratioText(ratio)} (${ratio.count} tasks)`).join(', ')}.
                  </Typography>
                )}
                <List sx={{ p: 0 }}>{doneTasks.map(renderTask)}</List>
              </Collapse>
            </Card>
          )}
        </>
      )}

      <Dialog open={editingTask !== null} onClose={() => setEditingTask(null)} fullWidth maxWidth="sm">
        <DialogTitle>Edit task</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          {editingTask && (
            <Box sx={{ pt: 1 }}>
              <TaskForm
                key={editingTask.id}
                initial={toFormValues(editingTask)}
                ratios={ratios}
                submitLabel="Save"
                submittingLabel="Saving..."
                onSubmit={handleEditTask}
                onCancel={() => setEditingTask(null)}
              />
            </Box>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={deletingTask !== null} onClose={() => !deleteInProgress && setDeletingTask(null)}>
        <DialogTitle>Delete task?</DialogTitle>
        <DialogContent>
          <DialogContentText>Delete "{deletingTask?.title}"? This can't be undone.</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeletingTask(null)} disabled={deleteInProgress}>
            Cancel
          </Button>
          <Button color="error" variant="contained" onClick={handleDeleteTask} disabled={deleteInProgress}>
            {deleteInProgress ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      <TimeSpentDialog task={finishingTask} onFinish={finishTask} onCancel={() => setFinishingTask(null)} />

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
