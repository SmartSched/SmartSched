import { Card, CardContent, Typography, Box, Grid } from '@mui/material';
import { CalendarMonth, Schedule, NightsStay } from '@mui/icons-material';
import { format } from 'date-fns';
import { Link } from 'react-router';

const studentName = 'Student';
const tasksCompleted = 1;
const totalTasks = 4;

export function HomePage() {
  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <Box sx={{ maxWidth: '900px', mx: 'auto' }}>
      <Box sx={{ textAlign: 'center', mb: 6, mt: 4 }}>
        <Typography variant="h3" sx={{ fontWeight: 700, color: '#8b5cf6', mb: 1 }}>
          {greeting()}, {studentName}!
        </Typography>
        <Typography variant="h6" sx={{ color: 'text.secondary', fontWeight: 400, mb: 3 }}>
          {format(new Date(), 'EEEE, MMMM d, yyyy')}
        </Typography>
      </Box>

      <Box
        sx={{
          mb: 4,
          p: 3,
          backgroundColor: '#f3e8ff',
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
        <Grid item xs={12} sm={4}>
          <Card
            component={Link}
            to="/schedule"
            sx={{
              cursor: 'pointer',
              textDecoration: 'none',
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
                My Schedule
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Your task list
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={4}>
          <Card
            component={Link}
            to="/planner"
            sx={{
              cursor: 'pointer',
              textDecoration: 'none',
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
                Daily Planner
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Hour-by-hour schedule breakdown
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={4}>
          <Card
            component={Link}
            to="/reflection"
            sx={{
              cursor: 'pointer',
              textDecoration: 'none',
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
                <NightsStay sx={{ fontSize: 40, color: '#8b5cf6' }} />
              </Box>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 1, color: '#5b21b6' }}>
                Day Reflection
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Rate how today went
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
          gentle reminder: taking a break every hour isn't slacking off... it's actually how your brain works best. stretch, breathe, grab some water. you've got this.
        </Typography>
      </Box>
    </Box>
  );
}
