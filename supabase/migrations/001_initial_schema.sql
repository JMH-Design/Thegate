-- Enable pgvector extension
create extension if not exists vector;

-- Users table (extends Supabase auth.users)
create table public.users (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  created_at timestamptz default now() not null,
  profile jsonb default null
);

alter table public.users enable row level security;

create policy "Users can read own data" on public.users
  for select using (auth.uid() = id);

create policy "Users can update own data" on public.users
  for update using (auth.uid() = id);

create policy "Users can insert own data" on public.users
  for insert with check (auth.uid() = id);

-- Auto-create user record on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Topics table
create table public.topics (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id) on delete cascade not null,
  name text not null,
  current_depth_level smallint default 1 not null check (current_depth_level between 1 and 5),
  status text default 'developing' not null check (status in ('needs_review', 'developing', 'strong')),
  last_tested_at timestamptz default null,
  mental_model text default null,
  common_errors jsonb default '[]'::jsonb,
  created_at timestamptz default now() not null
);

alter table public.topics enable row level security;

create policy "Users can read own topics" on public.topics
  for select using (auth.uid() = user_id);

create policy "Users can insert own topics" on public.topics
  for insert with check (auth.uid() = user_id);

create policy "Users can update own topics" on public.topics
  for update using (auth.uid() = user_id);

create policy "Users can delete own topics" on public.topics
  for delete using (auth.uid() = user_id);

create index topics_user_id_idx on public.topics(user_id);

-- Sessions table
create table public.sessions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id) on delete cascade not null,
  topic_id uuid references public.topics(id) on delete cascade not null,
  transcript text default '' not null,
  transcript_embedding vector(1536) default null,
  depth_level_before smallint default 1 not null check (depth_level_before between 1 and 5),
  depth_level_after smallint default 1 not null check (depth_level_after between 1 and 5),
  gap_types jsonb default '[]'::jsonb,
  session_summary jsonb default null,
  created_at timestamptz default now() not null
);

alter table public.sessions enable row level security;

create policy "Users can read own sessions" on public.sessions
  for select using (auth.uid() = user_id);

create policy "Users can insert own sessions" on public.sessions
  for insert with check (auth.uid() = user_id);

create policy "Users can update own sessions" on public.sessions
  for update using (auth.uid() = user_id);

create index sessions_user_id_idx on public.sessions(user_id);
create index sessions_topic_id_idx on public.sessions(topic_id);

-- Benchmarks table (public read)
create table public.benchmarks (
  id uuid default gen_random_uuid() primary key,
  topic_name text not null,
  benchmark_level smallint default 2 not null check (benchmark_level between 1 and 5),
  description text not null,
  source_name text not null,
  source_url text not null,
  last_updated timestamptz default now() not null
);

alter table public.benchmarks enable row level security;

create policy "Benchmarks are readable by all authenticated users" on public.benchmarks
  for select using (auth.role() = 'authenticated');
