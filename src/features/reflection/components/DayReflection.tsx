import { useEffect, useState, FormEvent } from 'react';
import {
  Box,
  Typography,
  Rating,
  Card,
  CardContent,
  Button,
  IconButton,
  TextField,
  Alert,
  Chip,
  Link as MuiLink,
} from '@mui/material';
import { ChevronLeft, ChevronRight } from '@mui/icons-material';
import { addDays, format, parseISO } from 'date-fns';
import { Link as RouterLink, useSearchParams } from 'react-router';
import { useAuth } from '../../../app/lib/AuthContext';
import { apiGet, apiPost } from '../../../app/lib/api';
import { useSelectedDay } from '../../../app/lib/today';
import { colors } from '../../../app/theme';
import { ListSkeleton } from '../../../shared/components/States';
import { ReflectionInsights } from './ReflectionInsights';
import { MonthBlanket } from './YourDays';
import { emitJuice } from '../../../shared/juice/events';

const CRITERIA = [
  { key: 'productivity', label: 'Productivity', hint: 'How much of what you planned got done' },
  { key: 'mood', label: 'Mood', hint: 'How you felt overall' },
  { key: 'energy', label: 'Energy', hint: 'Physical and mental energy through the day' },
  { key: 'sleep', label: 'Sleep', hint: 'How rested you felt' },
] as const;

type Ratings = Record<(typeof CRITERIA)[number]['key'], number>;

const EMPTY_RATINGS: Ratings = { productivity: 0, mood: 0, energy: 0, sleep: 0 };

// Optional; HH:MM, or '' when not filled in.
type SleepTimes = { bed_time: string; wake_time: string };
const EMPTY_SLEEP: SleepTimes = { bed_time: '', wake_time: '' };

function formatDay(date: string) {
  const day = parseISO(date);
  return format(day, day.getFullYear() === new Date().getFullYear() ? 'EEEE, MMMM d' : 'EEEE, MMMM d, yyyy');
}

