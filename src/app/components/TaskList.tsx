import { useEffect, useState, FormEvent } from 'react';
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
  Link as MuiLink,
} from '@mui/material';
import { Add } from '@mui/icons-material';
import { Link as RouterLink } from 'react-router';
import { useAuth } from '../lib/AuthContext';
import { apiGet, apiPost, apiPatch } from '../lib/api';

export interface Task {
  id: string;
  title: string;
  completed: boolean;
  priority: 'low' | 'medium' | 'high';
  type: 'homework' | 'exam' | 'project' | 'work' | 'study';
  due_date: string | null;
  estimated_time: number | null;
}

export function TaskList() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [newTask, setNewTask] = useState({ title: '', type: 'study', priority: 'medium', estimated_time: 30 });

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

  const handleAddTask = async (e: FormEvent) => {
    e.preventDefault();
    if (!newTask.title.trim()) return;
    setSubmitting(true);
    try {
      const created = await apiPost('/api/tasks', newTask);
      setTasks([created, ...tasks]);
      setNewTask({ title: '', type: 'study', priority: 'medium', estimated_time: 30 });
      setShowForm(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleTask = async (task: Task) => {
    const updated = await apiPatch(`/api/tasks/${task.id}`, { completed: !task.completed });
    setTasks(tasks.map((t) => (t.id === task.id ? updated : t)));
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
          <Box component="form" onSubmit={handleAddTask} sx={{ mb: 3, p: 2, backgroundColor: 'action.hover', borderRadius: 1 }}>
            <TextField
              fullWidth
              size="small"
              placeholder="Task title"
              value={newTask.title}
              onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
              sx={{ mb: 1.5 }}
              autoFocus
            />
            <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
              <FormControl size="small" sx={{ flex: 1 }}>
                <InputLabel>Type</InputLabel>
                <Select
                  value={newTask.type}
                  label="Type"
                  onChange={(e) => setNewTask({ ...newTask, type: e.target.value })}
                >
                  <MenuItem value="study">Study</MenuItem>
                  <MenuItem value="homework">Homework</MenuItem>
                  <MenuItem value="exam">Exam</MenuItem>
                  <MenuItem value="project">Project</MenuItem>
                  <MenuItem value="work">Work</MenuItem>
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ flex: 1 }}>
                <InputLabel>Priority</InputLabel>
                <Select
                  value={newTask.priority}
                  label="Priority"
                  onChange={(e) => setNewTask({ ...newTask, priority: e.target.value })}
                >
                  <MenuItem value="low">Low</MenuItem>
                  <MenuItem value="medium">Medium</MenuItem>
                  <MenuItem value="high">High</MenuItem>
                </Select>
              </FormControl>
            </Box>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button type="submit" variant="contained" size="small" disabled={submitting}>
                {submitting ? 'Adding...' : 'Add Task'}
              </Button>
              <Button variant="text" size="small" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </Box>
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
            {tasks.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                No tasks yet — add one above
              </Typography>
            ) : (
              tasks.map((task) => (
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
                  <Checkbox checked={task.completed} onChange={() => handleToggleTask(task)} sx={{ mr: 1 }} />
                  <ListItemText
                    primary={task.title}
                    secondary={
                      <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5 }}>
                        <Chip label={task.type} size="small" sx={{ height: 20, fontSize: '10px' }} />
                        <Chip label={task.priority} size="small" color={getPriorityColor(task.priority) as any} sx={{ height: 20, fontSize: '10px' }} />
                        {task.estimated_time && (
                          <Chip label={`${task.estimated_time}min`} size="small" variant="outlined" sx={{ height: 20, fontSize: '10px' }} />
                        )}
                      </Box>
                    }
                  />
                </ListItem>
              ))
            )}
          </List>
        )}
      </CardContent>
    </Card>
  );
}
