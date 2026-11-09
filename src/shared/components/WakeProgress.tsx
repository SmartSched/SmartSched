import { useEffect, useState } from 'react';
import { Box, Card, LinearProgress, Typography } from '@mui/material';
import { wakeStartedAt } from '../../app/lib/wake';

// How long the services usually take to start from asleep. The bar is an estimate from the time since the app
// opened: it moves quickly at first, slows down near the end, and never claims to be finished before it is.
const TYPICAL_START_MS = 50_000;

function estimate() {
  const elapsed = Date.now() - wakeStartedAt();
  return Math.min(95, 100 * (1 - Math.exp((-2 * elapsed) / TYPICAL_START_MS)));
}

// Shown when the user asks for a plan while the server and scheduler are still starting.
export function WakeProgress() {
  const [value, setValue] = useState(estimate);

  useEffect(() => {
    const id = setInterval(() => setValue(estimate()), 500);
    return () => clearInterval(id);
  }, []);

  return (
    <Card component="section" sx={{ p: { xs: 2, sm: 3 } }} role="status" aria-live="polite">
      <Typography sx={{ fontWeight: 600, mb: 0.5 }}>Starting the planner</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        The planner sleeps when nobody has used it for a while, so the first plan can take up to a minute. Your plan
        will appear here once it's ready.
      </Typography>
      <Box>
        <LinearProgress variant="determinate" value={value} aria-label="Starting the planner" sx={{ height: 8, borderRadius: 4 }} />
      </Box>
    </Card>
  );
}
