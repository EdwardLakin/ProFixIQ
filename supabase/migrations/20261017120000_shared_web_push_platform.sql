-- Shared in-app notification + standard Web Push platform (isolated addition).
-- Creates only new objects. No pre-existing table, trigger, policy, grant or
-- function is changed. All access is server-only (service_role); routes
-- authenticate the caller, derive shop/user scope, and then use the admin
-- client, so no authenticated/anon grants or policies are created.

create table if not exists public.app_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null,
  endpoint_hash text not null,
  p256dh text not null,
  auth_secret text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_reason text,
  consecutive_failures integer not null default 0,
  constraint app_push_subscriptions_endpoint_hash_key unique (endpoint_hash),
  constraint app_push_subscriptions_endpoint_https check (endpoint like 'https://%'),
  constraint app_push_subscriptions_revoked_check
    check ((revoked_at is null) = (revoked_reason is null))
);

create index if not exists app_push_subscriptions_active_user_idx
  on public.app_push_subscriptions (shop_id, user_id)
  where revoked_at is null;

create table if not exists public.app_notifications (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  recipient_user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null,
  dedupe_key text not null,
  title text not null,
  body text,
  target_path text not null,
  priority text not null default 'normal',
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  read_at timestamptz,
  acknowledged_at timestamptz,
  constraint app_notifications_dedupe_key unique (recipient_user_id, dedupe_key),
  constraint app_notifications_event_type_check
    check (event_type ~ '^[a-z][a-z0-9_.]{2,63}$'),
  constraint app_notifications_priority_check
    check (priority in ('normal', 'high')),
  constraint app_notifications_target_path_check
    check (target_path like '/%' and target_path not like '//%' and position(E'\\' in target_path) = 0),
  constraint app_notifications_dedupe_len_check
    check (char_length(dedupe_key) between 8 and 300)
);

create index if not exists app_notifications_recipient_created_idx
  on public.app_notifications (shop_id, recipient_user_id, created_at desc);

create table if not exists public.app_notification_push_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.app_notifications(id) on delete cascade,
  subscription_id uuid not null references public.app_push_subscriptions(id) on delete cascade,
  status text not null default 'pending',
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error_code text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  constraint app_notification_push_deliveries_once unique (notification_id, subscription_id),
  constraint app_notification_push_deliveries_status_check
    check (status in ('pending', 'sending', 'sent', 'failed', 'expired', 'suppressed'))
);

create index if not exists app_notification_push_deliveries_due_idx
  on public.app_notification_push_deliveries (next_attempt_at)
  where status in ('pending', 'sending');

create index if not exists app_notification_push_deliveries_subscription_idx
  on public.app_notification_push_deliveries (subscription_id);

alter table public.app_push_subscriptions enable row level security;
alter table public.app_notifications enable row level security;
alter table public.app_notification_push_deliveries enable row level security;

revoke all on table public.app_push_subscriptions from anon, authenticated;
revoke all on table public.app_notifications from anon, authenticated;
revoke all on table public.app_notification_push_deliveries from anon, authenticated;
grant all on table public.app_push_subscriptions to service_role;
grant all on table public.app_notifications to service_role;
grant all on table public.app_notification_push_deliveries to service_role;

-- Atomically lease due deliveries so overlapping workers never double-send.
-- A lease that is not completed becomes due again after p_lease_seconds.
create or replace function public.claim_app_push_deliveries(
  p_limit integer default 50,
  p_lease_seconds integer default 120
)
returns setof public.app_notification_push_deliveries
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  with due as (
    select d.id
    from public.app_notification_push_deliveries d
    where d.status in ('pending', 'sending')
      and d.next_attempt_at <= now()
    order by d.next_attempt_at
    limit greatest(1, least(coalesce(p_limit, 50), 200))
    for update skip locked
  )
  update public.app_notification_push_deliveries d
  set status = 'sending',
      attempts = d.attempts + 1,
      next_attempt_at = now() + make_interval(secs => greatest(30, coalesce(p_lease_seconds, 120)))
  from due
  where d.id = due.id
  returning d.*;
end;
$$;

revoke all on function public.claim_app_push_deliveries(integer, integer) from public, anon, authenticated;
grant execute on function public.claim_app_push_deliveries(integer, integer) to service_role;
