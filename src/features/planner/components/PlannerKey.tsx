import type { ReactNode } from 'react';
import { Box, Card, FormControlLabel, Switch, Typography } from '@mui/material';
import { Link } from 'react-router';
import type { TimeBlock } from '../../../app/lib/planner';
import { CATEGORY_LABELS, categoryColor, colors } from '../../../app/theme';

const SHOW_COMMUTES_KEY = 'smartsched.showCommutes';
const KEY_TYPES: TimeBlock['type'][] = ['class', 'study', 'task', 'work', 'meal', 'break', 'personal'];

// Whether commutes show on the planner, remembered in this browser. Hidden unless turned on; storage can be
// unavailable (private windows, blocked site data), so every access is guarded.
export function readShowCommutes() {
  try {
    return localStorage.getItem(SHOW_COMMUTES_KEY) === 'true';
  } catch {
    return false;
  }
}

export function saveShowCommutes(show: boolean) {
  try {
    localStorage.setItem(SHOW_COMMUTES_KEY, String(show));
  } catch {
    // Just not remembered past this visit.
  }
}

function Swatch({ color, dashed }: { color: string; dashed?: boolean }) {
  return (
    <Box
      aria-hidden
      sx={{
        width: 14,
        height: 14,
        flexShrink: 0,
        borderRadius: '4px',
        boxSizing: 'border-box',
        backgroundColor: color + '20',
        border: `2px ${dashed ? 'dashed' : 'solid'} ${color}`,
      }}
    />
  );
}

function Row({ swatch, label, hint }: { swatch: ReactNode; label: string; hint?: string }) {
  return (
    <Box component="li" sx={{ display: 'flex', gap: 1.25, alignItems: hint ? 'flex-start' : 'center' }}>
      <Box sx={{ pt: hint ? '3px' : 0 }}>{swatch}</Box>
      <Box>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {label}
        </Typography>
        {hint && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.4 }}>
            {hint}
          </Typography>
        )}
      </Box>
    </Box>
  );
}

// The planner's side panel: what each colour means, and whether commutes show.
export function PlannerKey({
  showCommutes,
  onShowCommutesChange,
  hasSurvey,
}: {
  showCommutes: boolean;
  onShowCommutesChange: (show: boolean) => void;
  hasSurvey: boolean;
}) {
  return (
    <Card component="aside" aria-label="Planner key" sx={{ flex: '1 1 220px', maxWidth: { md: 260 }, p: 2.5, position: { md: 'sticky' }, top: { md: 88 } }}>
      <Typography variant="h6" component="h2" sx={{ fontSize: '1rem', mb: 1.5 }}>
        Key
      </Typography>
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
        {KEY_TYPES.map((type) => (
          <Row key={type} swatch={<Swatch color={categoryColor(type)} />} label={CATEGORY_LABELS[type]} />
        ))}
        <Row
          swatch={
            <Box
              aria-hidden
              sx={{
                width: 14,
                height: 14,
                borderRadius: '4px',
                border: `1px solid ${colors.grey200}`,
                backgroundColor: colors.surfaceMuted,
                backgroundImage: `repeating-linear-gradient(135deg, transparent 0 3px, ${colors.grey200} 3px 4px)`,
              }}
            />
          }
          label="Downtime"
          hint={
            hasSurvey
              ? 'Sleep, the hour before bed and 45 minutes after you wake. Plans keep study out of it.'
              : 'Sleep and getting up. Add your wake time in the survey to fit it to you.'
          }
        />
        <Row
          swatch={
            <Box
              aria-hidden
              sx={{ width: 14, height: 14, borderRadius: '4px', boxSizing: 'border-box', border: `1.5px dashed ${colors.accent600}`, backgroundColor: colors.accent100 }}
            />
          }
          label="Reflect on your day"
          hint="A minute at the start of your wind-down. Click it to rate the day."
        />
        <Row
          swatch={<Box aria-hidden sx={{ width: 14, height: 2, backgroundColor: colors.error, mt: '6px' }} />}
          label="Now"
        />
      </Box>

      <Box sx={{ borderTop: `1px solid ${colors.grey200}`, mt: 2, pt: 1.5 }}>
        <FormControlLabel
          control={<Switch checked={showCommutes} onChange={(e) => onShowCommutesChange(e.target.checked)} />}
          label={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Swatch color={categoryColor('commute')} dashed />
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                Show commutes
              </Typography>
            </Box>
          }
          sx={{ m: 0, gap: 0.5 }}
        />
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, lineHeight: 1.4 }}>
          Travel time is still planned around when they're hidden.{' '}
          <Box component={Link} to="/profile" sx={{ color: colors.accent600 }}>
            Edit travel times
          </Box>
        </Typography>
      </Box>
    </Card>
  );
}
