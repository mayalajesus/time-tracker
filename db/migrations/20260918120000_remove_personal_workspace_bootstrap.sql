drop trigger if exists on_profile_created on public.profiles;
drop function if exists public.handle_new_profile_workspace();
drop function if exists public.ensure_personal_workspace(text);

comment on table public.workspaces is
  'Company workspaces created explicitly by an authenticated user or joined through an invitation.';
