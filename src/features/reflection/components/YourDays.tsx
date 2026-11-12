import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Card, CardContent, IconButton, Tooltip, Typography } from '@mui/material';
import { ChevronLeft, ChevronRight } from '@mui/icons-material';
import { AnimatePresence, motion, stagger, useAnimate, useReducedMotion } from 'motion/react';
import { addMonths, format, parseISO } from 'date-fns';
import { apiGet } from '../../../app/lib/api';
import { toMinutes } from '../../../app/lib/planner';
import type { Task } from '../../../app/lib/tasks';
import { CATEGORY_LABELS, categoryColor, colors, withAlpha } from '../../../app/theme';
import { emitJuice } from '../../../shared/juice/events';
import { playChime } from '../../../shared/juice/sound';
import type { ReflectionRow } from '../lib/insights';
import { monthDates, moodColor, summarizeDay, type DaySummary, type Pattern } from '../lib/days';
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

// One day's patch: colour from how it felt, pattern from what filled it, little stitches for finished tasks.
function Patch({ day, size }: { day: DaySummary; size?: number }) {
  const base = moodColor(day.ratings);
  const energy = day.ratings?.energy ?? 2;
  const ink = day.mainType ? withAlpha(categoryColor(day.mainType), 30 + energy * 9) : 'transparent';
  return (
    <Box
      sx={{
        position: 'relative',
        width: size ?? '100%',
        height: size ?? '100%',
        borderRadius: '6px',
        background: `${patternCss(day.pattern, ink) === 'none' ? '' : patternCss(day.pattern, ink) + ', '}${base ?? colors.surfaceMuted}`,
        opacity: base ? 1 : 0.55,
        // Stitching just inside the edge.
        '&::after': {
          content: '""',
          position: 'absolute',
          inset: size ? 2 : 3,
          borderRadius: '4px',
          border: `1.5px dashed ${base ? 'rgba(255,255,255,0.75)' : colors.grey200}`,
          pointerEvents: 'none',
        },
      }}
    >
      {!size && day.finished.length > 0 && (
        <Box
          aria-hidden
          sx={{ position: 'absolute', right: 6, bottom: 3, fontSize: 10, fontWeight: 700, letterSpacing: '1px', color: 'rgba(0,0,0,0.45)' }}
        >
          {'×'.repeat(Math.min(3, day.finished.length))}
        </Box>
      )}
    </Box>
  );
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

export function MonthBlanket({ today, version, onPick }: { today: string; version: number; onPick: (date: string) => void }) {
  const [month, setMonth] = useState(today.slice(0, 7));
  const dates = useMemo(() => monthDates(month), [month]);
  const data = useDays(dates, version);
  const days = data?.days ?? [];
  const thisMonth = today.slice(0, 7);
  const step = (n: number) => setMonth((m) => format(addMonths(parseISO(`${m}-01`), n), 'yyyy-MM'));

  return (
    <Card>
      <CardContent sx={{ p: { xs: 2.5, sm: 3 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h6" component="h2">
              {format(parseISO(`${month}-01`), 'MMMM yyyy')}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Your month as a blanket. A stronger patch means more of it that day.
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
          sx={{
            p: { xs: 1, sm: 1.5 },
            borderRadius: '16px',
            backgroundColor: colors.accent100,
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: { xs: 1, sm: 1.5 },
          }}
        >
          {SECTIONS.map((section, s) => (
            <Box
              key={`${section.key}-${month}`}
              component="section"
              aria-label={`${section.label}, ${format(parseISO(`${month}-01`), 'MMMM')}`}
              sx={{
                flex: { xs: '1 1 100%', sm: '0 1 calc(50% - 6px)' },
                minWidth: 0,
                p: 1.25,
                borderRadius: '12px',
                backgroundColor: colors.surface,
                // Stitched seams between the panels.
                outline: `1.5px dashed ${colors.accent200}`,
                outlineOffset: -5,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, px: 0.5, mb: 1 }}>
                <Box sx={{ width: 10, height: 10, borderRadius: '3px', backgroundColor: section.color, alignSelf: 'center' }} />
                <Typography sx={{ fontWeight: 700, fontSize: 14 }}>{section.label}</Typography>
                <Typography variant="caption" color="text.secondary" noWrap>
                  {section.note}
                </Typography>
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 0.5, p: 0.5 }}>
                {days.map((day, i) => (
                  <BlanketPatch
                    key={day.date}
                    section={section}
                    day={day}
                    future={day.date > today}
                    isToday={day.date === today}
                    delay={s * 0.08 + i * 0.008}
                    onPick={onPick}
                  />
                ))}
              </Box>
            </Box>
          ))}
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
          Faded patches are days without a reflection. Six days to a row, starting on the 1st.
        </Typography>
      </CardContent>
    </Card>
  );
}

const RATING_KEYS = [
  ['mood', 'Mood'],
  ['energy', 'Energy'],
  ['productivity', 'Productivity'],
  ['sleep', 'Sleep'],
] as const;

// A day folded into a card: its blocks as a strip from 6 AM to midnight, the ratings, and what got finished.
function DayCard({ day }: { day: DaySummary }) {
  const from = 6 * 60;
  const span = 24 * 60 - from;
  return (
    <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Patch day={day} size={28} />
        <Typography sx={{ fontWeight: 700, flex: 1 }}>{format(parseISO(day.date), 'EEEE, MMMM d')}</Typography>
      </Box>
      <Box
        role="img"
        aria-label={day.blocks.length ? day.blocks.map((b) => `${b.task?.title ?? b.activity} at ${b.start_time}`).join(', ') : 'Nothing planned'}
        sx={{ position: 'relative', height: 12, borderRadius: '6px', backgroundColor: colors.surfaceMuted, overflow: 'hidden' }}
      >
        {day.blocks.map((b) => {
          const start = Math.max(from, toMinutes(b.start_time));
          const end = Math.max(start, toMinutes(b.end_time));
          return (
            <Box
              key={b.id}
              sx={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: `${((start - from) / span) * 100}%`,
                width: `${((end - start) / span) * 100}%`,
                backgroundColor: categoryColor(b.type),
                borderRight: `1px solid ${colors.surface}`,
              }}
            />
          );
        })}
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.75 }}>
        {RATING_KEYS.map(([key, label]) => (
          <Box key={key} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="caption" color="text.secondary" sx={{ width: 76 }}>
              {label}
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.4 }} aria-label={`${label} ${day.ratings?.[key] ?? 0} of 5`} role="img">
              {[1, 2, 3, 4, 5].map((n) => (
                <Box
                  key={n}
                  sx={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    backgroundColor: n <= (day.ratings?.[key] ?? 0) ? colors.accent400 : colors.grey200,
                  }}
                />
              ))}
            </Box>
          </Box>
        ))}
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ minHeight: 20 }} noWrap>
        {day.finished.length
          ? `Finished: ${day.finished.slice(0, 2).join(', ')}${day.finished.length > 2 ? ` and ${day.finished.length - 2} more` : ''}`
          : day.mainType
            ? `Mostly ${CATEGORY_LABELS[day.mainType].toLowerCase()}`
            : ' '}
      </Typography>
    </Box>
  );
}

