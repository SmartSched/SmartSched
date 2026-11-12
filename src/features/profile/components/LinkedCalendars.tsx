import { useEffect, useState, FormEvent } from 'react';
import { Alert, Box, Button, Card, CardContent, Collapse, IconButton, Link, TextField, Typography } from '@mui/material';
import { DeleteOutline, Sync } from '@mui/icons-material';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { apiDelete, apiGet, apiPost } from '../../../app/lib/api';
import { PROVIDER_LABELS, type CalendarFeed } from '../../../app/lib/calendarFeeds';

// The browser's time zone, so imported events land at the right local times.
const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

// Google Calendar and Outlook, linked through their private iCal link. Their events show in the planner as
// busy time, and suggested plans work around them. They're read-only here: changes are made in the calendar.
export function LinkedCalendars() {
  const [feeds, setFeeds] = useState<CalendarFeed[] | null>(null);
  const [link, setLink] = useState('');
  const [adding, setAdding] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [help, setHelp] = useState<'google' | 'outlook' | null>(null);

  useEffect(() => {
    apiGet('/api/calendar-feeds')
      .then(setFeeds)
      .catch((err) => setError(err.message));
  }, []);

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!link.trim()) return;
    setAdding(true);
    setError(null);
    setNotice(null);
    try {
      const feed: CalendarFeed = await apiPost('/api/calendar-feeds', { url: link.trim(), timeZone: timeZone() });
      setFeeds([...(feeds ?? []), feed]);
      setLink('');
      setNotice(`${PROVIDER_LABELS[feed.provider]} linked. Its events for the next eight weeks are in your planner.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setAdding(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setError(null);
    setNotice(null);
    try {
      const result: { feeds: CalendarFeed[] } = await apiPost('/api/calendar-feeds/sync', { force: true });
      setFeeds(result.feeds);
      if (!result.feeds.some((f) => f.last_error)) setNotice('Calendars synced.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSyncing(false);
    }
  };

  const handleRemove = async (feed: CalendarFeed) => {
    setError(null);
    setNotice(null);
    try {
      await apiDelete(`/api/calendar-feeds/${feed.id}`);
      setFeeds((feeds ?? []).filter((f) => f.id !== feed.id));
      setNotice(`${PROVIDER_LABELS[feed.provider]} unlinked. Its events were removed from your planner.`);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <Card sx={{ borderRadius: '16px' }}>
      <CardContent sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          Linked calendars
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Bring in events from Google Calendar or Outlook. They show in your planner as busy time, and suggested
          plans fit around them. To change an event, edit it in that calendar; SmartSched picks up changes each
          time the planner opens.
        </Typography>

        {feeds && feeds.length > 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 2 }}>
            {feeds.map((feed) => (
              <Box
                key={feed.id}
                sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5, border: 1, borderColor: 'divider', borderRadius: '12px' }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {PROVIDER_LABELS[feed.provider]}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" noWrap component="div">
                    {feed.link}
                    {feed.last_synced_at ? ` · synced ${formatDistanceToNow(parseISO(feed.last_synced_at), { addSuffix: true })}` : ''}
                  </Typography>
                  {feed.last_error && (
                    <Typography variant="caption" color="error" component="div">
                      {feed.last_error}
                    </Typography>
                  )}
                </Box>
                <IconButton aria-label={`Unlink ${PROVIDER_LABELS[feed.provider]}`} onClick={() => handleRemove(feed)}>
                  <DeleteOutline />
                </IconButton>
              </Box>
            ))}
            <Box>
              <Button size="small" startIcon={<Sync />} onClick={handleSync} disabled={syncing}>
                {syncing ? 'Syncing...' : 'Sync now'}
              </Button>
            </Box>
          </Box>
        )}

        <Box component="form" onSubmit={handleAdd} sx={{ display: 'flex', gap: 1, flexWrap: { xs: 'wrap', sm: 'nowrap' } }}>
          <TextField
            size="small"
            fullWidth
            placeholder="Paste your calendar's iCal (.ics) link"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            slotProps={{ htmlInput: { 'aria-label': 'Calendar link', autoComplete: 'off', spellCheck: false } }}
          />
          <Button type="submit" variant="contained" disabled={adding || !link.trim()} sx={{ flexShrink: 0 }}>
            {adding ? 'Linking...' : 'Link calendar'}
          </Button>
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
          Where to find the link:{' '}
          <Link component="button" type="button" onClick={() => setHelp(help === 'google' ? null : 'google')}>
            Google Calendar
          </Link>{' '}
          ·{' '}
          <Link component="button" type="button" onClick={() => setHelp(help === 'outlook' ? null : 'outlook')}>
            Outlook
          </Link>
        </Typography>
        <Collapse in={help === 'google'}>
          <Typography variant="body2" component="ol" sx={{ pl: 2.5, mt: 1, mb: 0 }}>
            <li>On a computer, open Google Calendar and go to Settings (the gear icon).</li>
            <li>Under "Settings for my calendars", pick the calendar, then "Integrate calendar".</li>
            <li>Copy "Secret address in iCal format" and paste it above.</li>
          </Typography>
        </Collapse>
        <Collapse in={help === 'outlook'}>
          <Typography variant="body2" component="ol" sx={{ pl: 2.5, mt: 1, mb: 0 }}>
            <li>In Outlook on the web, open Settings, then Calendar, then "Shared calendars".</li>
            <li>Under "Publish a calendar", pick the calendar and "Can view all details", then Publish.</li>
            <li>Copy the ICS link and paste it above.</li>
          </Typography>
        </Collapse>
        <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1.5 }}>
          The link gives read access to that calendar, so it's encrypted before it's saved and never shown in full
          here. The events brought in are encrypted too. All-day events and ones marked free aren't brought in.
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
        {notice && (
          <Typography variant="body2" color="success.main" sx={{ mt: 2 }}>
            {notice}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}
