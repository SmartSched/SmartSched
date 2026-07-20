import { ReactNode } from 'react';
import { ThemeProvider, createTheme, CssBaseline, Box, Container, AppBar, Toolbar, Typography, Button } from '@mui/material';
import { BrowserRouter, Routes, Route, Link, useNavigate, Navigate, useLocation } from 'react-router';
import { AuthProvider, useAuth } from './lib/AuthContext';
import { HomePage } from './components/HomePage';
import { TaskList } from './components/TaskList';
import { DailyPlanner } from './components/DailyPlanner';
import { DayReflection } from './components/DayReflection';
import { AuthPage } from './components/AuthPage';

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

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return null;
  if (!user) return <Navigate to="/auth" state={{ from: location }} replace />;

  return <>{children}</>;
}

function NavAuthControls() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  if (!user) {
    return <Button component={Link} to="/auth" sx={{ color: '#8b5cf6' }}>Log In / Sign Up</Button>;
  }

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Typography variant="body2" sx={{ color: '#6b7280' }}>{user.email}</Typography>
      <Button
        onClick={async () => {
          await signOut();
          navigate('/auth');
        }}
        sx={{ color: '#8b5cf6' }}
      >
        Log Out
      </Button>
    </Box>
  );
}

function AppShell() {
  return (
    <Box sx={{ minHeight: '100vh', backgroundColor: '#ffffff' }}>
      <AppBar position="static" elevation={0} sx={{ backgroundColor: 'white', borderBottom: '2px solid #e9d5ff' }}>
        <Toolbar sx={{ flexWrap: 'wrap', gap: 1 }}>
          <Typography variant="h5" sx={{ flexGrow: 1, color: '#8b5cf6', fontWeight: 700 }}>
            StudyBalance
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
            <Button component={Link} to="/" sx={{ color: '#8b5cf6' }}>Home</Button>
            <Button component={Link} to="/schedule" sx={{ color: '#8b5cf6' }}>Schedule</Button>
            <Button component={Link} to="/planner" sx={{ color: '#8b5cf6' }}>Planner</Button>
            <Button component={Link} to="/reflection" sx={{ color: '#8b5cf6' }}>Reflection</Button>
            <NavAuthControls />
          </Box>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Routes>
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/" element={<RequireAuth><HomePage /></RequireAuth>} />
          <Route path="/schedule" element={<RequireAuth><TaskList /></RequireAuth>} />
          <Route path="/planner" element={<RequireAuth><DailyPlanner /></RequireAuth>} />
          <Route path="/reflection" element={<RequireAuth><DayReflection /></RequireAuth>} />
        </Routes>
      </Container>
    </Box>
  );
}

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <AuthProvider>
          <AppShell />
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}