export function DayReflection() {
  const { user } = useAuth();
  const { today, selectedDate, setSelectedDate } = useSelectedDay();
  const [ratings, setRatings] = useState<Ratings>(EMPTY_RATINGS);
  const [sleepTimes, setSleepTimes] = useState<SleepTimes>(EMPTY_SLEEP);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // Whether this day already had a reflection when it loaded.
  const [hadReflection, setHadReflection] = useState(false);
  // Bumped after a save so the summary below picks up the new ratings.
  const [insightsVersion, setInsightsVersion] = useState(0);

  // The planner's bedtime check-in links here with ?date=, to open that day.
  const [searchParams] = useSearchParams();
  const linkedDate = searchParams.get('date');
  useEffect(() => {
    if (linkedDate && /^\d{4}-\d{2}-\d{2}$/.test(linkedDate) && linkedDate <= today) setSelectedDate(linkedDate);
  }, [linkedDate]);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSaved(false);
    setHadReflection(false);
    setRatings(EMPTY_RATINGS);
    setSleepTimes(EMPTY_SLEEP);

    apiGet(`/api/reflections/${selectedDate}`)
      .then((existing) => {
        if (!cancelled && existing) {
          setHadReflection(true);
          setRatings({ ...EMPTY_RATINGS, ...existing.ratings });
          setSleepTimes({ bed_time: existing.bed_time?.slice(0, 5) ?? '', wake_time: existing.wake_time?.slice(0, 5) ?? '' });
        }
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [user, selectedDate]);

  const isToday = selectedDate === today;
  const unrated = CRITERIA.filter(({ key }) => !ratings[key]);

  const changeDay = (days: number) => {
    setSelectedDate((current) => format(addDays(parseISO(current), days), 'yyyy-MM-dd'));
  };

  // Typing into the date field can produce a partial or future date; only move to a real day up to today.
  const pickDate = (value: string) => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value) && value <= today) setSelectedDate(value);
  };

  const rate = (key: keyof Ratings, value: number | null) => {
    setRatings({ ...ratings, [key]: value || 0 });
    setSaved(false);
  };

  const setSleepTime = (key: keyof SleepTimes, value: string) => {
    setSleepTimes({ ...sleepTimes, [key]: value });
    setSaved(false);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (unrated.length) return;
    setSubmitting(true);
    setSaved(false);
    setError(null);
    try {
      await apiPost('/api/reflections', { date: selectedDate, ratings, ...sleepTimes });
      setSaved(true);
      emitJuice('day-filed'); // the corner buddy hops
      setInsightsVersion((v) => v + 1);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) {
    return (
      <Typography variant="body2" color="text.secondary">
        <MuiLink component={RouterLink} to="/auth">Log in</MuiLink> to rate your day.
      </Typography>
    );
  }

  return (
    <Box sx={{ maxWidth: 640, mx: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box>
        <Typography variant="h5" component="h1" sx={{ color: colors.accent500 }}>
          Reflect
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Four quick ratings. Over time they help the planner learn which kinds of days work for you.
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <IconButton
          aria-label="Previous day"
          onClick={() => changeDay(-1)}
          sx={{ border: `1px solid ${colors.grey200}`, borderRadius: '12px' }}
        >
          <ChevronLeft />
        </IconButton>
        <IconButton
          aria-label="Next day"
          onClick={() => changeDay(1)}
          disabled={isToday}
          sx={{ border: `1px solid ${colors.grey200}`, borderRadius: '12px' }}
        >
          <ChevronRight />
        </IconButton>
        <Typography variant="h6" component="h2" sx={{ flex: 1, minWidth: 180, ml: 1 }}>
          {isToday ? 'Today' : formatDay(selectedDate)}
          {isToday && (
            <Box component="span" sx={{ color: 'text.secondary', fontWeight: 400 }}>
              {' · '}
              {format(parseISO(selectedDate), 'MMMM d')}
            </Box>
          )}
        </Typography>
        <TextField
          size="small"
          type="date"
          label="Go to date"
          value={selectedDate}
          onChange={(e) => pickDate(e.target.value)}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: today } }}
        />
      </Box>

      <Card>
        <CardContent sx={{ p: { xs: 2.5, sm: 3 } }}>
          {loading ? (
            <ListSkeleton rows={4} height={52} />
          ) : (
            <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {hadReflection && !saved && (
                <Chip
                  label="Already saved for this day. Change anything and save again."
                  sx={{ alignSelf: 'flex-start', mb: 1, backgroundColor: colors.accent100, color: colors.accent800, height: 'auto', py: 0.5, '& .MuiChip-label': { whiteSpace: 'normal' } }}
                />
              )}
              {CRITERIA.map(({ key, label, hint }) => (
                <Box
                  key={key}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 2,
                    flexWrap: 'wrap',
                    py: 1.5,
                    borderBottom: `1px solid ${colors.grey200}`,
                  }}
                >
                  <Box>
                    <Typography id={`rate-${key}`} sx={{ fontWeight: 600 }}>
                      {label}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {hint}
                    </Typography>
                  </Box>
                  <Rating
                    size="large"
                    value={ratings[key]}
                    onChange={(_, newValue) => rate(key, newValue)}
                    aria-labelledby={`rate-${key}`}
                    sx={{ '& .MuiRating-iconFilled': { color: colors.accent500 }, '& .MuiRating-iconHover': { color: colors.accent600 } }}
                  />
                </Box>
              ))}

              <Box sx={{ pt: 2 }}>
                <Typography sx={{ fontWeight: 600 }}>Sleep times</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                  Optional. Helps the planner keep study away from your sleep.
                </Typography>
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                  <TextField
                    size="small"
                    type="time"
                    label="Went to bed the night before"
                    value={sleepTimes.bed_time}
                    onChange={(e) => setSleepTime('bed_time', e.target.value)}
                    slotProps={{ inputLabel: { shrink: true } }}
                    sx={{ flex: '1 1 200px' }}
                  />
                  <TextField
                    size="small"
                    type="time"
                    label="Woke up"
                    value={sleepTimes.wake_time}
                    onChange={(e) => setSleepTime('wake_time', e.target.value)}
                    slotProps={{ inputLabel: { shrink: true } }}
                    sx={{ flex: '1 1 200px' }}
                  />
                </Box>
              </Box>

              {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
              {saved && <Alert severity="success" sx={{ mt: 2 }}>Saved.</Alert>}

              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 2, flexWrap: 'wrap', mt: 2 }}>
                {!saved && unrated.length > 0 && (
                  <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
                    Rate {unrated.map(({ label }) => label.toLowerCase()).join(', ')} to save.
                  </Typography>
                )}
                <Button type="submit" variant="contained" disabled={submitting || unrated.length > 0}>
                  {submitting ? 'Saving...' : hadReflection ? 'Save changes' : 'Save reflection'}
                </Button>
              </Box>
            </Box>
          )}
        </CardContent>
      </Card>

      <MonthBlanket
        today={today}
        version={insightsVersion}
        onPick={(date) => {
          setSelectedDate(date);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />

      <ReflectionInsights today={today} version={insightsVersion} />
    </Box>
  );
}
