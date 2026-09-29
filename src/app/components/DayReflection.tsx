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
  Link as MuiLink,
} from '@mui/material';
import { ChevronLeft, ChevronRight } from '@mui/icons-material';
import { addDays, format, parseISO } from 'date-fns';
import { Link as RouterLink } from 'react-router';
import { useAuth } from '../lib/AuthContext';
import { apiGet, apiPost } from '../lib/api';

const CRITERIA = [
  { key: 'productivity', label: 'Productivity' },
  { key: 'mood', label: 'Mood' },
  { key: 'energy', label: 'Energy' },
  { key: 'sleep', label: 'Sleep' },
] as const;

type Ratings = Record<(typeof CRITERIA)[number]['key'], number>;

const EMPTY_RATINGS: Ratings = { productivity: 0, mood: 0, energy: 0, sleep: 0 };

// Worked out when it's needed, not once when the app loads, so a tab left open overnight moves on to the new day.
function todayIso() {
  return format(new Date(), 'yyyy-MM-dd');
}

function formatDay(date: string) {
  const day = parseISO(date);
  return format(day, day.getFullYear() === new Date().getFullYear() ? 'EEEE, MMMM d' : 'EEEE, MMMM d, yyyy');
}

export function DayReflection() {
  const { user } = useAuth();
  const [selectedDate, setSelectedDate] = useState(todayIso);
  const [ratings, setRatings] = useState<Ratings>(EMPTY_RATINGS);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSaved(false);
    setRatings(EMPTY_RATINGS);

    apiGet(`/api/reflections/${selectedDate}`)
      .then((existing) => {
        if (!cancelled && existing) setRatings({ ...EMPTY_RATINGS, ...existing.ratings });
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [user, selectedDate]);

  const today = todayIso();
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

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (unrated.length) return;
    setSubmitting(true);
    setSaved(false);
    setError(null);
    try {
      await apiPost('/api/reflections', { date: selectedDate, ratings });
      setSaved(true);
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
    <Card sx={{ maxWidth: '500px', mx: 'auto', borderRadius: '16px' }}>
      <CardContent sx={{ p: 4 }}>
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
          Day Reflection
        </Typography>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
          <IconButton aria-label="Previous day" onClick={() => changeDay(-1)}>
            <ChevronLeft />
          </IconButton>
          <Typography variant="body1" sx={{ fontWeight: 600, flex: 1, textAlign: 'center' }}>
            {formatDay(selectedDate)}
          </Typography>
          <IconButton aria-label="Next day" onClick={() => changeDay(1)} disabled={isToday}>
            <ChevronRight />
          </IconButton>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mb: 3 }}>
          <TextField
            size="small"
            type="date"
            label="Go to date"
            value={selectedDate}
            onChange={(e) => pickDate(e.target.value)}
            slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: today } }}
          />
          <Button size="small" onClick={() => setSelectedDate(today)} disabled={isToday}>
            Today
          </Button>
        </Box>

        {loading ? (
          <Typography variant="body2" color="text.secondary">
            Loading...
          </Typography>
        ) : (
          <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {CRITERIA.map(({ key, label }) => (
              <Box key={key} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography variant="body1">{label}</Typography>
                <Rating value={ratings[key]} onChange={(_, newValue) => rate(key, newValue)} />
              </Box>
            ))}

            {error && (
              <Typography variant="body2" color="error">
                {error}
              </Typography>
            )}
            {saved && (
              <Typography variant="body2" color="success.main">
                Saved.
              </Typography>
            )}
            {!saved && unrated.length > 0 && (
              <Typography variant="body2" color="text.secondary">
                Rate {unrated.map(({ label }) => label.toLowerCase()).join(', ')} to save.
              </Typography>
            )}

            <Button
              type="submit"
              variant="contained"
              disabled={submitting || unrated.length > 0}
              sx={{ backgroundColor: '#8b5cf6' }}
            >
              {submitting ? 'Saving...' : 'Save Reflection'}
            </Button>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
