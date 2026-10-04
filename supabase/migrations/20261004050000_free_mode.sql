-- Free setup: Claude in the project picks the meal on its morning round, and the
-- follow-up engine sends the reminder for it at cooking time. This records that send.
alter table public.profiles add column if not exists meal_pushed_on date;
