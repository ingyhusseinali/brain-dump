-- Folders (a class, a project, a trip...) and the things Claude drafts into them:
-- slides, materials, email drafts and documents built from what was dumped.

create table public.folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  kind text not null default 'general' check (kind in ('class', 'project', 'general')),
  area text not null default 'personal' check (area in ('career', 'education', 'money', 'health', 'home_family', 'friends', 'personal', 'spiritual', 'religion')),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index folders_user_name on public.folders (user_id, lower(name));

create table public.outputs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  folder_id uuid references public.folders on delete set null,
  type text not null check (type in ('slides', 'notes', 'email', 'document', 'checklist')),
  title text not null,
  content text not null, -- Markdown. Slides are separated by a line containing only ---
  email_to text,
  email_subject text,
  source_dump_ids uuid[] not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'done', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index outputs_folder on public.outputs (folder_id, updated_at desc);

alter table public.items add column folder_id uuid references public.folders on delete set null;
alter table public.items add column output_id uuid references public.outputs on delete set null;

create trigger folders_touch before update on public.folders
for each row execute function public.touch_updated_at();
create trigger outputs_touch before update on public.outputs
for each row execute function public.touch_updated_at();

alter table public.folders enable row level security;
alter table public.outputs enable row level security;
create policy "own folders" on public.folders
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own outputs" on public.outputs
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

alter publication supabase_realtime add table public.folders;
alter publication supabase_realtime add table public.outputs;

-- Lets the app and the safety-net cron both pick up a dump without filing it twice.
alter table public.dumps add column processing_started_at timestamptz;
