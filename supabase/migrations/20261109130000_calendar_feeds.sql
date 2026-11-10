-- Google Calendar / Outlook: the user pastes their calendar's private iCal (.ics) link, and the server copies
-- its events into time_blocks so they show in the planner and the scheduler plans around them. Imported blocks
-- point back at their feed (feed_id); every sync replaces them, and removing the feed removes them.
--
-- The link works like a password for that calendar, so it's only ever read by the server (row-level security
-- keeps it to its owner, and the API sends the browser a shortened version).
create table calendar_feeds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  provider text not null check (provider in ('google', 'outlook')),
  url text not null check (length(url) <= 2000),
  time_zone text not null, -- the browser's IANA zone when it was added, for turning events into local times
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (user_id, url)
);

alter table calendar_feeds enable row level security;

create policy "calendar_feeds: owner select" on calendar_feeds
  for select using (auth.uid() = user_id);
create policy "calendar_feeds: owner insert" on calendar_feeds
  for insert with check (auth.uid() = user_id);
create policy "calendar_feeds: owner update" on calendar_feeds
  for update using (auth.uid() = user_id);
create policy "calendar_feeds: owner delete" on calendar_feeds
  for delete using (auth.uid() = user_id);

alter table time_blocks
  add column feed_id uuid references calendar_feeds (id) on delete cascade;

create index time_blocks_feed_id_idx on time_blocks (feed_id);
