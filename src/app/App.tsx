import { ReactNode, useState } from 'react';
import {
  ThemeProvider,
  createTheme,
  CssBaseline,
  Box,
  Container,
  AppBar,
  Toolbar,
  Typography,
  Button,
  IconButton,
  Drawer,
  List,
  ListItemButton,
  ListItemText,
  Divider,
  useMediaQuery,
} from '@mui/material';
import { BrowserRouter, Routes, Route, Link, useNavigate, Navigate, useLocation } from 'react-router';
import { AccountCircle, Menu as MenuIcon } from '@mui/icons-material';
import { AuthProvider, useAuth } from './lib/AuthContext';
import { ProfileProvider, useProfile } from './lib/ProfileContext';
import { HomePage } from './components/HomePage';
import { SurveyPage } from './components/SurveyPage';
import { ProfilePage } from './components/ProfilePage';
import { TaskList } from './components/TaskList';
import { DailyPlanner } from './components/DailyPlanner';
import { DayReflection } from './components/DayReflection';
import { AuthPage } from './components/AuthPage';
import { ResetPasswordPage } from './components/ResetPasswordPage';

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

const NAV_LINKS = [
  { to: '/', label: 'Home' },
  { to: '/schedule', label: 'Schedule' },
  { to: '/planner', label: 'Planner' },
  { to: '/reflection', label: 'Reflection' },
];

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const { profile, loading: profileLoading, error: profileError } = useProfile();
  const location = useLocation();

  if (loading) return null;
  if (!user) return <Navigate to="/auth" state={{ from: location }} replace />;
  if (profileLoading) return null;
  if (!profileError && !profile?.survey && location.pathname !== '/survey') {
    return <Navigate to="/survey" replace />;
  }

  return <>{children}</>;
}

function NavAuthControls({ onNavigate }: { onNavigate?: () => void }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  if (!user) {
    return (
      <Button component={Link} to="/auth" onClick={onNavigate} sx={{ color: '#8b5cf6' }}>
        Log In / Sign Up
      </Button>
    );
  }

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
      <Button
        component={Link}
        to="/profile"
        onClick={onNavigate}
        startIcon={<AccountCircle />}
        sx={{ color: '#6b7280', fontWeight: 400 }}
      >
        {user.email}
      </Button>
      <Button
        onClick={async () => {
          await signOut();
          onNavigate?.();
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
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <Box sx={{ minHeight: '100vh', backgroundColor: '#ffffff' }}>
      <AppBar position="static" elevation={0} sx={{ backgroundColor: 'white', borderBottom: '2px solid #e9d5ff' }}>
        <Toolbar sx={{ gap: 1 }}>
          <Typography variant="h5" sx={{ flexGrow: 1, color: '#8b5cf6', fontWeight: 700 }}>
            StudyBalance
          </Typography>

          {isMobile ? (
            <IconButton aria-label="Open menu" onClick={() => setDrawerOpen(true)} sx={{ color: '#8b5cf6' }}>
              <MenuIcon />
            </IconButton>
          ) : (
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
              {NAV_LINKS.map((link) => (
                <Button key={link.to} component={Link} to={link.to} sx={{ color: '#8b5cf6' }}>
                  {link.label}
                </Button>
              ))}
              <NavAuthControls />
            </Box>
          )}
        </Toolbar>
      </AppBar>

      <Drawer anchor="right" open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <Box sx={{ width: 260, pt: 2 }} role="presentation">
          <List>
            {NAV_LINKS.map((link) => (
              <ListItemButton
                key={link.to}
                component={Link}
                to={link.to}
                onClick={() => setDrawerOpen(false)}
              >
                <ListItemText primary={link.label} />
              </ListItemButton>
            ))}
          </List>
          <Divider />
          <Box sx={{ p: 2 }}>
            <NavAuthControls onNavigate={() => setDrawerOpen(false)} />
          </Box>
        </Box>
      </Drawer>

      <Container maxWidth="xl" sx={{ py: 4, px: { xs: 2, sm: 3 } }}>
        <Routes>
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/" element={<RequireAuth><HomePage /></RequireAuth>} />
          <Route path="/schedule" element={<RequireAuth><TaskList /></RequireAuth>} />
          <Route path="/planner" element={<RequireAuth><DailyPlanner /></RequireAuth>} />
          <Route path="/reflection" element={<RequireAuth><DayReflection /></RequireAuth>} />
          <Route path="/survey" element={<RequireAuth><SurveyPage /></RequireAuth>} />
          <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
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
          <ProfileProvider>
            <AppShell />
          </ProfileProvider>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}
