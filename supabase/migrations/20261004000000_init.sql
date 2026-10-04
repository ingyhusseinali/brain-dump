-- Brain Dump: initial schema.
-- Everything a person types or says lands in `dumps` untouched, then Claude
-- splits it into `items` (tasks, reminders, ideas, notes) that the app follows up on.

create extension if not exists pgcrypto;

-- Per-person settings used by the follow-up engine.
create table public.profiles (
  user_id uuid primary key references auth.users on delete cascade,
  timezone text not null default 'UTC',
  quiet_start smallint not null default 22 check (quiet_start between 0 and 23),
  quiet_end smallint not null default 8 check (quiet_end between 0 and 23),
  digest_hour smallint not null default 9 check (digest_hour between 0 and 23),
  last_digest_on date,
  created_at timestamptz not null default now()
);

-- The raw, never-edited capture. Nothing is ever lost, even if sorting fails.
create table public.dumps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  body text not null check (length(body) between 1 and 20000),
  source text not null default 'text' check (source in ('text', 'voice')),
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  error text
);
create index dumps_user_created on public.dumps (user_id, created_at desc);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  dump_id uuid references public.dumps on delete set null,
  kind text not null check (kind in ('task', 'reminder', 'idea', 'note', 'goal')),
  -- Life area, so the daily list stays balanced across everything that matters.
  area text not null default 'personal' check (area in ('career', 'education', 'money', 'health', 'home_family', 'friends', 'personal', 'spiritual', 'religion')),
  origin text not null default 'dump' check (origin in ('dump', 'plan', 'email')),
  title text not null,
  details text,
  remind_at timestamptz,
  priority smallint not null default 2 check (priority between 1 and 3), -- 1 = most important
  tags text[] not null default '{}',
  status text not null default 'open' check (status in ('open', 'snoozed', 'done', 'archived')),
  snoozed_until timestamptz,
  nudge_count smallint not null default 0,
  last_nudged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index items_user_status on public.items (user_id, status);
create index items_remind on public.items (remind_at) where status in ('open', 'snoozed');

-- Today's to-do list, written by Claude from everything open. One row per person per local day.
create table public.plans (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  plan_date date not null,
  headline text not null,
  entries jsonb not null default '[]', -- [{ "item_id": uuid, "why": text }]
  generated_at timestamptz not null default now(),
  primary key (user_id, plan_date)
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger items_touch before update on public.items
for each row execute function public.touch_updated_at();

-- Create a profile row automatically on sign-up.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- Row level security: each person only ever sees their own data.
alter table public.profiles enable row level security;
alter table public.dumps enable row level security;
alter table public.items enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.plans enable row level security;

create policy "own profile" on public.profiles
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own dumps" on public.dumps
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own items" on public.items
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own plans" on public.plans
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own push subscriptions" on public.push_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Live sync between phone and laptop.
alter publication supabase_realtime add table public.items;
alter publication supabase_realtime add table public.dumps;
alter publication supabase_realtime add table public.plans;

-- Settings the scheduler needs, readable only with the service role.
create schema if not exists private;
create table private.app_settings (
  key text primary key,
  value text not null
);
revoke all on schema private from anon, authenticated;
insert into private.app_settings (key, value)
values ('cron_secret', encode(gen_random_bytes(32), 'hex'));

-- Lets the nudge function check the secret the cron job sends.
create or replace function public.cron_secret_matches(candidate text) returns boolean
language sql security definer set search_path = private as $$
  select exists (select 1 from private.app_settings where key = 'cron_secret' and value = candidate);
$$;
revoke execute on function public.cron_secret_matches(text) from public, anon, authenticated;

-- Call once (SETUP.md step 4) to start the follow-up engine every 5 minutes.
create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.schedule_nudges(project_url text) returns void
language plpgsql security definer set search_path = public, private as $$
declare
  secret text := (select value from private.app_settings where key = 'cron_secret');
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'brain-dump-nudge';
  perform cron.schedule(
    'brain-dump-nudge',
    '*/5 * * * *',
    format(
      $job$select net.http_post(url := %L, headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', %L), body := '{}'::jsonb)$job$,
      rtrim(project_url, '/') || '/functions/v1/nudge',
      secret
    )
  );
end $$;
revoke execute on function public.schedule_nudges(text) from public, anon, authenticated;
