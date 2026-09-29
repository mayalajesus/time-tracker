alter table public.clients
  add column if not exists billable boolean not null default false;