// Flipping back slides the top card off to the side; a newly filed day drops in from above.
const CARD_MOTION = {
  enter: (d: number) => (d < 0 ? { y: -60, scale: 0.92, opacity: 0, rotate: -3 } : { x: 40, opacity: 0, rotate: 3 }),
  center: { x: 0, y: 0, scale: 1, opacity: 1, rotate: 0 },
  exit: (d: number) => (d > 0 ? { x: -60, y: 10, opacity: 0, rotate: -6 } : { y: 40, opacity: 0, scale: 0.95 }),
};

// The stack of days you've reflected on, newest on top, to flip back through. After the evening check-in is
// saved, that day's blocks fold up into a card and drop onto the stack.
export function DayStack({ days, filed, dataVersion }: { days: DaySummary[]; filed: { date: string; version: number } | null; dataVersion: number }) {
  const reflected = useMemo(() => days.filter((d) => d.ratings).reverse(), [days]); // newest first
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [folding, setFolding] = useState<DaySummary | null>(null);
  const [drops, setDrops] = useState(0); // bumped when a day is filed, so its card drops in even if it was on top
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const reduceMotion = useReducedMotion();
  const handled = useRef(0);

  // Once the data from after the save is in, fold that day up and file it.
  useEffect(() => {
    if (!filed || filed.version <= handled.current || dataVersion < filed.version) return;
    handled.current = filed.version;
    const day = reflected.find((d) => d.date === filed.date);
    if (!day) return;
    if (reduceMotion) {
      setIndex(reflected.indexOf(day));
      emitJuice('day-filed');
      return;
    }
    setFolding(day);
  }, [filed, dataVersion, reflected, reduceMotion]);

  useEffect(() => {
    if (!folding || !scope.current) return;
    let cancelled = false;
    (async () => {
      await animate('.fold-bar', { opacity: [0, 1], x: [-12, 0] }, { delay: stagger(0.05), duration: 0.25 });
      await new Promise((r) => setTimeout(r, 350));
      await animate('.fold-bar', { rotateX: 90, scaleY: 0.3, opacity: 0 }, { delay: stagger(0.04, { from: 'last' }), duration: 0.22 });
      await animate(scope.current, { height: 0, opacity: 0 }, { duration: 0.2 });
      if (cancelled) return;
      setDirection(-1);
      setIndex(reflected.findIndex((d) => d.date === folding.date));
      setDrops((n) => n + 1);
      setFolding(null);
      playChime();
      emitJuice('day-filed');
    })();
    return () => {
      cancelled = true;
    };
  }, [folding]);

  if (reflected.length === 0 && !folding) {
    return (
      <Card>
        <CardContent sx={{ p: { xs: 2.5, sm: 3 } }}>
          <Typography variant="h6" component="h2">
            Past days
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Each day you reflect on is folded into a card and kept here, so you can flip back through them.
          </Typography>
        </CardContent>
      </Card>
    );
  }

  const current = reflected[Math.min(index, reflected.length - 1)];
  const go = (step: number) => {
    setDirection(step);
    setIndex((i) => Math.max(0, Math.min(reflected.length - 1, i + step)));
  };

  return (
    <Card sx={{ overflow: 'visible' }}>
      <CardContent sx={{ p: { xs: 2.5, sm: 3 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h6" component="h2">
              Past days
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Each day you reflect on, folded into a card.
            </Typography>
          </Box>
          <IconButton aria-label="Later day" onClick={() => go(-1)} disabled={index <= 0} sx={{ border: `1px solid ${colors.grey200}`, borderRadius: '12px' }}>
            <ChevronLeft />
          </IconButton>
          <IconButton
            aria-label="Earlier day"
            onClick={() => go(1)}
            disabled={index >= reflected.length - 1}
            sx={{ border: `1px solid ${colors.grey200}`, borderRadius: '12px' }}
          >
            <ChevronRight />
          </IconButton>
        </Box>

        {folding && (
          <Box ref={scope} sx={{ perspective: 600, mb: 2, overflow: 'hidden' }} aria-hidden>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
              Folding up {format(parseISO(folding.date), 'EEEE')}…
            </Typography>
            {(folding.blocks.length ? folding.blocks : [null]).map((b, i) => (
              <Box
                key={b?.id ?? i}
                className="fold-bar"
                sx={{
                  opacity: 0,
                  transformOrigin: '50% 0%',
                  mb: 0.5,
                  px: 1.25,
                  py: 0.5,
                  borderRadius: '6px',
                  fontSize: 12,
                  fontWeight: 600,
                  borderLeft: `4px solid ${b ? categoryColor(b.type) : colors.grey200}`,
                  backgroundColor: b ? withAlpha(categoryColor(b.type), 14) : colors.surfaceMuted,
                }}
              >
                {b ? `${b.start_time.slice(0, 5)}  ${b.task?.title ?? b.activity}` : 'A quiet day'}
              </Box>
            ))}
          </Box>
        )}

        {current && (
          <Box sx={{ position: 'relative', pb: `${Math.min(2, reflected.length - 1 - index) * 8}px` }}>
            {/* The cards underneath, peeking out. */}
            {[2, 1].map((depth) =>
              index + depth < reflected.length ? (
                <Box
                  key={depth}
                  aria-hidden
                  sx={{
                    position: 'absolute',
                    inset: 0,
                    top: depth * 8,
                    bottom: -depth * 0,
                    mx: depth * 1.25,
                    borderRadius: '14px',
                    border: `1px solid ${colors.grey200}`,
                    backgroundColor: colors.surface,
                    boxShadow: colors.shadow,
                    transform: `rotate(${depth % 2 ? 1.2 : -1.2}deg)`,
                  }}
                />
              ) : null,
            )}
            <AnimatePresence mode="popLayout" initial={false} custom={direction}>
              <motion.div
                key={`${current.date}-${drops}`}
                custom={direction}
                variants={CARD_MOTION}
                initial={reduceMotion ? false : 'enter'}
                animate="center"
                exit={reduceMotion ? undefined : 'exit'}
                transition={{ type: 'spring', stiffness: 380, damping: 26 }}
                style={{ position: 'relative' }}
              >
                <Box sx={{ borderRadius: '14px', border: `1px solid ${colors.grey200}`, backgroundColor: colors.surface, boxShadow: colors.shadow }}>
                  <DayCard day={current} />
                </Box>
              </motion.div>
            </AnimatePresence>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
