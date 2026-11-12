import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Box, Button, Card, CardContent, Tooltip, Typography } from '@mui/material';
import { format, subDays, parseISO } from 'date-fns';
import { Link } from 'react-router';
import { apiGet } from '../../../app/lib/api';
import { useProfile } from '../../../app/lib/ProfileContext';
import { FOCUS_TIMES, WORK_SESSIONS, formatWakeTime, labelFor } from '../../../app/lib/survey';
import type { Task } from '../../../app/lib/tasks';
import type { TimeBlock } from '../../../app/lib/planner';
import { colors } from '../../../app/theme';
import { EmptyState, ListSkeleton } from '../../../shared/components/States';
import {
  LOOKBACK_DAYS,
  averageRatings,
  sleepPerNight,
  taskTimes,
  typicalWeek,
  type ReflectionRow,
} from '../lib/insights';

const RATING_LABELS: Record<string, string> = { productivity: 'Productivity', mood: 'Mood', energy: 'Energy', sleep: 'Sleep' };
const TASK_TYPE_LABELS: Record<Task['type'], string> = {
  homework: 'Homework',
  exam: 'Exam prep',
  project: 'Projects',
  work: 'Work tasks',
  study: 'Study',
};

function duration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} min`;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <Box component="section" sx={{ pt: 2.5, borderTop: `1px solid ${colors.grey200}` }}>
      <Typography sx={{ fontWeight: 700 }}>{title}</Typography>
      {note && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          {note}
        </Typography>
      )}
      {children}
    </Box>
  );
}

// Everything the app has worked out about how someone's weeks go, from their planner, finished tasks,
// reflections and survey: the same things plans are built from.
export function ReflectionInsights({ today, version }: { today: string; version: number }) {
  const { profile } = useProfile();
  const survey = profile?.survey;
  const [data, setData] = useState<{ tasks: Task[]; blocks: TimeBlock[]; reflections: ReflectionRow[] } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const start = format(subDays(parseISO(today), LOOKBACK_DAYS - 1), 'yyyy-MM-dd');
    setFailed(false);
    Promise.all([
      apiGet('/api/tasks'),
      apiGet(`/api/time-blocks?start=${start}&end=${today}`),
      apiGet(`/api/reflections?start=${start}&end=${today}`),
    ])
      .then(([tasks, blocks, reflections]) => !cancelled && setData({ tasks, blocks, reflections }))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [today, version]);

  const week = useMemo(() => (data ? typicalWeek(data.blocks, today) : null), [data, today]);
  const sleep = useMemo(() => (data ? sleepPerNight(data.reflections, survey) : null), [data, survey]);
  const times = useMemo(() => (data ? taskTimes(data.tasks) : []), [data]);
  const ratings = useMemo(() => (data ? averageRatings(data.reflections, Object.keys(RATING_LABELS)) : []), [data]);

  const weekRows = week?.rows ?? [];
  const maxHours = Math.max(1, ...weekRows.map((r) => r.hours));

  return (
    <Card component="section" aria-labelledby="insights-title">
      <CardContent sx={{ p: { xs: 2.5, sm: 3 }, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
        <Box>
          <Typography variant="h6" component="h2" id="insights-title">
            What SmartSched knows about you
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Worked out from the last four weeks of your planner, your finished tasks, your reflections and your survey.
            Plans are built from the same things.
          </Typography>
        </Box>

        {failed ? (
          <EmptyState title="Couldn't load this right now" body="Check your connection and reload the page." />
        ) : !data ? (
          <ListSkeleton rows={4} height={36} />
        ) : (
          <>
            <Section
              title="A typical week"
              note={
                week && week.weeks > 0
                  ? `Hours a week, averaged over ${week.weeks === 1 ? 'the one week' : `the ${week.weeks} weeks`} with anything planned.`
                  : undefined
              }
            >
              {week && week.weeks > 0 ? (
                <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: 'minmax(120px, auto) 1fr auto', columnGap: 1.5, rowGap: 1, alignItems: 'center' }}>
                  {weekRows.map((row) => (
                    <Box key={row.key} sx={{ display: 'contents' }}>
                      <Typography component="dt" variant="body2" sx={{ fontWeight: 600 }}>
                        {row.label}
                      </Typography>
                      <Tooltip title={`${row.label}: about ${row.hours} hours a week`} placement="top" disableInteractive>
                        <Box aria-hidden sx={{ height: 12, py: 0.5, boxSizing: 'content-box', cursor: 'default' }}>
                          <Box
                            sx={{
                              height: 12,
                              width: `${(row.hours / maxHours) * 100}%`,
                              minWidth: row.hours > 0 ? 4 : 0,
                              backgroundColor: colors.accent400,
                              borderRadius: '0 4px 4px 0',
                              transition: 'width 0.4s ease',
                            }}
                          />
                        </Box>
                      </Tooltip>
                      <Typography component="dd" variant="body2" sx={{ m: 0, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'text.secondary' }}>
                        {row.hours} h
                      </Typography>
                    </Box>
                  ))}
                </Box>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  Nothing planned in the last four weeks yet. Once your planner has a week or two in it, this fills in.
                </Typography>
              )}
            </Section>

            <Section
              title="Sleep"
              note={
                sleep
                  ? sleep.source === 'reflections'
                    ? `Average of the ${sleep.nights} nights you logged bed and wake-up times for.`
                    : 'What your survey plans for. Log bed and wake-up times when you reflect to see what you actually get.'
                  : undefined
              }
            >
              {sleep ? (
                <Typography sx={{ fontSize: 24, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                  {sleep.hours} h{' '}
                  <Box component="span" sx={{ fontSize: 14, fontWeight: 400, color: 'text.secondary' }}>
                    a night
                  </Box>
                </Typography>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  Nothing yet. Add bed and wake-up times when you reflect, or your sleep in the survey.
                </Typography>
              )}
            </Section>

            <Section title="How long tasks take you" note="From the time you entered when checking tasks off.">
              {times.length > 0 ? (
                <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {times.map((row) => (
                    <Box component="li" key={row.type} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {TASK_TYPE_LABELS[row.type]}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        usually {duration(row.averageMinutes)}
                        {row.ratio !== null && `, ${row.ratio}× your estimate`} · {row.count} finished
                      </Typography>
                    </Box>
                  ))}
                </Box>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  Nothing yet. When you check off a task, say how long it took and it shows up here.
                </Typography>
              )}
            </Section>

            <Section
              title="How your days have felt"
              note={
                data.reflections.length
                  ? `Average of ${data.reflections.length} reflection${data.reflections.length === 1 ? '' : 's'} in the last four weeks, out of 5.`
                  : undefined
              }
            >
              {data.reflections.length > 0 ? (
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 1.5 }}>
                  {ratings.map(({ key, average }) => (
                    <Box key={key} sx={{ p: 1.5, borderRadius: '12px', backgroundColor: colors.surfaceMuted }}>
                      <Typography variant="body2" color="text.secondary">
                        {RATING_LABELS[key]}
                      </Typography>
                      <Typography sx={{ fontSize: 24, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                        {average ?? '–'}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  No reflections in the last four weeks yet.
                </Typography>
              )}
            </Section>

            {survey && (
              <Section title="What you told us">
                <Box component="ul" sx={{ m: 0, pl: 2.5, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  {survey.focus_time && (
                    <Typography component="li" variant="body2">
                      You focus best: {labelFor(FOCUS_TIMES, survey.focus_time)}
                    </Typography>
                  )}
                  {survey.work_session && (
                    <Typography component="li" variant="body2">
                      Before a real break: {labelFor(WORK_SESSIONS, survey.work_session)}
                    </Typography>
                  )}
                  {survey.sleep_hours != null && survey.wake_time && (
                    <Typography component="li" variant="body2">
                      Sleep: {survey.sleep_hours} hours, up around {formatWakeTime(survey.wake_time)}
                    </Typography>
                  )}
                </Box>
              </Section>
            )}

            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Button component={Link} to="/profile" size="small">
                Change your survey answers
              </Button>
              <Button component={Link} to="/consent" size="small">
                What's stored and how it's used
              </Button>
            </Box>
          </>
        )}
      </CardContent>
    </Card>
  );
}
