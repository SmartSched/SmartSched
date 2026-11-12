import { ReactNode, useState } from 'react';
import {
  Avatar,
  Box,
  Container,
  AppBar,
  Toolbar,
  Typography,
  Button,
  ButtonBase,
  Menu,
  MenuItem,
  Divider,
  ListItemIcon,
  useMediaQuery,
  type Theme,
} from '@mui/material';
import { BrowserRouter, Routes, Route, Link, NavLink, useNavigate, Navigate, useLocation } from 'react-router';
import { CalendarMonthOutlined, ChecklistOutlined, Logout, NightsStayOutlined, PersonOutline, WbSunnyOutlined } from '@mui/icons-material';
import { AuthProvider, useAuth } from './lib/AuthContext';
import { ProfileProvider, useProfile } from './lib/ProfileContext';
import { needsConsent } from './lib/consent';
import { colors } from './theme';
import { AppearanceProvider } from './lib/AppearanceContext';
import { HomePage } from '../features/home/components/HomePage';
import { SurveyPage } from '../features/survey/components/SurveyPage';
import { ConsentPage } from '../features/planner/components/ConsentPage';
import { ProfilePage } from '../features/profile/components/ProfilePage';
import { TaskList } from '../features/tasks/components/TaskList';
import { DailyPlanner } from '../features/planner/components/DailyPlanner';
import { DayReflection } from '../features/reflection/components/DayReflection';
import { AuthPage } from '../features/auth/components/AuthPage';
import { ResetPasswordPage } from '../features/auth/components/ResetPasswordPage';
import { PageLoader } from '../shared/components/States';
import { Blob } from '../shared/juice/Blob';
import { useJuicePrefs } from '../shared/juice/prefs';

const NAV_LINKS = [
  { to: '/', label: 'Today', icon: <WbSunnyOutlined /> },
  { to: '/planner', label: 'Planner', icon: <CalendarMonthOutlined /> },
  { to: '/schedule', label: 'Tasks', icon: <ChecklistOutlined /> },
  { to: '/reflection', label: 'Reflect', icon: <NightsStayOutlined /> },
];

const TAB_BAR_HEIGHT = 64;

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const { profile, loading: profileLoading, error: profileError } = useProfile();
  const location = useLocation();

  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/auth" state={{ from: location }} replace />;
  if (profileLoading) return <PageLoader />;
  // Consent (#31) comes first, then the survey.
  if (!profileError && needsConsent(profile)) {
    return location.pathname === '/consent' ? <>{children}</> : <Navigate to="/consent" replace />;
  }
  if (!profileError && !profile?.survey && location.pathname !== '/survey' && location.pathname !== '/consent') {
    return <Navigate to="/survey" replace />;
  }

  return <>{children}</>;
}

function initials(name: string | null | undefined, email: string | undefined) {
  const source = name?.trim() || email?.split('@')[0] || '';
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

function AccountMenu() {
  const { user, signOut } = useAuth();
  const { profile } = useProfile();
  const navigate = useNavigate();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  if (!user) {
    return (
      <Button component={Link} to="/auth" variant="contained">
        Log in
      </Button>
    );
  }

  return (
    <>
      <ButtonBase
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={anchor ? 'true' : undefined}
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={{
          width: 40,
          height: 40,
          borderRadius: '50%',
          border: `1px solid ${colors.accent200}`,
          backgroundColor: colors.accent100,
          color: colors.accent800,
          fontWeight: 700,
          fontSize: 14,
          '&:focus-visible': { outline: `2px solid ${colors.accent600}`, outlineOffset: 2 },
        }}
      >
        {profile?.avatar ? (
          <Avatar src={profile.avatar} alt="" sx={{ width: 38, height: 38 }} />
        ) : (
          initials(profile?.name, user.email)
        )}
      </ButtonBase>
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { mt: 1, minWidth: 220 } } }}
      >
        <Box sx={{ px: 2, py: 1 }}>
          {profile?.name && <Typography sx={{ fontWeight: 600 }}>{profile.name}</Typography>}
          <Typography variant="body2" color="text.secondary" noWrap>
            {user.email}
          </Typography>
        </Box>
        <Divider />
        <MenuItem component={Link} to="/profile" onClick={() => setAnchor(null)}>
          <ListItemIcon>
            <PersonOutline fontSize="small" />
          </ListItemIcon>
          Profile and settings
        </MenuItem>
        <MenuItem
          onClick={async () => {
            setAnchor(null);
            await signOut();
            navigate('/auth');
          }}
        >
          <ListItemIcon>
            <Logout fontSize="small" />
          </ListItemIcon>
          Log out
        </MenuItem>
      </Menu>
    </>
  );
}

