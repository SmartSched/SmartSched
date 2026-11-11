import { Box, Button, Container, Stack, Typography } from '@mui/material';
import { ArrowForward, AutoAwesomeOutlined, FavoriteBorderOutlined, RouteOutlined } from '@mui/icons-material';
import { Link } from 'react-router';
import { colors, withAlpha } from '../../../app/theme';

const features = [
  {
    icon: <RouteOutlined fontSize="small" />,
    title: 'A plan that fits real life',
    copy: 'Bring classes, shifts, errands, and travel time into one calm view.',
  },
  {
    icon: <AutoAwesomeOutlined fontSize="small" />,
    title: 'Make room for what matters',
    copy: 'Find realistic study time without sacrificing sleep, meals, or people.',
  },
  {
    icon: <FavoriteBorderOutlined fontSize="small" />,
    title: 'Stay steady, not stretched',
    copy: 'Notice overloaded days early and build a routine you can sustain.',
  },
];

function SchedulePreview() {
  const blocks = [
    { time: '9:00', label: 'Psychology lecture', color: colors.info, width: '78%' },
    { time: '11:30', label: 'Coffee with Maya', color: colors.pink500, width: '62%' },
    { time: '2:00', label: 'Focused study', color: colors.accent600, width: '88%' },
    { time: '5:30', label: 'Gym + reset', color: colors.success, width: '54%' },
  ];

  return (
    <Box
      aria-label="Example of a balanced daily schedule"
      sx={{
        width: '100%', maxWidth: 490, border: `1px solid ${colors.grey200}`, borderRadius: 5,
        bgcolor: colors.surface, boxShadow: '0 26px 64px rgba(41, 35, 55, 0.15)', overflow: 'hidden',
      }}
    >
      <Box sx={{ p: { xs: 2, sm: 2.5 }, borderBottom: `1px solid ${colors.grey200}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography sx={{ fontWeight: 700, fontSize: 17 }}>Tuesday, October 14</Typography>
          <Typography variant="body2" color="text.secondary">Your day, with room to breathe</Typography>
        </Box>
        <Box sx={{ bgcolor: colors.accent100, color: colors.accent800, borderRadius: 2, px: 1.25, py: 0.6, fontSize: 12, fontWeight: 700 }}>Balanced</Box>
      </Box>
      <Box sx={{ p: { xs: 2, sm: 2.5 }, display: 'grid', gap: 1.2 }}>
        {blocks.map((block) => (
          <Box key={block.label} sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
            <Typography variant="caption" sx={{ width: 34, color: colors.grey500, fontWeight: 600 }}>{block.time}</Typography>
            <Box sx={{ width: block.width, minHeight: 43, display: 'flex', alignItems: 'center', px: 1.4, borderRadius: 2, bgcolor: withAlpha(block.color, 15), borderLeft: `4px solid ${block.color}`, color: colors.textPrimary, fontSize: 13, fontWeight: 650 }}>
              {block.label}
            </Box>
          </Box>
        ))}
      </Box>
      <Box sx={{ mx: { xs: 2, sm: 2.5 }, mb: { xs: 2, sm: 2.5 }, p: 1.5, borderRadius: 2.5, bgcolor: colors.successBg, color: colors.successInk, display: 'flex', gap: 1, alignItems: 'center' }}>
        <AutoAwesomeOutlined fontSize="small" />
        <Typography variant="body2" sx={{ fontWeight: 600 }}>You have a restorative evening ahead.</Typography>
      </Box>
    </Box>
  );
}

export function LandingPage() {
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: colors.surface, color: colors.textPrimary, overflow: 'hidden' }}>
      <Box component="header" sx={{ borderBottom: `1px solid ${colors.grey200}`, bgcolor: withAlpha(colors.surface, 92) }}>
        <Container maxWidth={false} sx={{ maxWidth: 1200, minHeight: 76, px: { xs: 2, sm: 3 }, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography sx={{ fontSize: 23, fontWeight: 800, letterSpacing: '-0.04em', color: colors.textPrimary }}>
            Smart<span style={{ color: colors.accent600 }}>Sched</span>
          </Typography>
          <Stack direction="row" spacing={{ xs: 0.5, sm: 1.5 }} alignItems="center">
            <Button component={Link} to="/auth" color="inherit" sx={{ color: colors.textPrimary, px: { xs: 1, sm: 1.5 } }}>Log in</Button>
            <Button component={Link} to="/auth" variant="contained" sx={{ display: { xs: 'none', sm: 'inline-flex' } }}>Get started</Button>
          </Stack>
        </Container>
      </Box>

      <Box component="main">
        <Container maxWidth={false} sx={{ maxWidth: 1200, px: { xs: 2, sm: 3 }, pt: { xs: 8, md: 13 }, pb: { xs: 9, md: 14 } }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.05fr 0.95fr' }, alignItems: 'center', gap: { xs: 6, md: 7 } }}>
            <Box>
              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.8, border: `1px solid ${colors.accent200}`, color: colors.accent800, bgcolor: colors.accent100, borderRadius: 20, px: 1.35, py: 0.65, fontSize: 13, fontWeight: 700, mb: 2.75 }}>
                <AutoAwesomeOutlined sx={{ fontSize: 16 }} /> Schedule for a full life
              </Box>
              <Typography component="h1" sx={{ fontSize: { xs: '2.7rem', sm: '3.65rem', lg: '4.2rem' }, lineHeight: 1.04, letterSpacing: '-0.055em', fontWeight: 800, maxWidth: 650 }}>
                Your time is more than a to-do list.
              </Typography>
              <Typography sx={{ mt: 2.5, maxWidth: 560, fontSize: { xs: 17, sm: 19 }, lineHeight: 1.6, color: colors.textSecondary }}>
                SmartSched turns everything on your plate into a balanced plan, so your work, wellbeing, and people all have a place.
              </Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 4 }}>
                <Button component={Link} to="/auth" variant="contained" size="large" endIcon={<ArrowForward />} sx={{ px: 2.5, py: 1.2 }}>Log in to SmartSched</Button>
                <Button component="a" href="#how-it-works" variant="text" size="large" sx={{ px: 2, color: colors.textPrimary }}>See how it works</Button>
              </Stack>
              <Typography variant="body2" sx={{ mt: 2, color: colors.grey500 }}>Built for students balancing school, work, and life.</Typography>
            </Box>
            <Box sx={{ position: 'relative', display: 'flex', justifyContent: { xs: 'center', md: 'flex-end' }, '&::before': { content: '""', position: 'absolute', width: '82%', aspectRatio: '1', borderRadius: '50%', bgcolor: colors.accent100, filter: 'blur(1px)' } }}>
              <Box sx={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'center' }}><SchedulePreview /></Box>
            </Box>
          </Box>
        </Container>

        <Box id="how-it-works" sx={{ bgcolor: colors.surfaceMuted, borderTop: `1px solid ${colors.grey200}`, borderBottom: `1px solid ${colors.grey200}` }}>
          <Container maxWidth={false} sx={{ maxWidth: 1200, px: { xs: 2, sm: 3 }, py: { xs: 7, md: 10 } }}>
            <Typography component="h2" sx={{ fontSize: { xs: '1.85rem', sm: '2.35rem' }, letterSpacing: '-0.035em', fontWeight: 800, maxWidth: 610 }}>A schedule that works with you, not against you.</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 2, mt: 4 }}>
              {features.map((feature) => (
                <Box key={feature.title} sx={{ p: 2.5, borderRadius: 3, border: `1px solid ${colors.grey200}`, bgcolor: colors.surface }}>
                  <Box sx={{ color: colors.accent600, bgcolor: colors.accent100, display: 'inline-flex', p: 1, borderRadius: 2, mb: 2 }}>{feature.icon}</Box>
                  <Typography sx={{ fontSize: 17, fontWeight: 750, mb: 0.8 }}>{feature.title}</Typography>
                  <Typography variant="body2" sx={{ color: colors.textSecondary, lineHeight: 1.6 }}>{feature.copy}</Typography>
                </Box>
              ))}
            </Box>
          </Container>
        </Box>

        <Container maxWidth={false} sx={{ maxWidth: 860, textAlign: 'center', px: 2, py: { xs: 8, md: 11 } }}>
          <Typography component="h2" sx={{ fontSize: { xs: '2rem', sm: '2.7rem' }, letterSpacing: '-0.045em', fontWeight: 800 }}>Make space for the life you want to live.</Typography>
          <Button component={Link} to="/auth" variant="contained" size="large" endIcon={<ArrowForward />} sx={{ mt: 3, px: 2.6, py: 1.2 }}>Log in and plan your week</Button>
        </Container>
      </Box>

      <Box component="footer" sx={{ borderTop: `1px solid ${colors.grey200}` }}>
        <Container maxWidth={false} sx={{ maxWidth: 1200, px: { xs: 2, sm: 3 }, py: 2.5, display: 'flex', justifyContent: 'space-between', color: colors.grey500 }}>
          <Typography variant="body2" sx={{ fontWeight: 700 }}>SmartSched</Typography>
          <Typography variant="body2">Plan gently. Live fully.</Typography>
        </Container>
      </Box>
    </Box>
  );
}
