import { useEffect, useMemo, useState } from 'react';
import { Box, ButtonBase, Card, CardContent, Chip, Dialog, DialogContent, DialogTitle, IconButton, Tooltip, Typography } from '@mui/material';
import { ChevronLeft, ChevronRight, Close } from '@mui/icons-material';
import { motion, useReducedMotion } from 'motion/react';
import { addMonths, format, parseISO } from 'date-fns';
import { apiGet } from '../../../app/lib/api';
import type { Task } from '../../../app/lib/tasks';
import { colors, withAlpha } from '../../../app/theme';
import type { ReflectionRow } from '../lib/insights';
import { monthDates, summarizeDay, type DaySummary, type Pattern } from '../lib/days';
import type { TimeBlock } from '../../../app/lib/planner';

// One summary for each of `dates` (consecutive days), reloaded whenever `version` changes (after a reflection is
// saved). Pass a memoised array.
export function useDays(dates: string[], version: number) {
  const [state, setState] = useState<{ days: DaySummary[]; version: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiGet(`/api/reflections?start=${dates[0]}&end=${dates[dates.length - 1]}`),
      apiGet(`/api/time-blocks?start=${dates[0]}&end=${dates[dates.length - 1]}`),
      apiGet('/api/tasks'),
    ])
      .then(([reflections, blocks, tasks]: [ReflectionRow[], TimeBlock[], Task[]]) => {
        if (cancelled) return;
        setState({ days: dates.map((d) => summarizeDay(d, blocks, reflections, tasks)), version });
      })
      .catch(() => {}); // the quilt and the stack just don't show
    return () => {
      cancelled = true;
    };
  }, [dates, version]);

  return state;
}

function patternCss(pattern: Pattern, color: string) {
  switch (pattern) {
    case 'stripes':
      return `repeating-linear-gradient(45deg, ${color} 0 3px, transparent 3px 9px)`;
    case 'dots':
      return `radial-gradient(${color} 1.8px, transparent 2.3px) 0 0 / 9px 9px`;
    case 'checks':
      return `linear-gradient(${color} 1.5px, transparent 1.5px) 0 0 / 10px 10px, linear-gradient(90deg, ${color} 1.5px, transparent 1.5px) 0 0 / 10px 10px`;
    case 'waves':
      return `radial-gradient(circle at 50% 100%, transparent 4px, ${color} 4.5px 6px, transparent 6.5px) 0 0 / 12px 8px`;
    case 'rings':
      return `radial-gradient(circle, transparent 2.5px, ${color} 3px 4.2px, transparent 4.7px) 0 0 / 12px 12px`;
    default:
      return 'none';
  }
}

// The month as a blanket of five panels, one per thing tracked. Each panel is the whole month, six days to a row;
// a stronger patch is more of that thing. Picking a patch opens that day.
interface BlanketSection {
  key: string;
  label: string;
  note: string;
  color: string;
  pattern: Pattern;
  max: number;
  value: (day: DaySummary) => number | null; // null: nothing recorded that day
  describe: (value: number) => string;
}

const SECTIONS: BlanketSection[] = [
  { key: 'mood', label: 'Mood', note: 'From your reflection', color: '#f59e0b', pattern: 'plain', max: 5,
    value: (d) => d.ratings?.mood ?? null, describe: (v) => `mood ${v} of 5` },
  { key: 'energy', label: 'Energy', note: 'From your reflection', color: '#10b981', pattern: 'stripes', max: 5,
    value: (d) => d.ratings?.energy ?? null, describe: (v) => `energy ${v} of 5` },
  { key: 'sleep', label: 'Sleep', note: 'How rested you felt', color: '#6366f1', pattern: 'waves', max: 5,
    value: (d) => d.ratings?.sleep ?? null, describe: (v) => `rested ${v} of 5` },
  { key: 'classes', label: 'Classes', note: 'Hours in class', color: '#3b82f6', pattern: 'checks', max: 6,
    value: (d) => Math.round((d.classMinutes / 60) * 10) / 10, describe: (v) => (v ? `${v} h of class` : 'no classes') },
  { key: 'tasks', label: 'Tasks', note: 'Finished that day', color: '#ec4899', pattern: 'dots', max: 5,
    value: (d) => d.finished.length, describe: (v) => (v === 1 ? '1 task finished' : `${v} tasks finished`) },
];

