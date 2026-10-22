-- What users do with their plans, for the preference model (ml/prefs/history.py turns it into the log the
-- model reads). Done and missed blocks come from time_blocks and tasks; only what those lose is here:
--   plan_accepted  a suggested plan was chosen: details = {week_start, chosen, options: [style, ...], removed}
--                  (removed: how many of its sessions the user took out before choosing it)
--   block_moved    a task block's time changed: details = {label, from: {date, start, end}, to: {...}}
--   block_deleted  a task block was deleted: details = {label, date, start, end}
-- block_id and task_id aren't foreign keys: the history should outlive the block, and a deleted task's
-- events are dropped by the builder.

create table schedule_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('plan_accepted', 'block_moved', 'block_deleted')),
  block_id uuid,
  task_id uuid,
  details jsonb not null default '{}'
);

create index schedule_events_user_created on schedule_events (user_id, created_at);

alter table schedule_events enable row level security;

create policy "schedule_events: owner select" on schedule_events
  for select using (auth.uid() = user_id);
create policy "schedule_events: owner insert" on schedule_events
  for insert with check (auth.uid() = user_id);

-- Optional sleep times on the daily reflection: bed time the night before, wake-up time that morning.
alter table reflections
  add column bed_time time,
  add column wake_time time;
