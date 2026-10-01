create table public.transactional_emails (
  id uuid primary key default gen_random_uuid(),
  operation_key text not null unique,
  kind text not null check (kind in ('welcome', 'invitation')),
  user_id text references public.profiles(id) on delete cascade,
  invitation_id uuid references public.workspace_invitations(id) on delete cascade,
  recipient text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'sending', 'accepted', 'failed', 'unknown', 'skipped')),
  attempts integer not null default 0,
  next_attempt_at timestamptz,
  message_id text,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.transactional_emails enable row level security;
revoke all on public.transactional_emails from public;

-- Existing accounts must never receive a retroactive welcome email.
insert into public.transactional_emails(operation_key, kind, user_id, recipient, status)
select 'welcome:' || id, 'welcome', id, email, 'skipped' from public.profiles;

create index transactional_emails_invitation_idx on public.transactional_emails(invitation_id);
