begin;

create table if not exists public.agent_bridge_credentials (
  id text primary key,
  secret text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.agent_bridge_credentials enable row level security;

revoke all on table public.agent_bridge_credentials from public, anon, authenticated;
grant select on table public.agent_bridge_credentials to service_role;

comment on table public.agent_bridge_credentials is
  'Server-only credentials used by ProFixIQ to call the external engineering organization.';
comment on column public.agent_bridge_credentials.secret is
  'Plaintext bridge credential. Accessible only through the server-side service-role client.';

commit;
