import { useState } from 'react';
import {
  Card,
  CardContent,
  Typography,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Checkbox,
  IconButton,
  Chip,
  Box,
  TextField,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from '@mui/material';
import { Add, Delete, Flag } from '@mui/icons-material';
import { format } from 'date-fns';

export interface Task {
  id: string;
  title: string;
  completed: boolean;
  priority: 'low' | 'medium' | 'high';
  type: 'study' | 'assignment' | 'personal';
  dueDate: Date;
  estimatedTime?: number;
}

interface TaskListProps {
  tasks: Task[];
  onToggleTask: (id: string) => void;
  onDeleteTask: (id: string) => void;
  onAddTask: (task: Omit<Task, 'id' | 'completed'>) => void;
  selectedDate: Date;
}

export function TaskList({ tasks, onToggleTask, onDeleteTask, onAddTask, selectedDate }: TaskListProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTask, setNewTask] = useState({
    title: '',
    priority: 'medium' as const,
    type: 'study' as const,
    estimatedTime: 60,
  });

  const handleAddTask = () => {
    if (newTask.title.trim()) {
      onAddTask({
        ...newTask,
        dueDate: selectedDate,
      });
      setNewTask({ title: '', priority: 'medium', type: 'study', estimatedTime: 60 });
      setShowAddForm(false);
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

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'study':
        return '#3b82f6';
      case 'assignment':
        return '#8b5cf6';
      case 'personal':
        return '#10b981';
      default:
        return '#6b7280';
    }
  };

  return (
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardContent sx={{ flexGrow: 1, overflow: 'auto' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" fontWeight="600">
            Tasks for {format(selectedDate, 'MMM d')}
          </Typography>
          <IconButton onClick={() => setShowAddForm(!showAddForm)} color="primary" size="small">
            <Add />
          </IconButton>
        </Box>

        {showAddForm && (
          <Box sx={{ mb: 3, p: 2, backgroundColor: 'action.hover', borderRadius: 1 }}>
            <TextField
              fullWidth
              size="small"
              placeholder="Task title"
              value={newTask.title}
              onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
              sx={{ mb: 1.5 }}
            />
            <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
              <FormControl size="small" sx={{ flex: 1 }}>
                <InputLabel>Priority</InputLabel>
                <Select
                  value={newTask.priority}
                  label="Priority"
                  onChange={(e) => setNewTask({ ...newTask, priority: e.target.value as any })}
                >
                  <MenuItem value="low">Low</MenuItem>
                  <MenuItem value="medium">Medium</MenuItem>
                  <MenuItem value="high">High</MenuItem>
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ flex: 1 }}>
                <InputLabel>Type</InputLabel>
                <Select
                  value={newTask.type}
                  label="Type"
                  onChange={(e) => setNewTask({ ...newTask, type: e.target.value as any })}
                >
                  <MenuItem value="study">Study</MenuItem>
                  <MenuItem value="assignment">Assignment</MenuItem>
                  <MenuItem value="personal">Personal</MenuItem>
                </Select>
              </FormControl>
            </Box>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button variant="contained" size="small" onClick={handleAddTask}>
                Add Task
              </Button>
              <Button variant="text" size="small" onClick={() => setShowAddForm(false)}>
                Cancel
              </Button>
            </Box>
          </Box>
        )}

        <List sx={{ p: 0 }}>
          {tasks.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
              No tasks for this day
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
                }}
                secondaryAction={
                  <IconButton edge="end" onClick={() => onDeleteTask(task.id)} size="small">
                    <Delete fontSize="small" />
                  </IconButton>
                }
              >
                <ListItemButton onClick={() => onToggleTask(task.id)} sx={{ py: 1.5 }}>
                  <Checkbox checked={task.completed} edge="start" sx={{ mr: 1 }} />
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography
                          variant="body2"
                          sx={{
                            textDecoration: task.completed ? 'line-through' : 'none',
                            color: task.completed ? 'text.secondary' : 'text.primary',
                          }}
                        >
                          {task.title}
                        </Typography>
                        {task.priority === 'high' && (
                          <Flag fontSize="small" sx={{ color: 'error.main', width: 16, height: 16 }} />
                        )}
                      </Box>
                    }
                    secondary={
                      <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5 }}>
                        <Chip
                          label={task.type}
                          size="small"
                          sx={{
                            height: 20,
                            fontSize: '10px',
                            backgroundColor: getTypeColor(task.type),
                            color: 'white',
                          }}
                        />
                        <Chip
                          label={task.priority}
                          size="small"
                          color={getPriorityColor(task.priority) as any}
                          sx={{ height: 20, fontSize: '10px' }}
                        />
                        {task.estimatedTime && (
                          <Chip
                            label={`${task.estimatedTime}min`}
                            size="small"
                            variant="outlined"
                            sx={{ height: 20, fontSize: '10px' }}
                          />
                        )}
                      </Box>
                    }
                  />
                </ListItemButton>
              </ListItem>
            ))
          )}
        </List>
      </CardContent>
    </Card>
  );
}
