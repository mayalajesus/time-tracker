alter table public.workspaces
  add column if not exists logo_data_url text;

alter table public.workspaces
  add constraint workspaces_logo_data_url_size
  check (logo_data_url is null or octet_length(logo_data_url) <= 666700);

comment on column public.workspaces.logo_data_url is
  'Validated PNG, JPEG or WebP data URL for providers without object storage; at most 500 KB decoded.';
