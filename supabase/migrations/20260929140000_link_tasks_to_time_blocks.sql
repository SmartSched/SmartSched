-- A time block can be time set aside for a task (type 'task', with task_id). Checking the block off
-- in the planner completes the task. Deleting a task deletes the blocks planned for it.

alter table time_blocks
  add column task_id uuid references tasks (id) on delete cascade;

create index time_blocks_task_id_idx on time_blocks (task_id);

-- Add 'task'. This also adds 'work', which the planner already offers but the original list was missing.
alter table time_blocks drop constraint time_blocks_type_check;
alter table time_blocks add constraint time_blocks_type_check
  check (type in ('class', 'study', 'break', 'personal', 'commute', 'meal', 'work', 'task'));

-- Task blocks always have a task, and no other block does.
alter table time_blocks add constraint time_blocks_task_matches_type
  check ((type = 'task') = (task_id is not null));
