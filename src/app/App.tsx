import { useState, useEffect } from 'react';
import { ThemeProvider, createTheme, CssBaseline, Box, Container, AppBar, Toolbar, Typography, IconButton, Fab } from '@mui/material';
import { Home, Spa, Bedtime } from '@mui/icons-material';
import { addDays, isSameDay, isAfter, setHours } from 'date-fns';
import { HomePage } from './components/HomePage';
import { Calendar } from './components/Calendar';
import { TaskList, Task } from './components/TaskList';
import { StudyTimer } from './components/StudyTimer';
import { BalanceChart } from './components/BalanceChart';
import { HabitTracker } from './components/HabitTracker';
import { DailyPlanner, TimeBlock } from './components/DailyPlanner';
import { DayReflection } from './components/DayReflection';

const theme = createTheme({
  palette: {
    primary: {
      main: '#8b5cf6',
    },
    secondary: {
      main: '#ec4899',
    },
    success: {
      main: '#10b981',
    },
    info: {
      main: '#3b82f6',
    },
    warning: {
      main: '#fbbf24',
    },
  },
  typography: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", sans-serif',
  },
  shape: {
    borderRadius: 12,
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: '12px',
          fontWeight: 600,
        },
      },
    },
  },
});

export default function App() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [currentTab, setCurrentTab] = useState(-1);
  const [showReflection, setShowReflection] = useState(false);

  useEffect(() => {
    const now = new Date();
    const endOfDay = setHours(now, 21);

    if (isAfter(now, endOfDay)) {
      const hasReflectedToday = localStorage.getItem(`reflected-${now.toDateString()}`);
      if (!hasReflectedToday) {
        setShowReflection(true);
      }
    }
  }, []);

  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([
    {
      id: '1',
      startTime: '09:00',
      endTime: '10:00',
      activity: 'CSC 453 Lecture',
      type: 'class',
      color: '#3b82f6',
    },
    {
      id: '2',
      startTime: '10:00',
      endTime: '10:30',
      activity: 'Walk back to dorm',
      type: 'commute',
      color: '#f59e0b',
    },
    {
      id: '3',
      startTime: '10:30',
      endTime: '11:00',
      activity: 'Snack break',
      type: 'meal',
      color: '#06b6d4',
    },
    {
      id: '4',
      startTime: '11:00',
      endTime: '12:30',
      activity: 'Study CSC 453',
      type: 'study',
      color: '#8b5cf6',
    },
    {
      id: '5',
      startTime: '12:30',
      endTime: '13:30',
      activity: 'Lunch with friends',
      type: 'meal',
      color: '#06b6d4',
    },
    {
      id: '6',
      startTime: '14:00',
      endTime: '15:00',
      activity: 'Math 301 Lecture',
      type: 'class',
      color: '#3b82f6',
    },
    {
      id: '7',
      startTime: '15:30',
      endTime: '16:30',
      activity: 'Gym workout',
      type: 'personal',
      color: '#ec4899',
    },
  ]);

  const [tasks, setTasks] = useState<Task[]>([
    {
      id: '1',
      title: 'Review calculus notes',
      completed: false,
      priority: 'high',
      type: 'study',
      dueDate: new Date(),
      estimatedTime: 45,
    },
    {
      id: '2',
      title: 'Complete chemistry lab report',
      completed: false,
      priority: 'high',
      type: 'assignment',
      dueDate: new Date(),
      estimatedTime: 90,
    },
    {
      id: '3',
      title: 'Read chapters 5-7 for history',
      completed: false,
      priority: 'medium',
      type: 'study',
      dueDate: addDays(new Date(), 1),
      estimatedTime: 60,
    },
    {
      id: '4',
      title: 'Gym workout',
      completed: true,
      priority: 'medium',
      type: 'personal',
      dueDate: new Date(),
      estimatedTime: 60,
    },
  ]);

  const [habits, setHabits] = useState([
    {
      id: '1',
      name: 'Morning review',
      icon: '📚',
      completedDates: [new Date(), addDays(new Date(), -1), addDays(new Date(), -3)],
      goal: 7,
    },
    {
      id: '2',
      name: 'Exercise',
      icon: '🏃',
      completedDates: [new Date(), addDays(new Date(), -2), addDays(new Date(), -4)],
      goal: 5,
    },
    {
      id: '3',
      name: '8 hours sleep',
      icon: '😴',
      completedDates: [new Date(), addDays(new Date(), -1), addDays(new Date(), -2), addDays(new Date(), -4)],
      goal: 7,
    },
  ]);

  const balanceData = [
    { name: 'Study', hours: 6, type: 'study' as const },
    { name: 'Personal', hours: 5, type: 'personal' as const },
    { name: 'Sleep', hours: 7.5, type: 'sleep' as const },
  ];

  const calendarEvents = tasks.map(task => ({
    id: task.id,
    title: task.title,
    date: task.dueDate,
    type: task.type,
    color: task.type === 'study' ? '#3b82f6' : task.type === 'assignment' ? '#8b5cf6' : '#10b981',
  }));

  const handleToggleTask = (id: string) => {
    setTasks(tasks.map(task =>
      task.id === id ? { ...task, completed: !task.completed } : task
    ));
  };

  const handleDeleteTask = (id: string) => {
    setTasks(tasks.filter(task => task.id !== id));
  };

  const handleAddTask = (newTask: Omit<Task, 'id' | 'completed'>) => {
    const task: Task = {
      ...newTask,
      id: Date.now().toString(),
      completed: false,
    };
    setTasks([...tasks, task]);
  };

  const handleToggleHabit = (habitId: string, date: Date) => {
    setHabits(habits.map(habit => {
      if (habit.id === habitId) {
        const isCompleted = habit.completedDates.some(completedDate =>
          isSameDay(completedDate, date)
        );

        if (isCompleted) {
          return {
            ...habit,
            completedDates: habit.completedDates.filter(
              completedDate => !isSameDay(completedDate, date)
            ),
          };
        } else {
          return {
            ...habit,
            completedDates: [...habit.completedDates, date],
          };
        }
      }
      return habit;
    }));
  };

  const handleSessionComplete = (duration: number, type: 'study' | 'break') => {
    console.log(`Completed ${type} session: ${duration} minutes`);
  };

  const handleAddTimeBlock = (block: Omit<TimeBlock, 'id'>) => {
    const newBlock: TimeBlock = {
      ...block,
      id: Date.now().toString(),
    };
    setTimeBlocks([...timeBlocks, newBlock]);
  };

  const handleDeleteTimeBlock = (id: string) => {
    setTimeBlocks(timeBlocks.filter(block => block.id !== id));
  };

  const handleReorderTimeBlocks = (blocks: TimeBlock[]) => {
    setTimeBlocks(blocks);
  };

  const handleReflectionSubmit = (ratings: { [key: string]: number }) => {
    console.log('Day reflection:', ratings);
    const today = new Date();
    localStorage.setItem(`reflected-${today.toDateString()}`, 'true');
  };

  const selectedDateTasks = tasks.filter(task =>
    isSameDay(task.dueDate, selectedDate)
  );

  const selectedDateTimeBlocks = timeBlocks;

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.completed).length;

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ minHeight: '100vh', background: 'linear-gradient(180deg, #faf5ff 0%, #fef3c7 50%, #dbeafe 100%)' }}>
        <AppBar position="static" elevation={0} sx={{ backgroundColor: 'white', borderBottom: '2px solid #e9d5ff' }}>
          <Toolbar>
            <Spa sx={{ mr: 1, color: '#8b5cf6' }} />
            <Typography variant="h5" sx={{ flexGrow: 1, color: '#8b5cf6', fontWeight: 700 }}>
              StudyBalance 🌸
            </Typography>
            {currentTab !== -1 && (
              <IconButton onClick={() => setCurrentTab(-1)} sx={{ color: '#8b5cf6' }}>
                <Home />
              </IconButton>
            )}
          </Toolbar>
        </AppBar>

        <Container maxWidth="xl" sx={{ py: 4 }}>
          {currentTab === -1 && (
            <HomePage
              onNavigate={setCurrentTab}
              tasksCompleted={completedTasks}
              totalTasks={totalTasks}
            />
          )}

          {currentTab === 0 && (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' }, gap: 3 }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <Calendar
                  events={calendarEvents}
                  onDateClick={setSelectedDate}
                  selectedDate={selectedDate}
                />
                <TaskList
                  tasks={selectedDateTasks}
                  onToggleTask={handleToggleTask}
                  onDeleteTask={handleDeleteTask}
                  onAddTask={handleAddTask}
                  selectedDate={selectedDate}
                />
              </Box>
              <Box>
                <StudyTimer onSessionComplete={handleSessionComplete} />
              </Box>
            </Box>
          )}

          {currentTab === 1 && (
            <DailyPlanner
              selectedDate={selectedDate}
              timeBlocks={selectedDateTimeBlocks}
              onAddBlock={handleAddTimeBlock}
              onDeleteBlock={handleDeleteTimeBlock}
              onReorderBlocks={handleReorderTimeBlocks}
            />
          )}

          {currentTab === 2 && (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 3 }}>
              <BalanceChart data={balanceData} />
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <Box sx={{ p: 4, backgroundColor: 'white', borderRadius: '24px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                  <Typography variant="body1" sx={{ mb: 3, color: '#6b7280', fontStyle: 'italic', fontWeight: 300, lineHeight: 1.8 }}>
                    hey, just a reminder... you're a human being, not a machine. your metrics won't always go up in a straight line, and that's completely okay.
                  </Typography>
                  <Typography variant="body1" sx={{ mb: 3, color: '#6b7280', fontStyle: 'italic', fontWeight: 300, lineHeight: 1.8 }}>
                    some days you'll crush it, other days you'll just survive. both are valid. both are progress.
                  </Typography>
                  <Typography variant="body1" sx={{ mb: 4, color: '#8b5cf6', fontStyle: 'italic', fontWeight: 400, lineHeight: 1.8 }}>
                    look how far you've come already 💜
                  </Typography>

                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <Box sx={{ width: 60, height: 60, borderRadius: '50%', backgroundColor: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Box component="span" sx={{ fontSize: '24px', color: '#3b82f6' }}>✓</Box>
                      </Box>
                      <Box sx={{ flex: 1 }}>
                        <Typography sx={{ fontSize: '2rem', fontWeight: 600, color: '#3b82f6' }}>
                          {tasks.filter(t => t.completed).length}
                        </Typography>
                        <Typography variant="body2" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>
                          things you've accomplished
                        </Typography>
                      </Box>
                    </Box>

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <Box sx={{ width: 60, height: 60, borderRadius: '50%', backgroundColor: '#d1fae5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Box component="span" sx={{ fontSize: '24px', color: '#10b981' }}>⏱️</Box>
                      </Box>
                      <Box sx={{ flex: 1 }}>
                        <Typography sx={{ fontSize: '2rem', fontWeight: 600, color: '#10b981' }}>
                          42 hours
                        </Typography>
                        <Typography variant="body2" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>
                          time spent learning and growing
                        </Typography>
                      </Box>
                    </Box>

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <Box sx={{ width: 60, height: 60, borderRadius: '50%', backgroundColor: '#f3e8ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Box component="span" sx={{ fontSize: '24px', color: '#8b5cf6' }}>🔥</Box>
                      </Box>
                      <Box sx={{ flex: 1 }}>
                        <Typography sx={{ fontSize: '2rem', fontWeight: 600, color: '#8b5cf6' }}>
                          85%
                        </Typography>
                        <Typography variant="body2" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>
                          consistency with self-care habits
                        </Typography>
                      </Box>
                    </Box>
                  </Box>
                </Box>
              </Box>
            </Box>
          )}

          {currentTab === 3 && (
            <Box sx={{ maxWidth: '800px', mx: 'auto' }}>
              <HabitTracker habits={habits} onToggleHabit={handleToggleHabit} />
              <Box sx={{ mt: 3, p: 4, backgroundColor: 'white', borderRadius: '20px' }}>
                <Typography variant="h6" fontWeight="400" sx={{ mb: 3, color: '#8b5cf6', fontStyle: 'italic' }}>
                  some things to keep in mind 💝
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <Box sx={{ display: 'flex', gap: 2, alignItems: 'start' }}>
                    <Typography sx={{ fontSize: '24px' }}>🌸</Typography>
                    <Typography variant="body2" sx={{ fontStyle: 'italic', fontWeight: 300, lineHeight: 1.7 }}>
                      breaks aren't optional... try 50 minutes on, 10 minutes off. your brain literally needs this to process stuff.
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 2, alignItems: 'start' }}>
                    <Typography sx={{ fontSize: '24px' }}>💧</Typography>
                    <Typography variant="body2" sx={{ fontStyle: 'italic', fontWeight: 300, lineHeight: 1.7 }}>
                      keep water around. being even a little dehydrated makes everything feel harder.
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 2, alignItems: 'start' }}>
                    <Typography sx={{ fontSize: '24px' }}>🌙</Typography>
                    <Typography variant="body2" sx={{ fontStyle: 'italic', fontWeight: 300, lineHeight: 1.7 }}>
                      sleep is when your brain actually saves all the stuff you learned. skipping it is like studying and then deleting the file.
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 2, alignItems: 'start' }}>
                    <Typography sx={{ fontSize: '24px' }}>🎨</Typography>
                    <Typography variant="body2" sx={{ fontStyle: 'italic', fontWeight: 300, lineHeight: 1.7 }}>
                      doing things just because they're fun isn't wasteful. it's literally how you avoid burning out.
                    </Typography>
                  </Box>
                </Box>
              </Box>
            </Box>
          )}
        </Container>

        <Fab
          onClick={() => setShowReflection(true)}
          sx={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            backgroundColor: '#8b5cf6',
            color: 'white',
            '&:hover': {
              backgroundColor: '#7c3aed',
            },
          }}
        >
          <Bedtime />
        </Fab>

        <DayReflection
          open={showReflection}
          onClose={() => setShowReflection(false)}
          selectedDate={selectedDate}
          tasks={selectedDateTasks}
          timeBlocks={selectedDateTimeBlocks}
          onSubmit={handleReflectionSubmit}
        />
      </Box>
    </ThemeProvider>
  );
}
