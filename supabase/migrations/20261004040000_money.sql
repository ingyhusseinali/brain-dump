-- Money: spending and income from what they say (or a receipt photo), a monthly budget, and savings goals.
alter table public.profiles add column currency text not null default 'EGP';
alter table public.profiles add column monthly_budget numeric(12, 2) check (monthly_budget is null or monthly_budget >= 0);
alter table public.profiles add column budget_categories jsonb not null default '{}'::jsonb; -- {"groceries": 6000, ...}
alter table public.profiles add column last_budget_alert_for text; -- "2026-10:90" once that alert was sent

create table public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  target numeric(12, 2) not null check (target > 0),
  saved numeric(12, 2) not null default 0,
  currency text not null default 'EGP',
  deadline date,
  status text not null default 'active' check (status in ('active', 'reached', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.savings_goals enable row level security;
create policy "own savings goals" on public.savings_goals
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
alter publication supabase_realtime add table public.savings_goals;

create table public.money_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  kind text not null check (kind in ('expense', 'income', 'saving')),
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null default 'EGP',
  category text not null default 'other',
  note text,
  happened_on date not null default current_date,
  goal_id uuid references public.savings_goals on delete set null,
  dump_id uuid references public.dumps on delete set null,
  created_at timestamptz not null default now()
);
create index money_entries_user_date on public.money_entries (user_id, happened_on desc);
alter table public.money_entries enable row level security;
create policy "own money entries" on public.money_entries
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
alter publication supabase_realtime add table public.money_entries;
create trigger savings_goals_touch before update on public.savings_goals
  for each row execute function public.touch_updated_at();
