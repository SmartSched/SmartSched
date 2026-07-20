import { useEffect, useState, FormEvent } from 'react';
import { Box, Typography, Rating, Card, CardContent, Button, Link as MuiLink } from '@mui/material';
import { format } from 'date-fns';
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

const todayIso = format(new Date(), 'yyyy-MM-dd');

export function DayReflection() {
  const { user } = useAuth();
  const [ratings, setRatings] = useState<Ratings>({ productivity: 0, mood: 0, energy: 0, sleep: 0 });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    apiGet(`/api/reflections/${todayIso}`)
      .then((existing) => {
        if (existing) setRatings(existing.ratings);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [user]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSaved(false);
    try {
      await apiPost('/api/reflections', { date: todayIso, ratings });
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
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
          Day Reflection
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          {format(new Date(), 'EEEE, MMMM d')}
        </Typography>

        {loading ? (
          <Typography variant="body2" color="text.secondary">
            Loading...
          </Typography>
        ) : (
          <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {CRITERIA.map(({ key, label }) => (
              <Box key={key} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography variant="body1">{label}</Typography>
                <Rating
                  value={ratings[key]}
                  onChange={(_, newValue) => setRatings({ ...ratings, [key]: newValue || 0 })}
                />
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

            <Button type="submit" variant="contained" disabled={submitting} sx={{ backgroundColor: '#8b5cf6' }}>
              {submitting ? 'Saving...' : 'Save Reflection'}
            </Button>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
