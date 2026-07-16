begin;

alter table public.email_logs
  add column if not exists last_event_at timestamptz,
  add column if not exists last_event_type text,
  add column if not exists delivered_at timestamptz;

-- Remove bearer links and credentials written by legacy application versions.
update public.email_logs
set metadata = coalesce(metadata, '{}'::jsonb)
  - 'portal_link'
  - 'portal_url'
  - 'quote_url'
  - 'login_url'
  - 'username'
  - 'password'
  - 'temp_password'
  - 'token';

create table if not exists public.email_delivery_events (
  id uuid primary key default gen_random_uuid(),
  email_log_id uuid references public.email_logs(id) on delete set null,
  provider text not null default 'sendgrid',
  provider_event_id text not null,
  provider_message_id text,
  event_type text not null,
  event_at timestamptz not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

create index if not exists email_delivery_events_log_idx
  on public.email_delivery_events(email_log_id, event_at desc);

alter table public.email_delivery_events enable row level security;
revoke all on table public.email_delivery_events from anon, authenticated;
grant all on table public.email_delivery_events to service_role;

alter table public.email_suppressions enable row level security;
revoke all on table public.email_suppressions from anon, authenticated;
grant all on table public.email_suppressions to service_role;

create or replace function public.process_sendgrid_delivery_event(
  p_email_log_id uuid,
  p_provider_event_id text,
  p_provider_message_id text,
  p_event_type text,
  p_event_at timestamptz,
  p_error_text text,
  p_payload jsonb,
  p_suppression_email text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event_id uuid;
  v_email_log_id uuid;
begin
  select id
  into v_email_log_id
  from public.email_logs
  where id = p_email_log_id;

  insert into public.email_delivery_events (
    email_log_id,
    provider,
    provider_event_id,
    provider_message_id,
    event_type,
    event_at,
    payload
  )
  values (
    v_email_log_id,
    'sendgrid',
    p_provider_event_id,
    p_provider_message_id,
    p_event_type,
    p_event_at,
    coalesce(p_payload, '{}'::jsonb)
  )
  on conflict (provider, provider_event_id) do nothing
  returning id into v_event_id;

  if v_event_id is null then
    return false;
  end if;

  if v_email_log_id is not null then
    update public.email_logs
    set status = p_event_type,
        error_text = p_error_text,
        provider_message_id = coalesce(p_provider_message_id, provider_message_id),
        last_event_at = p_event_at,
        last_event_type = p_event_type,
        delivered_at = case
          when p_event_type = 'delivered' then p_event_at
          else delivered_at
        end
    where id = v_email_log_id
      and (last_event_at is null or last_event_at <= p_event_at);
  end if;

  if nullif(lower(btrim(p_suppression_email)), '') is not null then
    insert into public.email_suppressions (email, suppressed, reason, updated_at)
    values (
      lower(btrim(p_suppression_email)),
      true,
      'sendgrid:' || p_event_type || coalesce(':' || nullif(p_error_text, ''), ''),
      p_event_at
    )
    on conflict (email) do update
      set suppressed = true,
          reason = excluded.reason,
          updated_at = excluded.updated_at;
  end if;

  return true;
end;
$$;

revoke all on function public.process_sendgrid_delivery_event(
  uuid, text, text, text, timestamptz, text, jsonb, text
) from public, anon, authenticated;
grant execute on function public.process_sendgrid_delivery_event(
  uuid, text, text, text, timestamptz, text, jsonb, text
) to service_role;

commit;
