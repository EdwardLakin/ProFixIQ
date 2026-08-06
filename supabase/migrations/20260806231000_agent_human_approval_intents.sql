begin;

create table if not exists public.agent_human_approval_intents (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.agent_requests(id) on delete cascade,
  engineering_case_id uuid not null,
  mission_id uuid,
  approval_kind text not null check (approval_kind in ('mission', 'release')),
  approver_user_id uuid not null references auth.users(id) on delete cascade,
  token_sha256 text not null unique check (token_sha256 ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint agent_human_approval_intents_expiry_check check (expires_at > created_at),
  constraint agent_human_approval_intents_mission_shape_check check (
    (approval_kind = 'mission' and mission_id is not null)
    or (approval_kind = 'release' and mission_id is null)
  )
);

create index if not exists agent_human_approval_intents_request_idx
  on public.agent_human_approval_intents (request_id, created_at desc);

create index if not exists agent_human_approval_intents_active_idx
  on public.agent_human_approval_intents (engineering_case_id, approval_kind, expires_at)
  where consumed_at is null;

alter table public.agent_human_approval_intents enable row level security;

revoke all on table public.agent_human_approval_intents from public, anon, authenticated;
grant select, insert, update, delete on table public.agent_human_approval_intents to service_role;

create or replace function public.consume_agent_human_approval_intent(
  p_token_sha256 text,
  p_approval_kind text,
  p_approver_user_id uuid,
  p_engineering_case_id uuid,
  p_mission_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_consumed_id uuid;
begin
  if p_approval_kind not in ('mission', 'release') then
    return false;
  end if;

  update public.agent_human_approval_intents
  set consumed_at = now()
  where token_sha256 = lower(trim(p_token_sha256))
    and approval_kind = p_approval_kind
    and approver_user_id = p_approver_user_id
    and engineering_case_id = p_engineering_case_id
    and mission_id is not distinct from p_mission_id
    and consumed_at is null
    and expires_at > now()
  returning id into v_consumed_id;

  return v_consumed_id is not null;
end;
$$;

revoke all on function public.consume_agent_human_approval_intent(text, text, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.consume_agent_human_approval_intent(text, text, uuid, uuid, uuid) to service_role;

comment on table public.agent_human_approval_intents is
  'Short-lived, one-time proof that an authenticated ProFixIQ user explicitly approved an Agent mission or release.';

comment on function public.consume_agent_human_approval_intent(text, text, uuid, uuid, uuid) is
  'Atomically consumes a short-lived Agent human approval intent. Service-role only.';

commit;
