-- Starter schema for SmartSched (scaffold, revise as needed).
-- profiles extends Supabase's built-in auth.users; login/auth itself is handled by Supabase Auth.

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text,
  created_at timestamptz not null default now()
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  title text not null,
  description text,
  type text not null check (type in ('homework', 'exam', 'project', 'work', 'study')),
  priority text not null check (priority in ('high', 'medium', 'low')),
  due_date timestamptz,
  estimated_time integer,
  completed boolean not null default false,
  time_spent integer not null default 0,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table time_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  date date not null,
  start_time time not null,
  end_time time not null,
  activity text not null,
  type text not null check (type in ('class', 'study', 'break', 'personal', 'commute', 'meal')),
  created_at timestamptz not null default now()
);

create table habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  name text not null,
  icon text,
  goal integer not null default 7,
  completed_dates date[] not null default '{}',
  created_at timestamptz not null default now()
);

create table reflections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  date date not null,
  ratings jsonb not null default '{}',
  created_at timestamptz not null default now()
);
