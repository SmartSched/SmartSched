import { useEffect, useState, FormEvent } from 'react';
import { Card, CardContent, Typography, Box, Button, TextField, Select, MenuItem, FormControl, InputLabel, Link as MuiLink } from '@mui/material';
import { Add } from '@mui/icons-material';
import { format } from 'date-fns';
import { Link as RouterLink } from 'react-router';
import { useAuth } from '../lib/AuthContext';
import { apiGet, apiPost } from '../lib/api';

export interface TimeBlock {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  activity: string;
  type: 'class' | 'study' | 'break' | 'personal' | 'commute' | 'meal';
}

const todayIso = format(new Date(), 'yyyy-MM-dd');

export function DailyPlanner() {
  const { user } = useAuth();
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [newBlock, setNewBlock] = useState({ date: todayIso, start_time: '09:00', end_time: '10:00', activity: '', type: 'study' });

  const hours = Array.from({ length: 15 }, (_, i) => i + 7);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    apiGet('/api/time-blocks')
      .then(setTimeBlocks)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [user]);

  const handleAddBlock = async (e: FormEvent) => {
    e.preventDefault();
    if (!newBlock.activity.trim()) return;
    setSubmitting(true);
    try {
      const created = await apiPost('/api/time-blocks', newBlock);
      setTimeBlocks([...timeBlocks, created]);
      setNewBlock({ date: todayIso, start_time: '09:00', end_time: '10:00', activity: '', type: 'study' });
      setShowForm(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

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

  const getBlocksForHour = (hour: number) => {
    return timeBlocks.filter((block) => parseInt(block.start_time.split(':')[0]) === hour);
  };

  if (!user) {
    return (
      <Typography variant="body2" color="text.secondary">
        <MuiLink component={RouterLink} to="/auth">Log in</MuiLink> to see and add your schedule.
      </Typography>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
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

      {showForm && (
        <Card sx={{ mb: 3, borderRadius: '16px' }}>
          <CardContent>
            <Box component="form" onSubmit={handleAddBlock} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <TextField
                fullWidth
                label="Activity"
                value={newBlock.activity}
                onChange={(e) => setNewBlock({ ...newBlock, activity: e.target.value })}
                placeholder="e.g., CSC 453 Lecture"
                autoFocus
              />
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                <TextField
                  fullWidth
                  label="Start Time"
                  type="time"
                  value={newBlock.start_time}
                  onChange={(e) => setNewBlock({ ...newBlock, start_time: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                />
                <TextField
                  fullWidth
                  label="End Time"
                  type="time"
                  value={newBlock.end_time}
                  onChange={(e) => setNewBlock({ ...newBlock, end_time: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                />
              </Box>
              <FormControl fullWidth>
                <InputLabel>Type</InputLabel>
                <Select
                  value={newBlock.type}
                  label="Type"
                  onChange={(e) => setNewBlock({ ...newBlock, type: e.target.value })}
                >
                  <MenuItem value="class">Class</MenuItem>
                  <MenuItem value="study">Study</MenuItem>
                  <MenuItem value="break">Break</MenuItem>
                  <MenuItem value="personal">Personal</MenuItem>
                  <MenuItem value="commute">Commute</MenuItem>
                  <MenuItem value="meal">Meal</MenuItem>
                </Select>
              </FormControl>
              <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                <Button onClick={() => setShowForm(false)}>Cancel</Button>
                <Button type="submit" variant="contained" disabled={submitting} sx={{ backgroundColor: '#8b5cf6' }}>
                  {submitting ? 'Adding...' : 'Add Block'}
                </Button>
              </Box>
            </Box>
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
            <Box sx={{ position: 'relative' }}>
              {hours.map((hour, index) => (
                <Box key={hour} sx={{ display: 'flex', minHeight: '80px', borderBottom: index < hours.length - 1 ? '1px dashed #e5e7eb' : 'none' }}>
                  <Box sx={{ width: '80px', pr: 2, pt: 1 }}>
                    <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                      {hour === 12 ? '12 PM' : hour > 12 ? `${hour - 12} PM` : `${hour} AM`}
                    </Typography>
                  </Box>
                  <Box sx={{ flex: 1, pl: 2, borderLeft: '2px solid #e5e7eb', pt: 1 }}>
                    {getBlocksForHour(hour).map((block) => (
                      <Box
                        key={block.id}
                        sx={{
                          mb: 1,
                          p: 1.5,
                          backgroundColor: getTypeColor(block.type) + '20',
                          border: `2px solid ${getTypeColor(block.type)}`,
                          borderRadius: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1,
                        }}
                      >
                        <Box sx={{ flex: 1 }}>
                          <Typography variant="body2" sx={{ fontWeight: 600, color: getTypeColor(block.type) }}>
                            {block.activity}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {block.start_time} - {block.end_time}
                          </Typography>
                        </Box>
                      </Box>
                    ))}
                  </Box>
                </Box>
              ))}
            </Box>
            {timeBlocks.length === 0 && (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <Typography variant="body2" color="text.secondary">
                  Your schedule is empty — add a time block above
                </Typography>
              </Box>
            )}
          </CardContent>
        </Card>
      )}
    </Box>
  );
}
