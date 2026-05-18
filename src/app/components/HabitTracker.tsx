import { Card, CardContent, Typography, Box, IconButton, LinearProgress } from '@mui/material';
import { CheckCircle, RadioButtonUnchecked } from '@mui/icons-material';
import { format, subDays, isSameDay } from 'date-fns';

interface Habit {
  id: string;
  name: string;
  icon: string;
  completedDates: Date[];
  goal: number;
}

interface HabitTrackerProps {
  habits: Habit[];
  onToggleHabit: (habitId: string, date: Date) => void;
}

export function HabitTracker({ habits, onToggleHabit }: HabitTrackerProps) {
  const today = new Date();
  const last7Days = Array.from({ length: 7 }, (_, i) => subDays(today, 6 - i));

  const isHabitCompleted = (habit: Habit, date: Date) => {
    return habit.completedDates.some(completedDate => isSameDay(completedDate, date));
  };

  const getWeekProgress = (habit: Habit) => {
    const completedThisWeek = habit.completedDates.filter(date => {
      return last7Days.some(day => isSameDay(day, date));
    }).length;
    return (completedThisWeek / habit.goal) * 100;
  };

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" fontWeight="600" sx={{ mb: 3 }}>
          Daily Habits
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {habits.map((habit) => {
            const progress = getWeekProgress(habit);
            const completedThisWeek = habit.completedDates.filter(date => {
              return last7Days.some(day => isSameDay(day, date));
            }).length;

            return (
              <Box key={habit.id}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5 }}>
                  <Typography variant="body1" sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <span style={{ fontSize: '20px' }}>{habit.icon}</span>
                    {habit.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {completedThisWeek}/{habit.goal} this week
                  </Typography>
                </Box>

                <LinearProgress
                  variant="determinate"
                  value={Math.min(progress, 100)}
                  sx={{
                    height: 6,
                    borderRadius: 3,
                    mb: 1.5,
                    backgroundColor: 'action.hover',
                    '& .MuiLinearProgress-bar': {
                      backgroundColor: progress >= 100 ? 'success.main' : 'primary.main',
                    },
                  }}
                />

                <Box sx={{ display: 'flex', gap: 1, justifyContent: 'space-between' }}>
                  {last7Days.map((day) => {
                    const isCompleted = isHabitCompleted(habit, day);
                    const isCurrentDay = isSameDay(day, today);

                    return (
                      <Box key={day.toISOString()} sx={{ textAlign: 'center', flex: 1 }}>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5, fontWeight: isCurrentDay ? 600 : 400 }}>
                          {format(day, 'EEE')}
                        </Typography>
                        <IconButton
                          size="small"
                          onClick={() => onToggleHabit(habit.id, day)}
                          sx={{
                            color: isCompleted ? 'success.main' : 'action.disabled',
                            '&:hover': {
                              backgroundColor: isCompleted ? 'success.50' : 'action.hover',
                            },
                          }}
                        >
                          {isCompleted ? (
                            <CheckCircle fontSize="small" />
                          ) : (
                            <RadioButtonUnchecked fontSize="small" />
                          )}
                        </IconButton>
                        <Typography variant="caption" sx={{ display: 'block', fontSize: '11px' }}>
                          {format(day, 'd')}
                        </Typography>
                      </Box>
                    );
                  })}
                </Box>
              </Box>
            );
          })}
        </Box>
      </CardContent>
    </Card>
  );
}
