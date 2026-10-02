import { useEffect, useState, FormEvent } from 'react';
import { Box, Button, Card, CardContent, Chip, TextField, Typography } from '@mui/material';
import { useProfile } from '../lib/ProfileContext';
import { BUILT_IN_PLACES, EMPTY_TRAVEL, pairKey, placeLabel, placePairs, type Travel } from '../lib/places';

// Minutes typed per pair, as strings so a field can be empty.
type Draft = Record<string, string>;

function toDraft(travel: Travel): Draft {
  return Object.fromEntries(Object.entries(travel.minutes).map(([key, value]) => [key, String(value)]));
}

// How long it takes to get between places. The planner uses these to add commute blocks between two
// blocks in a row that are in different places.
export function TravelTimes() {
  const { profile, saveTravel } = useProfile();
  const saved = profile?.travel ?? EMPTY_TRAVEL;
  const [places, setPlaces] = useState<string[]>(saved.places);
  const [draft, setDraft] = useState<Draft>(() => toDraft(saved));
  const [newPlace, setNewPlace] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState(false);

  useEffect(() => {
    setPlaces(saved.places);
    setDraft(toDraft(saved));
  }, [profile?.travel]);

  const everyPlace = [...BUILT_IN_PLACES, ...places];

  const addPlace = (e: FormEvent) => {
    e.preventDefault();
    const place = newPlace.trim().toLowerCase();
    if (!place) return;
    if (place.includes('|') || place.length > 40) {
      setError('Place names need to be short, without |.');
      return;
    }
    if (!everyPlace.includes(place)) setPlaces([...places, place]);
    setNewPlace('');
    setSavedMessage(false);
  };

  const removePlace = (place: string) => {
    setPlaces(places.filter((p) => p !== place));
    setDraft(Object.fromEntries(Object.entries(draft).filter(([key]) => !key.split('|').includes(place))));
    setSavedMessage(false);
  };

  const handleSave = async () => {
    const minutes: Record<string, number> = {};
    for (const [key, value] of Object.entries(draft)) {
      if (!value.trim()) continue;
      const number = Number(value);
      if (!Number.isInteger(number) || number < 1 || number > 240) {
        setError('Travel times need to be whole minutes, from 1 to 240.');
        return;
      }
      minutes[key] = number;
    }
    setSaving(true);
    setError(null);
    try {
      await saveTravel({ places, minutes });
      setSavedMessage(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card sx={{ borderRadius: '16px' }}>
      <CardContent sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          Travel Times
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          How long it usually takes you to get between places. When two blocks in a row are in different places,
          the planner adds a commute before the second one. Leave a trip blank if you never make it.
        </Typography>

        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center', mb: 2 }}>
          {BUILT_IN_PLACES.map((place) => (
            <Chip key={place} label={placeLabel(place)} />
          ))}
          {places.map((place) => (
            <Chip key={place} label={placeLabel(place)} onDelete={() => removePlace(place)} color="secondary" variant="outlined" />
          ))}
          <Box component="form" onSubmit={addPlace} sx={{ display: 'flex', gap: 1 }}>
            <TextField
              size="small"
              placeholder="Add a place"
              value={newPlace}
              onChange={(e) => setNewPlace(e.target.value)}
              sx={{ width: 160 }}
            />
            <Button type="submit" size="small" disabled={!newPlace.trim()}>
              Add
            </Button>
          </Box>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, columnGap: 3, rowGap: 1.5 }}>
          {placePairs(everyPlace).map(([a, b]) => {
            const key = pairKey(a, b);
            return (
              <Box key={key} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Typography variant="body2" sx={{ flex: 1 }}>
                  {placeLabel(a)} ↔ {placeLabel(b)}
                </Typography>
                <TextField
                  size="small"
                  type="number"
                  placeholder="—"
                  value={draft[key] ?? ''}
                  onChange={(e) => {
                    setDraft({ ...draft, [key]: e.target.value });
                    setSavedMessage(false);
                  }}
                  slotProps={{ htmlInput: { min: 1, max: 240, 'aria-label': `Minutes between ${a} and ${b}` } }}
                  sx={{ width: 90 }}
                />
                <Typography variant="body2" color="text.secondary">
                  min
                </Typography>
              </Box>
            );
          })}
        </Box>

        {error && (
          <Typography variant="body2" color="error" sx={{ mt: 2 }}>
            {error}
          </Typography>
        )}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 2 }}>
          <Button variant="contained" onClick={handleSave} disabled={saving} sx={{ backgroundColor: '#8b5cf6' }}>
            {saving ? 'Saving...' : 'Save Travel Times'}
          </Button>
          {savedMessage && (
            <Typography variant="body2" color="success.main">
              Saved. Commutes for the next eight weeks are updated.
            </Typography>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}