function BlanketPatch({ section, day, future, isToday, delay, onPick }: {
  section: BlanketSection;
  day: DaySummary;
  future: boolean;
  isToday: boolean;
  delay: number;
  onPick: (date: string) => void;
}) {
  const reduceMotion = useReducedMotion();
  const number = Number(day.date.slice(8));
  if (future) {
    return <Box sx={{ aspectRatio: '1', borderRadius: '5px', border: `1.5px dashed ${colors.grey200}` }} aria-hidden />;
  }
  const value = section.value(day);
  const t = value === null ? 0 : Math.min(1, value / section.max);
  const fill = value ? `color-mix(in srgb, ${section.color} ${Math.round(18 + t * 72)}%, var(--ss-surface))` : colors.surfaceMuted;
  const ink = patternCss(section.pattern, withAlpha('#ffffff', 55));
  const label = `${format(parseISO(day.date), 'EEE, MMM d')}: ${value === null ? 'no reflection' : section.describe(value)}`;
  return (
    <Tooltip title={label}>
      <motion.button
        type="button"
        onClick={() => onPick(day.date)}
        aria-label={label}
        initial={reduceMotion ? false : { scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: value === null ? 0.5 : 1 }}
        whileHover={reduceMotion ? undefined : { scale: 1.12, zIndex: 1 }}
        transition={{ type: 'spring', stiffness: 420, damping: 20, delay: reduceMotion ? 0 : delay }}
        style={{
          position: 'relative',
          aspectRatio: '1',
          width: '100%',
          padding: 0,
          border: 0,
          borderRadius: 5,
          cursor: 'pointer',
          background: value && t > 0.3 && ink !== 'none' ? `${ink}, ${fill}` : fill,
          outline: isToday ? '2px solid var(--ss-accent600)' : undefined,
          outlineOffset: 1,
        }}
      >
        <Box
          component="span"
          aria-hidden
          sx={{
            position: 'absolute',
            top: 2,
            left: 3,
            fontSize: 9,
            fontWeight: 700,
            lineHeight: 1,
            color: t > 0.55 ? 'rgba(255,255,255,0.9)' : colors.textSecondary,
          }}
        >
          {number}
        </Box>
      </motion.button>
    </Tooltip>
  );
}

// How strongly a day shows in a section: null when nothing was recorded, else 0..1.
function strength(section: BlanketSection, day: DaySummary) {
  const value = section.value(day);
  return value === null ? null : Math.min(1, value / section.max);
}

function fillFor(section: BlanketSection, t: number | null) {
  return t ? `color-mix(in srgb, ${section.color} ${Math.round(18 + t * 72)}%, var(--ss-surface))` : colors.surfaceMuted;
}

// One section as a small panel: the month at a glance, no numbers. Clicking it opens the larger view.
function MiniPanel({ section, days, today, index, onOpen }: {
  section: BlanketSection;
  days: DaySummary[];
  today: string;
  index: number;
  onOpen: () => void;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 24, delay: reduceMotion ? 0 : index * 0.06 }}
      style={{ minWidth: 0 }}
    >
      <ButtonBase
        onClick={onOpen}
        aria-label={`${section.label}: open a larger view`}
        sx={{
          width: '100%',
          display: 'block',
          p: { xs: 0.5, sm: 0.75 },
          borderRadius: '10px',
          backgroundColor: colors.surface,
          transition: 'transform 0.15s ease, box-shadow 0.15s ease',
          '&:hover': { transform: 'translateY(-2px)', boxShadow: colors.shadow },
          '&:focus-visible': { outline: `2px solid ${colors.accent600}`, outlineOffset: 2 },
        }}
      >
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: '2px' }}>
          {days.map((day) => {
            const future = day.date > today;
            const t = future ? null : strength(section, day);
            return (
              <Box
                key={day.date}
                sx={{
                  aspectRatio: '1',
                  borderRadius: '2px',
                  backgroundColor: future ? 'transparent' : fillFor(section, t),
                  opacity: future ? 1 : t === null ? 0.6 : 1,
                  boxShadow: day.date === today ? `inset 0 0 0 1.5px ${colors.accent600}` : future ? `inset 0 0 0 1px ${colors.grey200}` : 'none',
                }}
              />
            );
          })}
        </Box>
      </ButtonBase>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5, mt: 0.75 }}>
        <Box sx={{ width: 7, height: 7, borderRadius: '2px', backgroundColor: section.color, flexShrink: 0 }} />
        <Typography noWrap sx={{ fontSize: { xs: 10, sm: 12 }, fontWeight: 600, color: colors.accent800 }}>
          {section.label}
        </Typography>
      </Box>
    </motion.div>
  );
}

