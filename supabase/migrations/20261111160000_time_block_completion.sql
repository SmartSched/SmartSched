-- A scheduled task session has its own completion state. This is deliberately
-- separate from tasks.completed: one task can be spread across several sessions.
alter table time_blocks
  add column completed boolean not null default false,
  add column completed_at timestamptz;

create index time_blocks_completed_idx on time_blocks (user_id, completed)
  where completed = true;
