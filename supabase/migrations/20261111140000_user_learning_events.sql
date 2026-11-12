-- Structured, privacy-minimised behavior observations used to improve soft scheduling preferences.
-- Task titles/descriptions are deliberately not stored here.
create table user_learning_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  event_type text not null check (event_type in (
    'task_created', 'task_edited', 'task_completed', 'schedule_accepted',
    'study_block_moved', 'study_block_deleted', 'study_block_skipped', 'study_block_completed'
  )),
  occurred_at timestamptz not null default now(),
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  created_at timestamptz not null default now()
);

create index user_learning_events_user_occurred on user_learning_events (user_id, occurred_at desc);

alter table user_learning_events enable row level security;

create policy "user_learning_events: owner select" on user_learning_events
  for select using (auth.uid() = user_id);
create policy "user_learning_events: owner insert" on user_learning_events
  for insert with check (auth.uid() = user_id);
