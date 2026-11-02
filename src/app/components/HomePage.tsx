import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Alert, Box, Button, Card, Checkbox, Chip, LinearProgress, Snackbar, Typography } from '@mui/material';
import { NightsStayOutlined, PlaceOutlined, ScheduleOutlined, WarningAmberRounded } from '@mui/icons-material';
import { addDays, differenceInCalendarDays, format, parseISO, startOfWeek, subDays } from 'date-fns';
import { Link } from 'react-router';
import { useAuth } from '../lib/AuthContext';
import { useProfile } from '../lib/ProfileContext';
import { apiGet, apiPatch } from '../lib/api';
import { useToday } from '../lib/today';
import { sortTasks, type Task } from '../lib/tasks';
import { toMinutes, type BlockTask, type TimeBlock } from '../lib/planner';
import { burnoutWarnings } from '../lib/burnout';
import { findOpenSlot, missedTaskBlocks, type Slot } from '../lib/reschedule';
import { readLeftBlocks, saveLeftBlocks } from '../lib/leftBlocks';
import { placeLabel } from '../lib/places';
import { CATEGORY_LABELS, categoryColor, colors } from '../theme';
import { EmptyState, ListSkeleton } from './States';
import { TimeSpentDialog } from './TimeSpentDialog';

// How far around today to look for task blocks that were missed, and for room to move them (as the planner does).
const NEARBY_DAYS = 14;

