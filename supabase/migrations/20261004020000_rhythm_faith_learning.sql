-- Ingy's rhythm, prayer and Quran, daily learning, and photo dumps.

-- Day start differs on workdays and weekends. Minutes after local midnight.
alter table public.profiles drop column digest_hour;
alter table public.profiles add column day_start_weekday smallint not null default 465 check (day_start_weekday between 0 and 1439); -- 07:45
alter table public.profiles add column day_start_weekend smallint not null default 570 check (day_start_weekend between 0 and 1439); -- 09:30
alter table public.profiles add column weekend_days smallint[] not null default '{6,0}'; -- JS day numbers: Saturday, Sunday

-- Prayer reminders, computed from the device's location.
alter table public.profiles add column latitude double precision;
alter table public.profiles add column longitude double precision;
alter table public.profiles add column prayer_reminders boolean not null default false;
alter table public.profiles add column prayer_fajr boolean not null default true; -- remind for Fajr even in quiet hours
alter table public.profiles add column last_prayer_sent text; -- "2026-10-04:dhuhr", stops repeats

-- Daily Quran: one page a day, picking up where they left off.
alter table public.profiles add column quran_daily boolean not null default true;
alter table public.profiles add column quran_page smallint not null default 1 check (quran_page between 1 and 604);
alter table public.profiles add column quran_last_read date;
alter table public.profiles add column quran_streak smallint not null default 0;

-- Daily 5 to 10 minute learning bite, alternating faith and general knowledge.
alter table public.profiles add column learning_daily boolean not null default true;
alter table public.profiles add column learning_minute smallint not null default 780 check (learning_minute between 0 and 1439); -- 13:00
alter table public.profiles add column last_learning_on date;

alter table public.outputs drop constraint outputs_type_check;
alter table public.outputs add constraint outputs_type_check
  check (type in ('slides', 'notes', 'email', 'document', 'checklist', 'learning'));

-- Photos and screenshots dumped alongside (or instead of) text.
alter table public.dumps add column image_paths text[] not null default '{}';
alter table public.dumps drop constraint dumps_body_check;
alter table public.dumps add constraint dumps_body_check check (length(body) <= 20000);

insert into storage.buckets (id, name, public)
values ('dump-images', 'dump-images', false)
on conflict (id) do nothing;

-- Each person can only touch files under a folder named after their own user id.
create policy "own dump images read" on storage.objects for select
  using (bucket_id = 'dump-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own dump images write" on storage.objects for insert
  with check (bucket_id = 'dump-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own dump images delete" on storage.objects for delete
  using (bucket_id = 'dump-images' and (storage.foldername(name))[1] = auth.uid()::text);

-- Ingy's workdays start around 7:30 to 8, so quiet hours end at 7.
alter table public.profiles alter column quiet_end set default 7;
alter table public.profiles add column last_quran_nudge_on date;

-- Which inbox an email draft belongs in: work (Outlook) or personal (Gmail).
alter table public.outputs add column email_account text check (email_account in ('work', 'personal'));

-- Cycle tracking: pauses prayer reminders during a period and estimates the fertile window.
create table public.cycles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  started_on date not null,
  ended_on date,
  created_at timestamptz not null default now(),
  unique (user_id, started_on)
);
alter table public.cycles enable row level security;
create policy "own cycles" on public.cycles
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
alter publication supabase_realtime add table public.cycles;

alter table public.profiles add column cycle_tracking boolean not null default false;
alter table public.profiles add column last_fertile_nudge_for date; -- window start already announced

-- What Claude knows about this person's life (jobs, studies, people, commitments).
-- Grows from what they dump and can be edited in Settings.
alter table public.profiles add column about_me text not null default '' check (length(about_me) <= 6000);