// Desktop: links in the app bar, the current page tinted.
function TopNav() {
  return (
    <Box component="nav" aria-label="Main" sx={{ display: 'flex', gap: 0.5, flex: 1 }}>
      {NAV_LINKS.map((link) => (
        <Button
          key={link.to}
          component={NavLink}
          to={link.to}
          end={link.to === '/'}
          sx={{
            color: colors.accent600,
            px: 1.75,
            '&:hover': { backgroundColor: colors.accent100, color: colors.accent800 },
            '&.active': { backgroundColor: colors.accent100, color: colors.accent800 },
          }}
        >
          {link.label}
        </Button>
      ))}
    </Box>
  );
}

// Phones: a tab bar along the bottom instead of a menu.
function BottomTabs() {
  return (
    <Box
      component="nav"
      aria-label="Main"
      sx={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: (t) => t.zIndex.appBar,
        display: 'flex',
        backgroundColor: colors.surface,
        borderTop: `2px solid ${colors.accent200}`,
        pb: 'env(safe-area-inset-bottom)',
      }}
    >
      {NAV_LINKS.map((link) => (
        <ButtonBase
          key={link.to}
          component={NavLink}
          to={link.to}
          end={link.to === '/'}
          sx={{
            flex: 1,
            height: TAB_BAR_HEIGHT,
            flexDirection: 'column',
            gap: 0.25,
            fontSize: 11,
            fontWeight: 700,
            color: colors.grey500,
            '&.active': { color: colors.accent600 },
          }}
        >
          {link.icon}
          {link.label}
        </ButtonBase>
      ))}
    </Box>
  );
}

function NotFound() {
  return (
    <Box sx={{ textAlign: 'center', py: 10 }}>
      <Typography variant="h5" sx={{ color: colors.accent500, mb: 1 }}>
        This page doesn't exist
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        The link may be old or mistyped.
      </Typography>
      <Button component={Link} to="/" variant="contained">
        Go to Today
      </Button>
    </Box>
  );
}

function AppShell() {
  const isMobile = useMediaQuery((t: Theme) => t.breakpoints.down('sm'), { noSsr: true });
  const { user } = useAuth();
  const location = useLocation();
  const showNav = Boolean(user);
  const juice = useJuicePrefs();
  const showBlob = showNav && juice.blob && !['/survey', '/consent'].includes(location.pathname);

  return (
    <Box sx={{ minHeight: '100vh', backgroundColor: colors.surface, pb: showNav && isMobile ? `${TAB_BAR_HEIGHT + 16}px` : 0 }}>
      <AppBar
        position="sticky"
        elevation={0}
        sx={{ backgroundColor: colors.surface, borderBottom: `2px solid ${colors.accent200}`, color: colors.textPrimary }}
      >
        <Toolbar sx={{ gap: { xs: 1, sm: 3 }, maxWidth: 1376, width: '100%', mx: 'auto', px: { xs: 2, sm: 3 } }}>
          <Typography
            component={Link}
            to="/"
            sx={{ fontSize: 24, fontWeight: 700, color: colors.accent500, textDecoration: 'none', mr: { xs: 'auto', sm: 0 } }}
          >
            SmartSched
          </Typography>
          {showNav && !isMobile && <TopNav />}
          {!showNav && <Box sx={{ flex: 1 }} />}
          <AccountMenu />
        </Toolbar>
      </AppBar>

      <Container maxWidth={false} sx={{ maxWidth: 1376, py: { xs: 3, sm: 4 }, px: { xs: 2, sm: 3 } }}>
        {/* Keyed by path so each page fades in when you switch. */}
        <Box key={location.pathname} sx={{ animation: 'pageIn 0.2s ease-out' }}>
          <Routes>
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/" element={<RequireAuth><HomePage /></RequireAuth>} />
            <Route path="/schedule" element={<RequireAuth><TaskList /></RequireAuth>} />
            <Route path="/planner" element={<RequireAuth><DailyPlanner /></RequireAuth>} />
            <Route path="/reflection" element={<RequireAuth><DayReflection /></RequireAuth>} />
            <Route path="/consent" element={<RequireAuth><ConsentPage /></RequireAuth>} />
            <Route path="/survey" element={<RequireAuth><SurveyPage /></RequireAuth>} />
            <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Box>
      </Container>

      {showNav && isMobile && <BottomTabs />}
      {showBlob && <Blob />}
    </Box>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ProfileProvider>
          <AppearanceProvider>
            <AppShell />
          </AppearanceProvider>
        </ProfileProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
