import type { ReactNode } from 'react';
import { Alert, AlertTitle, Box } from '@mui/material';
import type { BurnoutWarning } from '../lib/burnout';

// The week's heavy spots from burnoutWarnings, or nothing when there aren't any.
export function BurnoutBanner({ warnings, action }: { warnings: BurnoutWarning[]; action?: ReactNode }) {
  if (warnings.length === 0) return null;
  return (
    <Alert severity="warning" action={action} sx={{ mb: 3, borderRadius: '12px' }}>
      <AlertTitle>A few spots this week look heavy</AlertTitle>
      <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
        {warnings.map((w) => (
          <li key={`${w.kind}-${w.date}-${w.message}`}>{w.message}</li>
        ))}
      </Box>
    </Alert>
  );
}
