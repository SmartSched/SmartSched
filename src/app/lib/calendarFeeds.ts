// A Google or Outlook calendar linked by its iCal link, as the server sends it (the link itself stays on the server).
export interface CalendarFeed {
  id: string;
  provider: 'google' | 'outlook';
  link: string; // shortened, e.g. "calendar.google.com/…/basic.ics"
  last_synced_at: string | null;
  last_error: string | null;
}

export const PROVIDER_LABELS: Record<CalendarFeed['provider'], string> = {
  google: 'Google Calendar',
  outlook: 'Outlook',
};
