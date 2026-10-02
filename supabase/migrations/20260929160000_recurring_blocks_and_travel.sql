-- #24 Recurring blocks: the repeat rule is stored once, and the server writes out one time_blocks row per
-- occurrence (series_id points back to the rule). Editing "all" rewrites the rule and its rows; editing
-- "just this one" detaches that row from the series.
create table time_block_series (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  activity text not null,
  type text not null check (type in ('class', 'study', 'break', 'personal', 'commute', 'meal', 'work')),
  location text,
  start_time time not null,
  end_time time not null,
  days_of_week smallint[] not null, -- 0 = Sunday ... 6 = Saturday
  interval_weeks smallint not null default 1 check (interval_weeks in (1, 2)),
  start_date date not null,
  end_date date not null,
  created_at timestamptz not null default now(),
  check (end_time > start_time),
  check (end_date >= start_date)
);

alter table time_block_series enable row level security;

create policy "time_block_series: owner select" on time_block_series
  for select using (auth.uid() = user_id);
create policy "time_block_series: owner insert" on time_block_series
  for insert with check (auth.uid() = user_id);
create policy "time_block_series: owner update" on time_block_series
  for update using (auth.uid() = user_id);
create policy "time_block_series: owner delete" on time_block_series
  for delete using (auth.uid() = user_id);

alter table time_blocks
  add column series_id uuid references time_block_series (id) on delete cascade;

create index time_blocks_series_id_idx on time_blocks (series_id);

-- #25 Travel time: where a block happens, and whether it's a commute the app added by itself (those get
-- recalculated whenever the day changes; commutes the user added or edited are left alone).
alter table time_blocks
  add column location text,
  add column auto boolean not null default false;

-- The user's own places (besides home, campus, work and gym) and minutes between each pair of places,
-- e.g. {"places": ["library"], "minutes": {"campus|work": 20}} with each pair's names in sorted order.
alter table profiles
  add column travel jsonb not null default '{"places": [], "minutes": {}}';
