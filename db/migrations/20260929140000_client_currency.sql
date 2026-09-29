alter table public.clients
  add column if not exists currency text
  check (currency in ('BRL', 'USD', 'EUR'));

comment on column public.clients.currency is
  'Billing currency for new time entries on client projects; null preserves legacy member currency defaults.';