export function MonthBlanket({ today, version, onPick }: { today: string; version: number; onPick: (date: string) => void }) {
  const [month, setMonth] = useState(today.slice(0, 7));
  const [open, setOpen] = useState<number | null>(null);
  const dates = useMemo(() => monthDates(month), [month]);
  const data = useDays(dates, version);
  const days = data?.days ?? [];
  const thisMonth = today.slice(0, 7);
  const monthName = format(parseISO(`${month}-01`), 'MMMM yyyy');
  const step = (n: number) => setMonth((m) => format(addMonths(parseISO(`${m}-01`), n), 'yyyy-MM'));
  const section = open === null ? null : SECTIONS[open];

  return (
    <Card>
      <CardContent sx={{ p: { xs: 2.5, sm: 3 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h6" component="h2">
              {monthName}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Your month as a blanket. Stronger colour means more of it that day.
            </Typography>
          </Box>
          <IconButton aria-label="Previous month" onClick={() => step(-1)} sx={{ border: `1px solid ${colors.grey200}`, borderRadius: '12px' }}>
            <ChevronLeft />
          </IconButton>
          <IconButton
            aria-label="Next month"
            onClick={() => step(1)}
            disabled={month >= thisMonth}
            sx={{ border: `1px solid ${colors.grey200}`, borderRadius: '12px' }}
          >
            <ChevronRight />
          </IconButton>
        </Box>

        <Box
          key={month}
          sx={{
            p: { xs: 0.75, sm: 1.25 },
            borderRadius: '14px',
            backgroundColor: colors.accent100,
            display: 'grid',
            gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
            gap: { xs: 0.75, sm: 1.25 },
          }}
        >
          {SECTIONS.map((s, i) => (
            <MiniPanel key={s.key} section={s} days={days} today={today} index={i} onOpen={() => setOpen(i)} />
          ))}
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.25 }}>
          Click a panel to see it larger.
        </Typography>
      </CardContent>

      <Dialog open={section !== null} onClose={() => setOpen(null)} fullWidth maxWidth="xs">
        {section && (
          <>
            <DialogTitle sx={{ pb: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{ width: 12, height: 12, borderRadius: '3px', backgroundColor: section.color }} />
                <Box component="span" sx={{ flex: 1 }}>
                  {section.label}
                </Box>
                <IconButton aria-label="Close" onClick={() => setOpen(null)} size="small">
                  <Close fontSize="small" />
                </IconButton>
              </Box>
              <Typography variant="body2" color="text.secondary">
                {monthName} · {section.note}
              </Typography>
            </DialogTitle>
            <DialogContent>
              <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mb: 2 }}>
                {SECTIONS.map((s, i) => (
                  <Chip
                    key={s.key}
                    label={s.label}
                    size="small"
                    onClick={() => setOpen(i)}
                    variant={i === open ? 'filled' : 'outlined'}
                    sx={i === open ? { backgroundColor: colors.accent100, color: colors.accent800 } : undefined}
                  />
                ))}
              </Box>
              <Box key={section.key} sx={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 0.75 }}>
                {days.map((day, i) => (
                  <BlanketPatch
                    key={day.date}
                    section={section}
                    day={day}
                    future={day.date > today}
                    isToday={day.date === today}
                    delay={i * 0.01}
                    onPick={(date) => {
                      setOpen(null);
                      onPick(date);
                    }}
                  />
                ))}
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2 }}>
                <Typography variant="caption" color="text.secondary">
                  Less
                </Typography>
                <Box
                  sx={{
                    flex: 1,
                    maxWidth: 140,
                    height: 8,
                    borderRadius: '4px',
                    background: `linear-gradient(90deg, ${fillFor(section, 0.05)}, ${fillFor(section, 1)})`,
                  }}
                />
                <Typography variant="caption" color="text.secondary">
                  More
                </Typography>
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                {section.key === 'classes' || section.key === 'tasks'
                  ? 'Click a day to open it.'
                  : 'Faded days have no reflection. Click a day to open it.'}
              </Typography>
            </DialogContent>
          </>
        )}
      </Dialog>
    </Card>
  );
}
