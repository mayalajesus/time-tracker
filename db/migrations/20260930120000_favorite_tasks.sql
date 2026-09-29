alter table public.user_preferences
  add column if not exists favorite_tasks jsonb not null default '{}'::jsonb
  check (jsonb_typeof(favorite_tasks) = 'object');

comment on column public.user_preferences.favorite_tasks is
  'Personal recurring tasks grouped by workspace, with project and billable preference.';
