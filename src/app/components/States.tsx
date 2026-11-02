import type { ReactNode } from 'react';
import { Box, CircularProgress, Skeleton, Typography } from '@mui/material';

// Shown while auth and the profile load, instead of a blank page.
export function PageLoader() {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', py: 12 }} role="status" aria-label="Loading">
      <CircularProgress size={32} />
    </Box>
  );
}

// Placeholder rows while a list loads.
export function ListSkeleton({ rows = 4, height = 56 }: { rows?: number; height?: number }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }} role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} variant="rounded" height={height} sx={{ borderRadius: '12px' }} />
      ))}
    </Box>
  );
}

// A quiet message for an empty list, with at most one action.
export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <Box sx={{ textAlign: 'center', py: 5, px: 2 }}>
      <Typography sx={{ fontWeight: 600, mb: 0.5 }}>{title}</Typography>
      {body && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: action ? 2 : 0 }}>
          {body}
        </Typography>
      )}
      {action}
    </Box>
  );
}
