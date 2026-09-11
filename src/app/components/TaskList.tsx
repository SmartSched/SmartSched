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
  Link as MuiLink,
} from '@mui/material';
import { Add, EditOutlined, DeleteOutline } from '@mui/icons-material';
import { Link as RouterLink } from 'react-router';
import { format } from 'date-fns';
import { useAuth } from '../lib/AuthContext';
import { apiGet, apiPost, apiPatch, apiDelete } from '../lib/api';

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

type TaskPayload = Pick<Task, 'title' | 'description' | 'type' | 'priority' | 'due_date' | 'estimated_time'>;

interface TaskFormValues {
  title: string;
  description: string;
  type: string;
  priority: string;
  due: string; // datetime-local value, in the browser's local time
  estimatedTime: string;
}

const EMPTY_FORM: TaskFormValues = { title: '', description: '', type: 'study', priority: 'medium', due: '', estimatedTime: '' };

const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

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

// Unfinished first (soonest due, undated last, then priority, then newest); finished below, most recently finished first.
function sortTasks(tasks: Task[]) {
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

function formatDue(dueDate: string) {
  const due = new Date(dueDate);
  const pattern = due.getFullYear() === new Date().getFullYear() ? 'EEE MMM d, h:mm a' : 'EEE MMM d yyyy, h:mm a';
  return format(due, pattern);
}

interface TaskFormProps {
  initial: TaskFormValues;
  submitLabel: string;
  submittingLabel: string;
  onSubmit: (payload: TaskPayload) => Promise<void>;
  onCancel: () => void;
}

function TaskForm({ initial, submitLabel, submittingLabel, onSubmit, onCancel }: TaskFormProps) {
  const [values, setValues] = useState(initial);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

export function TaskList() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [deletingTask, setDeletingTask] = useState<Task | null>(null);
  const [deleteInProgress, setDeleteInProgress] = useState(false);
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
  const [actionError, setActionError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    apiGet('/api/tasks')
      .then(setTasks)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [user]);

  // Re-check overdue flags while the page stays open.
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const sortedTasks = useMemo(() => sortTasks(tasks), [tasks]);

  const handleAddTask = async (payload: TaskPayload) => {
    const created = await apiPost('/api/tasks', payload);
    setTasks((current) => [created, ...current]);
    setShowForm(false);
  };

  const handleEditTask = async (payload: TaskPayload) => {
    if (!editingTask) return;
    const updated = await apiPatch(`/api/tasks/${editingTask.id}`, payload);
    setTasks((current) => current.map((t) => (t.id === updated.id ? updated : t)));
    setEditingTask(null);
  };

  const handleDeleteTask = async () => {
    if (!deletingTask) return;
    setDeleteInProgress(true);
    try {
      await apiDelete(`/api/tasks/${deletingTask.id}`);
      setTasks((current) => current.filter((t) => t.id !== deletingTask.id));
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

  const handleToggleTask = async (task: Task) => {
    const completed = !task.completed;
    setToggling(task.id, true);
    setTasks((current) =>
      current.map((t) => (t.id === task.id ? { ...t, completed, completed_at: completed ? new Date().toISOString() : null } : t))
    );
    try {
      const updated = await apiPatch(`/api/tasks/${task.id}`, { completed });
      setTasks((current) => current.map((t) => (t.id === task.id ? updated : t)));
    } catch {
      setTasks((current) => current.map((t) => (t.id === task.id ? task : t)));
      setActionError("Couldn't update task. Try again.");
    } finally {
      setToggling(task.id, false);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'error';
      case 'medium':
        return 'warning';
      case 'low':
        return 'info';
      default:
        return 'default';
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

  return (
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardContent sx={{ flexGrow: 1, overflow: 'auto' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" fontWeight="600">
            Your Tasks
          </Typography>
          <Button startIcon={<Add />} size="small" onClick={() => setShowForm(!showForm)}>
            Add
          </Button>
        </Box>

        {showForm && (
          <Box sx={{ mb: 3, p: 2, backgroundColor: 'action.hover', borderRadius: 1 }}>
            <TaskForm
              initial={EMPTY_FORM}
              submitLabel="Add Task"
              submittingLabel="Adding..."
              onSubmit={handleAddTask}
              onCancel={() => setShowForm(false)}
            />
          </Box>
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
          <List sx={{ p: 0 }}>
            {sortedTasks.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                No tasks yet — add one above
              </Typography>
            ) : (
              sortedTasks.map((task) => {
                const overdue = !task.completed && task.due_date !== null && new Date(task.due_date).getTime() < now;
                return (
                  <ListItem
                    key={task.id}
                    disablePadding
                    sx={{
                      mb: 1,
                      border: '1px solid',
                      borderColor: 'divider',
                      borderRadius: 1,
                      backgroundColor: task.completed ? 'action.hover' : 'transparent',
                      py: 1.5,
                      px: 2,
                    }}
                  >
                    <Checkbox
                      checked={task.completed}
                      disabled={togglingIds.has(task.id)}
                      onChange={() => handleToggleTask(task)}
                      sx={{ mr: 1 }}
                    />
                    <ListItemText
                      primary={task.title}
                      slotProps={{ secondary: { component: 'div' } }}
                      secondary={
                        <>
                          {task.description && (
                            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25, whiteSpace: 'pre-line' }}>
                              {task.description}
                            </Typography>
                          )}
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                            <Chip label={task.type} size="small" sx={{ height: 20, fontSize: '10px' }} />
                            <Chip label={task.priority} size="small" color={getPriorityColor(task.priority) as any} sx={{ height: 20, fontSize: '10px' }} />
                            {task.estimated_time && (
                              <Chip label={`${task.estimated_time}min`} size="small" variant="outlined" sx={{ height: 20, fontSize: '10px' }} />
                            )}
                            {task.due_date && (
                              <Chip
                                label={`${overdue ? 'Overdue · ' : 'Due '}${formatDue(task.due_date)}`}
                                size="small"
                                variant="outlined"
                                color={overdue ? 'error' : 'default'}
                                sx={{ height: 20, fontSize: '10px' }}
                              />
                            )}
                          </Box>
                        </>
                      }
                    />
                    <Box sx={{ display: 'flex', ml: 1 }}>
                      <IconButton size="small" aria-label={`Edit ${task.title}`} onClick={() => setEditingTask(task)}>
                        <EditOutlined fontSize="small" />
                      </IconButton>
                      <IconButton size="small" aria-label={`Delete ${task.title}`} onClick={() => setDeletingTask(task)}>
                        <DeleteOutline fontSize="small" />
                      </IconButton>
                    </Box>
                  </ListItem>
                );
              })
            )}
          </List>
        )}
      </CardContent>

      <Dialog open={editingTask !== null} onClose={() => setEditingTask(null)} fullWidth maxWidth="sm">
        <DialogTitle>Edit task</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          {editingTask && (
            <Box sx={{ pt: 1 }}>
              <TaskForm
                key={editingTask.id}
                initial={toFormValues(editingTask)}
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
    </Card>
  );
}