// "13:10" -> "1:10 PM"
function clock(time: string) {
  const minutes = toMinutes(time);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours % 12 || 12}:${String(mins).padStart(2, '0')} ${hours < 12 ? 'AM' : 'PM'}`;
}

function timeRange(block: Pick<TimeBlock, 'start_time' | 'end_time'>) {
  return `${clock(block.start_time)} – ${clock(block.end_time)}`;
}

function slotText(slot: Pick<Slot, 'date' | 'start_time' | 'end_time'>, today: string) {
  const day = slot.date === today ? 'today' : format(parseISO(slot.date), 'EEE, MMM d');
  return `${day}, ${timeRange(slot)}`;
}

function blockTitle(block: TimeBlock) {
  return block.task?.title ?? block.activity;
}

function minutesLabel(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

// "Due today, 11:59 PM", "Overdue · Mon, Nov 2", "Due Fri, Nov 6". Urgent means overdue or due within a day.
function dueInfo(dueDate: string, now: Date) {
  const due = new Date(dueDate);
  const days = differenceInCalendarDays(due, now);
  const urgent = due.getTime() - now.getTime() < 24 * 60 * 60 * 1000;
  if (due.getTime() < now.getTime()) return { text: `Overdue · ${format(due, 'EEE, MMM d')}`, urgent };
  if (days === 0) return { text: `Due today, ${format(due, 'h:mm a')}`, urgent };
  if (days === 1) return { text: `Due tomorrow, ${format(due, 'h:mm a')}`, urgent };
  return { text: `Due ${format(due, 'EEE, MMM d')}`, urgent };
}

function greeting(hour: number) {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function SectionCard({ title, link, children }: { title: string; link?: { to: string; label: string }; children: ReactNode }) {
  return (
    <Card component="section" sx={{ py: 1 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: { xs: 2, sm: 3 }, pt: 1.5, pb: 1 }}>
        <Typography variant="h6" component="h2">
          {title}
        </Typography>
        {link && (
          <Button component={Link} to={link.to} size="small">
            {link.label}
          </Button>
        )}
      </Box>
      {children}
    </Card>
  );
}

export function HomePage() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const today = useToday();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [weekBlocks, setWeekBlocks] = useState<TimeBlock[]>([]);
  const [nearbyBlocks, setNearbyBlocks] = useState<TimeBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [version, setVersion] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const [leftBlocks, setLeftBlocks] = useState<Set<string>>(readLeftBlocks);
  const [finishingTask, setFinishingTask] = useState<BlockTask | Task | null>(null);
  const [moving, setMoving] = useState(false);
  const [notice, setNotice] = useState<{ text: string; severity: 'success' | 'error' } | null>(null);

  // This week as the planner shows it (Sunday to Saturday), plus the next day for Saturday night.
  const weekDates = useMemo(() => {
    const start = startOfWeek(parseISO(today), { weekStartsOn: 0 });
    return Array.from({ length: 7 }, (_, i) => format(addDays(start, i), 'yyyy-MM-dd'));
  }, [today]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const weekEnd = format(addDays(parseISO(weekDates[6]), 1), 'yyyy-MM-dd');
    const nearStart = format(subDays(parseISO(today), NEARBY_DAYS), 'yyyy-MM-dd');
    const nearEnd = format(addDays(parseISO(today), NEARBY_DAYS), 'yyyy-MM-dd');
    setLoadError(false);
    Promise.all([
      apiGet('/api/tasks'),
      apiGet(`/api/time-blocks?start=${weekDates[0]}&end=${weekEnd}`),
      apiGet(`/api/time-blocks?start=${nearStart}&end=${nearEnd}`),
    ])
      .then(([taskData, weekData, nearbyData]) => {
        if (cancelled) return;
        setTasks(taskData);
        setWeekBlocks(weekData);
        setNearbyBlocks(nearbyData);
      })
      .catch(() => !cancelled && setLoadError(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [user, today, weekDates, version]);

  // The "now" card and the missed-block notice follow the clock while the page is open.
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const todayBlocks = useMemo(
    () =>
      weekBlocks
        .filter((b) => b.date === today)
        .sort((a, b) => toMinutes(a.start_time) - toMinutes(b.start_time)),
    [weekBlocks, today],
  );
  const current = todayBlocks.find((b) => toMinutes(b.start_time) <= nowMinutes && nowMinutes < toMinutes(b.end_time));
  const next = todayBlocks.find((b) => toMinutes(b.start_time) > nowMinutes);
  // A task block is done when its task is checked off; anything else once its time has passed.
  const isDone = (b: TimeBlock) => (b.type === 'task' ? Boolean(b.task?.completed) : toMinutes(b.end_time) <= nowMinutes);
  const doneCount = todayBlocks.filter(isDone).length;

  const missed = useMemo(() => {
    const block = missedTaskBlocks(nearbyBlocks, now).find((b) => !leftBlocks.has(b.id));
    if (!block) return null;
    const slot = findOpenSlot(block, nearbyBlocks, now, block.task?.due_date ? new Date(block.task.due_date) : null);
    return { block, slot };
  }, [nearbyBlocks, now, leftBlocks]);

  const dueSoon = useMemo(() => sortTasks(tasks).filter((t) => !t.completed).slice(0, 5), [tasks]);

  const warnings = useMemo(() => burnoutWarnings(weekBlocks, tasks, weekDates), [weekBlocks, tasks, weekDates]);
  const heavyDates = new Set(warnings.map((w) => w.date));
  const weekHours = weekDates.map((date) => {
    const minutes = weekBlocks
      .filter((b) => b.date === date)
      .reduce((sum, b) => sum + toMinutes(b.end_time) - toMinutes(b.start_time), 0);
    return { date, hours: Math.round((minutes / 60) * 10) / 10 };
  });
  const maxHours = Math.max(8, ...weekHours.map((d) => d.hours));

  // Every place a task shows up here (the list and its blocks) follows its latest state.
  const applyTask = (updated: Task) => {
    setTasks((list) => list.map((t) => (t.id === updated.id ? updated : t)));
    const refresh = (blocks: TimeBlock[]) =>
      blocks.map((b) => (b.task_id === updated.id && b.task ? { ...b, task: { ...b.task, ...updated } } : b));
    setWeekBlocks(refresh);
    setNearbyBlocks(refresh);
  };

  const updateTask = async (taskId: string, changes: { completed: boolean; time_spent?: number }) => {
    try {
      applyTask(await apiPatch(`/api/tasks/${taskId}`, changes));
    } catch {
      setNotice({ severity: 'error', text: "Couldn't update the task. Try again." });
    }
  };

  // Checking a task off asks how long it took first; unchecking reopens it.
  const toggleTask = (task: BlockTask | Task) => {
    if (task.completed) updateTask(task.id, { completed: false });
    else setFinishingTask(task);
  };

  const finishTask = async (minutes: number | null) => {
    if (!finishingTask) return;
    const taskId = finishingTask.id;
    setFinishingTask(null);
    await updateTask(taskId, minutes === null ? { completed: true } : { completed: true, time_spent: minutes });
  };

  const moveMissed = async () => {
    if (!missed?.slot) return;
    setMoving(true);
    try {
      const { block: moved }: { block: TimeBlock } = await apiPatch(`/api/time-blocks/${missed.block.id}`, missed.slot);
      setNotice({ severity: 'success', text: `Moved “${blockTitle(moved)}” to ${slotText(moved, today)}.` });
      setVersion((v) => v + 1);
    } catch {
      setNotice({ severity: 'error', text: "Couldn't move the block. Try again." });
    } finally {
      setMoving(false);
    }
  };

  const leaveMissed = () => {
    if (!missed) return;
    const next = new Set(leftBlocks).add(missed.block.id);
    setLeftBlocks(next);
    saveLeftBlocks(next);
  };

  const displayName = profile?.name?.trim().split(/\s+/)[0];
  const featured = current ?? next;

  return (
    <Box sx={{ maxWidth: 1240, mx: 'auto', display: 'flex', flexDirection: 'column', gap: { xs: 2.5, sm: 3.5 } }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 3, flexWrap: 'wrap' }}>
        <Box>
          <Typography
            variant="h3"
            component="h1"
            sx={{ color: colors.violet500, fontSize: { xs: '1.75rem', sm: '3rem' }, mb: 0.5 }}
          >
            {greeting(now.getHours())}
            {displayName ? `, ${displayName}` : ''}
          </Typography>
          <Typography variant="h6" component="p" sx={{ color: 'text.secondary', fontWeight: 400, fontSize: { xs: '1rem', sm: '1.25rem' } }}>
            {format(parseISO(today), 'EEEE, MMMM d')}
          </Typography>
        </Box>
        {todayBlocks.length > 0 && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.75, mb: { sm: 1 } }}>
            <LinearProgress
              variant="determinate"
              value={(doneCount / todayBlocks.length) * 100}
              aria-label="Today's blocks done"
              sx={{
                width: 180,
                height: 10,
                borderRadius: '10px',
                backgroundColor: colors.violet100,
                '& .MuiLinearProgress-bar': { backgroundColor: colors.violet400, borderRadius: '10px' },
              }}
            />
            <Typography variant="body2" sx={{ fontWeight: 600, color: colors.violet800, whiteSpace: 'nowrap' }}>
              {doneCount} of {todayBlocks.length} blocks done today
            </Typography>
          </Box>
        )}
      </Box>

      {missed && (
        <Alert
          severity="info"
          icon={<ScheduleOutlined />}
          sx={{ alignItems: 'center', '& .MuiAlert-action': { pt: 0 } }}
          action={
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <Button color="inherit" size="small" onClick={leaveMissed} disabled={moving}>
                Leave it
              </Button>
              {missed.slot ? (
                <Button variant="contained" size="small" onClick={moveMissed} disabled={moving}>
                  {moving ? 'Moving…' : 'Move it'}
                </Button>
              ) : (
                <Button variant="contained" size="small" component={Link} to="/planner">
                  Open planner
                </Button>
              )}
            </Box>
          }
        >
          <strong>{blockTitle(missed.block)}</strong> was planned for {slotText(missed.block, today)} and isn't checked
          off.{' '}
          {missed.slot ? (
            <>
              The next open time is <strong>{slotText(missed.slot, today)}</strong>.
            </>
          ) : (
            'There is no open slot for it before it’s due.'
          )}
        </Alert>
      )}

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: { xs: 2.5, sm: 3.5 }, alignItems: 'flex-start' }}>
        <Box sx={{ flex: '999 1 560px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: { xs: 2.5, sm: 3.5 } }}>
          {featured && (
            <Box component="section" sx={{ p: { xs: 2.25, sm: 3 }, backgroundColor: colors.violet100, borderRadius: '24px' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                <Box sx={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: current ? colors.success : colors.violet400 }} />
                <Typography
                  sx={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: colors.violet800 }}
                >
                  {current ? 'Happening now' : 'Up next'}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 2, flexWrap: 'wrap' }}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography component="h2" sx={{ fontSize: { xs: 20, sm: 26 }, fontWeight: 700, color: colors.violet800, mb: 0.5 }}>
                    {blockTitle(featured)}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 2.25, flexWrap: 'wrap', color: 'text.secondary', fontSize: 14 }}>
                    <span>{timeRange(featured)}</span>
                    {featured.location && (
                      <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                        <PlaceOutlined sx={{ fontSize: 16 }} aria-hidden />
                        {placeLabel(featured.location)}
                      </Box>
                    )}
                  </Box>
                </Box>
                {current && next && (
                  <Box sx={{ textAlign: { sm: 'right' } }}>
                    <Typography variant="body2" color="text.secondary">
                      Then
                    </Typography>
                    <Typography sx={{ fontWeight: 600 }}>
                      {blockTitle(next)} · {clock(next.start_time)}
                    </Typography>
                  </Box>
                )}
              </Box>
              {current ? (
                <>
                  <LinearProgress
                    variant="determinate"
                    aria-label="Time through this block"
                    value={
                      ((nowMinutes - toMinutes(current.start_time)) /
                        (toMinutes(current.end_time) - toMinutes(current.start_time))) *
                      100
                    }
                    sx={{
                      mt: 2.5,
                      height: 10,
                      borderRadius: '10px',
                      backgroundColor: colors.surface,
                      '& .MuiLinearProgress-bar': { backgroundColor: colors.violet400, borderRadius: '10px' },
                    }}
                  />
                  <Typography variant="body2" sx={{ mt: 1, color: colors.violet800 }}>
                    {minutesLabel(toMinutes(current.end_time) - nowMinutes)} left
                  </Typography>
                </>
              ) : (
                <Typography variant="body2" sx={{ mt: 1.5, color: colors.violet800 }}>
                  Starts in {minutesLabel(toMinutes(featured.start_time) - nowMinutes)}
                </Typography>
              )}
            </Box>
          )}

          <SectionCard title="Today" link={{ to: '/planner', label: 'Open planner' }}>
            {loading ? (
              <Box sx={{ px: 3, pb: 2 }}>
                <ListSkeleton rows={4} />
              </Box>
            ) : loadError ? (
              <EmptyState
                title="Couldn't load today's schedule"
                body="Check your connection and try again."
                action={<Button variant="outlined" onClick={() => setVersion((v) => v + 1)}>Try again</Button>}
              />
            ) : todayBlocks.length === 0 ? (
              <EmptyState
                title="Nothing planned today"
                body="Add classes, work and study time in the planner."
                action={<Button variant="contained" component={Link} to="/planner">Open planner</Button>}
              />
            ) : (
              <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0 }}>
                {todayBlocks.map((block) => {
                  const color = categoryColor(block.type);
                  const done = isDone(block);
                  const isNow = block === current;
                  const notChecked = block.type === 'task' && !block.task?.completed && toMinutes(block.end_time) <= nowMinutes;
                  const meta = [CATEGORY_LABELS[block.type] ?? block.type, block.location ? placeLabel(block.location) : null]
                    .filter(Boolean)
                    .join(' · ');
                  return (
                    <Box
                      component="li"
                      key={block.id}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: { xs: 1.5, sm: 2 },
                        px: { xs: 2, sm: 3 },
                        py: 1.5,
                        borderTop: `1px solid ${colors.grey200}`,
                      }}
                    >
                      <Typography
                        variant="body2"
                        sx={{ width: { xs: 72, sm: 140 }, flexShrink: 0, fontWeight: 600, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}
                      >
                        {clock(block.start_time)}
                        <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
                          {' – '}
                          {clock(block.end_time)}
                        </Box>
                      </Typography>
                      <Box
                        aria-hidden
                        sx={{
                          width: 4,
                          height: 36,
                          borderRadius: '4px',
                          flexShrink: 0,
                          background: block.auto
                            ? `repeating-linear-gradient(${color} 0 4px, transparent 4px 7px)`
                            : color,
                        }}
                      />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography
                          noWrap
                          sx={{
                            fontWeight: 600,
                            color: done ? colors.grey500 : 'text.primary',
                            textDecoration: done && block.type === 'task' ? 'line-through' : 'none',
                          }}
                        >
                          {blockTitle(block)}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" noWrap>
                          {meta}
                          {block.auto ? ', added for you' : ''}
                        </Typography>
                      </Box>
                      {isNow && <Chip size="small" label="Now" color="primary" />}
                      {notChecked && (
                        <Chip size="small" label="Not checked off" sx={{ backgroundColor: colors.infoBg, color: colors.infoInk }} />
                      )}
                      {block.task && (
                        <Checkbox
                          checked={block.task.completed}
                          onChange={() => toggleTask(block.task!)}
                          slotProps={{ input: { 'aria-label': `${block.task.completed ? 'Reopen' : 'Check off'} ${block.task.title}` } }}
                          sx={{ m: -1 }}
                        />
                      )}
                    </Box>
                  );
                })}
              </Box>
            )}
          </SectionCard>
        </Box>

        <Box component="aside" sx={{ flex: '1 1 340px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: { xs: 2.5, sm: 3.5 } }}>
          <SectionCard title="Due soon" link={{ to: '/schedule', label: 'All tasks' }}>
            {loading ? (
              <Box sx={{ px: 2.5, pb: 2 }}>
                <ListSkeleton rows={3} height={64} />
              </Box>
            ) : dueSoon.length === 0 ? (
              <EmptyState title="No open tasks" action={<Button component={Link} to="/schedule">Add a task</Button>} />
            ) : (
              <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
                {dueSoon.map((task) => {
                  const due = task.due_date ? dueInfo(task.due_date, now) : null;
                  return (
                    <Box
                      component="li"
                      key={task.id}
                      sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', px: 1.5, py: 1, borderTop: `1px solid ${colors.grey200}` }}
                    >
                      <Checkbox
                        checked={false}
                        onChange={() => toggleTask(task)}
                        slotProps={{ input: { 'aria-label': `Complete ${task.title}` } }}
                      />
                      <Box sx={{ flex: 1, minWidth: 0, pt: 1 }}>
                        <Typography sx={{ fontWeight: 600, mb: 0.75 }}>{task.title}</Typography>
                        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                          {due && (
                            <Chip
                              size="small"
                              label={due.text}
                              sx={
                                due.urgent
                                  ? { backgroundColor: colors.warningBg, color: colors.warningInk }
                                  : { backgroundColor: colors.surfaceMuted, color: 'text.secondary' }
                              }
                            />
                          )}
                          <Chip
                            size="small"
                            label={task.type[0].toUpperCase() + task.type.slice(1)}
                            sx={{ backgroundColor: colors.surfaceMuted, color: 'text.secondary' }}
                          />
                          {task.priority === 'high' && <Chip size="small" variant="outlined" color="error" label="High" />}
                        </Box>
                      </Box>
                    </Box>
                  );
                })}
              </Box>
            )}
          </SectionCard>

          <Card component="section" sx={{ p: 2.5 }}>
            <Typography variant="h6" component="h2">
              This week
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Hours planned each day
            </Typography>
            <Box
              sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 1, alignItems: 'end', height: 120 }}
              role="img"
              aria-label={weekHours.map((d) => `${format(parseISO(d.date), 'EEEE')} ${d.hours} hours`).join(', ')}
            >
              {weekHours.map((d) => (
                <Box key={d.date} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 0.75, height: '100%' }}>
                  <Typography sx={{ fontSize: 11, fontWeight: 600, color: 'text.secondary' }}>{d.hours}h</Typography>
                  <Box
                    sx={{
                      width: '100%',
                      maxWidth: 28,
                      borderRadius: '8px',
                      height: Math.max(4, Math.round((d.hours / maxHours) * 80)),
                      backgroundColor: heavyDates.has(d.date)
                        ? colors.amber500
                        : d.date === today
                          ? colors.violet500
                          : colors.violet200,
                      transition: 'height 0.3s ease',
                    }}
                  />
                </Box>
              ))}
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 1, mt: 1 }} aria-hidden>
              {weekHours.map((d) => (
                <Typography
                  key={d.date}
                  sx={{
                    textAlign: 'center',
                    fontSize: 12,
                    fontWeight: d.date === today ? 700 : 600,
                    color: d.date === today ? colors.violet600 : 'text.secondary',
                  }}
                >
                  {format(parseISO(d.date), 'EEE')}
                </Typography>
              ))}
            </Box>
            {warnings.length > 0 && (
              <Box sx={{ mt: 2.25, p: 1.5, borderRadius: '12px', backgroundColor: colors.warningBg, display: 'flex', gap: 1.25 }}>
                <WarningAmberRounded sx={{ fontSize: 18, color: colors.warningInk, mt: '2px' }} aria-hidden />
                <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  {warnings.map((w) => (
                    <Typography component="li" variant="body2" key={`${w.kind}-${w.date}-${w.message}`} sx={{ color: colors.warningInk }}>
                      {w.message}
                    </Typography>
                  ))}
                </Box>
              </Box>
            )}
          </Card>

          <Card component="section" sx={{ p: 2.5, display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box
              sx={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                backgroundColor: colors.violet100,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <NightsStayOutlined sx={{ color: colors.violet600 }} aria-hidden />
            </Box>
            <Box sx={{ flex: 1 }}>
              <Typography component="h2" sx={{ fontWeight: 600 }}>
                Reflect on today
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Four quick ratings help the planner learn your rhythm.
              </Typography>
            </Box>
            <Button variant="outlined" component={Link} to="/reflection">
              Start
            </Button>
          </Card>
        </Box>
      </Box>

      <TimeSpentDialog task={finishingTask} onFinish={finishTask} onCancel={() => setFinishingTask(null)} />

      <Snackbar
        open={notice !== null}
        autoHideDuration={5000}
        onClose={() => setNotice(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={notice?.severity ?? 'success'} onClose={() => setNotice(null)} sx={{ width: '100%' }}>
          {notice?.text}
        </Alert>
      </Snackbar>
    </Box>
  );
}
