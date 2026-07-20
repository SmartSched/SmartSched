-- Enable Row Level Security so each user can only see/write their own rows,
-- now that real auth (Supabase Auth) is being wired up.

alter table profiles enable row level security;
alter table tasks enable row level security;
alter table time_blocks enable row level security;
alter table habits enable row level security;
alter table reflections enable row level security;

create policy "profiles: owner select" on profiles
  for select using (auth.uid() = id);
create policy "profiles: owner insert" on profiles
  for insert with check (auth.uid() = id);
create policy "profiles: owner update" on profiles
  for update using (auth.uid() = id);

create policy "tasks: owner select" on tasks
  for select using (auth.uid() = user_id);
create policy "tasks: owner insert" on tasks
  for insert with check (auth.uid() = user_id);
create policy "tasks: owner update" on tasks
  for update using (auth.uid() = user_id);
create policy "tasks: owner delete" on tasks
  for delete using (auth.uid() = user_id);

create policy "time_blocks: owner select" on time_blocks
  for select using (auth.uid() = user_id);
create policy "time_blocks: owner insert" on time_blocks
  for insert with check (auth.uid() = user_id);
create policy "time_blocks: owner update" on time_blocks
  for update using (auth.uid() = user_id);
create policy "time_blocks: owner delete" on time_blocks
  for delete using (auth.uid() = user_id);

create policy "habits: owner select" on habits
  for select using (auth.uid() = user_id);
create policy "habits: owner insert" on habits
  for insert with check (auth.uid() = user_id);
create policy "habits: owner update" on habits
  for update using (auth.uid() = user_id);
create policy "habits: owner delete" on habits
  for delete using (auth.uid() = user_id);

create policy "reflections: owner select" on reflections
  for select using (auth.uid() = user_id);
create policy "reflections: owner insert" on reflections
  for insert with check (auth.uid() = user_id);
create policy "reflections: owner update" on reflections
  for update using (auth.uid() = user_id);
create policy "reflections: owner delete" on reflections
  for delete using (auth.uid() = user_id);
