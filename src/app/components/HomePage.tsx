import { Card, CardContent, Typography, Box, Button, Grid } from '@mui/material';
import { CalendarMonth, TrendingUp, CheckCircle, Schedule, Spa } from '@mui/icons-material';
import { format } from 'date-fns';

interface HomePageProps {
  onNavigate: (tab: number) => void;
  studentName?: string;
  tasksCompleted: number;
  totalTasks: number;
}

export function HomePage({ onNavigate, studentName = 'Student', tasksCompleted, totalTasks }: HomePageProps) {
  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const motivationalMessages = [
    "Remember to take breaks! 🌸",
    "You're doing great! 🌟",
    "One step at a time 🦋",
    "Progress over perfection 🌈",
    "Be kind to yourself 💝",
  ];

  const randomMessage = motivationalMessages[Math.floor(Math.random() * motivationalMessages.length)];

  return (
    <Box sx={{ maxWidth: '900px', mx: 'auto' }}>
      <Box sx={{ textAlign: 'center', mb: 6, mt: 4 }}>
        <Typography variant="h3" sx={{ fontWeight: 700, color: '#8b5cf6', mb: 1 }}>
          {greeting()}, {studentName}! ☀️
        </Typography>
        <Typography variant="h6" sx={{ color: 'text.secondary', fontWeight: 400, mb: 3 }}>
          {format(new Date(), 'EEEE, MMMM d, yyyy')}
        </Typography>
        <Box
          sx={{
            display: 'inline-block',
            px: 4,
            py: 2,
            backgroundColor: '#fef3c7',
            borderRadius: '20px',
          }}
        >
          <Typography variant="body1" sx={{ color: '#92400e', fontWeight: 400, fontStyle: 'italic' }}>
            {randomMessage}
          </Typography>
        </Box>
      </Box>

      <Box
        sx={{
          mb: 4,
          p: 3,
          backgroundColor: 'linear-gradient(135deg, #fce7f3 0%, #ddd6fe 100%)',
          borderRadius: '24px',
        }}
      >
        <Typography variant="h6" sx={{ fontWeight: 400, mb: 2, color: '#7c3aed', fontStyle: 'italic' }}>
          how today's going so far...
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box sx={{ flex: 1 }}>
            <Box
              sx={{
                height: 20,
                backgroundColor: 'white',
                borderRadius: '10px',
                overflow: 'hidden',
                position: 'relative',
              }}
            >
              <Box
                sx={{
                  height: '100%',
                  width: `${totalTasks > 0 ? (tasksCompleted / totalTasks) * 100 : 0}%`,
                  backgroundColor: '#a78bfa',
                  transition: 'width 0.3s ease',
                }}
              />
            </Box>
          </Box>
          <Typography variant="body1" sx={{ fontWeight: 400, color: '#7c3aed', minWidth: '60px' }}>
            {tasksCompleted}/{totalTasks}
          </Typography>
        </Box>
      </Box>

      <Grid container spacing={3}>
        <Grid item xs={12} sm={6}>
          <Card
            onClick={() => onNavigate(0)}
            sx={{
              cursor: 'pointer',
              borderRadius: '20px',
              border: '2px solid #bfdbfe',
              transition: 'all 0.3s ease',
              '&:hover': {
                transform: 'translateY(-4px)',
                boxShadow: '0 8px 24px rgba(96, 165, 250, 0.2)',
              },
            }}
          >
            <CardContent sx={{ textAlign: 'center', py: 4 }}>
              <Box
                sx={{
                  width: 80,
                  height: 80,
                  borderRadius: '50%',
                  backgroundColor: '#dbeafe',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  mx: 'auto',
                  mb: 2,
                }}
              >
                <CalendarMonth sx={{ fontSize: 40, color: '#3b82f6' }} />
              </Box>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 1, color: '#1e40af' }}>
                My Schedule 📅
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Plan your day and stay organized
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6}>
          <Card
            onClick={() => onNavigate(1)}
            sx={{
              cursor: 'pointer',
              borderRadius: '20px',
              border: '2px solid #a7f3d0',
              transition: 'all 0.3s ease',
              '&:hover': {
                transform: 'translateY(-4px)',
                boxShadow: '0 8px 24px rgba(52, 211, 153, 0.2)',
              },
            }}
          >
            <CardContent sx={{ textAlign: 'center', py: 4 }}>
              <Box
                sx={{
                  width: 80,
                  height: 80,
                  borderRadius: '50%',
                  backgroundColor: '#d1fae5',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  mx: 'auto',
                  mb: 2,
                }}
              >
                <Schedule sx={{ fontSize: 40, color: '#10b981' }} />
              </Box>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 1, color: '#065f46' }}>
                Daily Planner ⏰
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Hour-by-hour schedule breakdown
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6}>
          <Card
            onClick={() => onNavigate(2)}
            sx={{
              cursor: 'pointer',
              borderRadius: '20px',
              border: '2px solid #fecdd3',
              transition: 'all 0.3s ease',
              '&:hover': {
                transform: 'translateY(-4px)',
                boxShadow: '0 8px 24px rgba(251, 113, 133, 0.2)',
              },
            }}
          >
            <CardContent sx={{ textAlign: 'center', py: 4 }}>
              <Box
                sx={{
                  width: 80,
                  height: 80,
                  borderRadius: '50%',
                  backgroundColor: '#fce7f3',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  mx: 'auto',
                  mb: 2,
                }}
              >
                <TrendingUp sx={{ fontSize: 40, color: '#ec4899' }} />
              </Box>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 1, color: '#9f1239' }}>
                My Progress 🌟
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Celebrate your achievements
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6}>
          <Card
            onClick={() => onNavigate(3)}
            sx={{
              cursor: 'pointer',
              borderRadius: '20px',
              border: '2px solid #e9d5ff',
              transition: 'all 0.3s ease',
              '&:hover': {
                transform: 'translateY(-4px)',
                boxShadow: '0 8px 24px rgba(168, 85, 247, 0.2)',
              },
            }}
          >
            <CardContent sx={{ textAlign: 'center', py: 4 }}>
              <Box
                sx={{
                  width: 80,
                  height: 80,
                  borderRadius: '50%',
                  backgroundColor: '#f3e8ff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  mx: 'auto',
                  mb: 2,
                }}
              >
                <Spa sx={{ fontSize: 40, color: '#8b5cf6' }} />
              </Box>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 1, color: '#5b21b6' }}>
                Healthy Habits 🌸
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Build routines that prevent burnout
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Box
        sx={{
          mt: 4,
          p: 3,
          backgroundColor: '#fef3c7',
          borderRadius: '20px',
          textAlign: 'center',
        }}
      >
        <Typography variant="body1" sx={{ color: '#92400e', fontStyle: 'italic', fontWeight: 300 }}>
          💡 gentle reminder: taking a break every hour isn't slacking off... it's actually how your brain works best. stretch, breathe, grab some water. you've got this 💛
        </Typography>
      </Box>
    </Box>
  );
}
