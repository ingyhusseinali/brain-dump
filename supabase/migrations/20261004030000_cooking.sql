-- Cooking (saved recipes and a daily "what to cook today") and social media content planning.
alter table public.outputs drop constraint outputs_type_check;
alter table public.outputs add constraint outputs_type_check
  check (type in ('slides', 'notes', 'email', 'document', 'checklist', 'learning', 'recipe', 'content'));
alter table public.outputs add column last_cooked_on date; -- recipes only; null means not tried yet

alter table public.profiles add column cooking_daily boolean not null default true;
alter table public.profiles add column cooking_minute smallint not null default 900 check (cooking_minute between 0 and 1439); -- 15:00
alter table public.profiles add column last_meal_on date;
alter table public.profiles add column meal_today_id uuid references public.outputs (id) on delete set null;
