begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';

-- Production originated this shared projection outside the canonical migration
-- ledger. Create it for clean replay, then converge the existing production
-- relation without replacing rows or changing notification fingerprints.
create table if not exists public.assistant_notifications (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  role text,
  source text not null default 'ops'::text,
  fingerprint text not null,
  code text not null,
  level text not null,
  title text not null,
  message text not null,
  href text,
  entity_type text,
  entity_id text,
  status text not null default 'active'::text,
  metadata jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assistant_notifications_shop_id_fingerprint_key
    unique (shop_id, fingerprint),
  constraint assistant_notifications_acknowledged_requires_timestamp_chk
    check (status <> 'acknowledged'::text or acknowledged_at is not null),
  constraint assistant_notifications_anchor_chk
    check (user_id is not null or entity_id is not null),
  constraint assistant_notifications_code_required_chk
    check (coalesce(trim(code), ''::text) <> ''::text),
  constraint assistant_notifications_level_chk
    check (level = any (array['info'::text, 'warning'::text, 'critical'::text])),
  constraint assistant_notifications_message_required_chk
    check (coalesce(trim(message), ''::text) <> ''::text),
  constraint assistant_notifications_resolved_requires_timestamp_chk
    check (status <> 'resolved'::text or resolved_at is not null),
  constraint assistant_notifications_shop_required_chk
    check (shop_id is not null),
  constraint assistant_notifications_status_chk
    check (
      lower(replace(status, ' '::text, '_'::text)) = any (
        array['active'::text, 'open'::text, 'acknowledged'::text, 'resolved'::text]
      )
    ),
  constraint assistant_notifications_title_required_chk
    check (coalesce(trim(title), ''::text) <> ''::text)
);

-- The application intentionally emits opaque ShopBoost identifiers such as
-- pricing:<key>. Existing UUID values cast losslessly while clean replay starts
-- with the canonical text contract.
alter table public.assistant_notifications
  alter column entity_id type text using entity_id::text;

create index if not exists assistant_notifications_role_status_idx
  on public.assistant_notifications (shop_id, role, status, last_seen_at desc);
create index if not exists assistant_notifications_shop_status_idx
  on public.assistant_notifications (shop_id, status, level, last_seen_at desc);
create index if not exists assistant_notifications_user_status_idx
  on public.assistant_notifications (user_id, status, last_seen_at desc);
create index if not exists idx_assistant_notifications_entity
  on public.assistant_notifications (entity_type, entity_id);
create index if not exists idx_assistant_notifications_shop_created
  on public.assistant_notifications (shop_id, created_at desc);
create index if not exists idx_assistant_notifications_shop_status
  on public.assistant_notifications (shop_id, status);
create index if not exists idx_assistant_notifications_user_created_at
  on public.assistant_notifications (user_id, created_at desc);

create or replace function public.enforce_assistant_notification_consistency()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
begin
  if not exists (
    select 1
    from public.shops
    where id = new.shop_id
  ) then
    raise exception
      'assistant_notification % references missing shop %',
      new.id,
      new.shop_id;
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_enforce_assistant_notification_consistency
  on public.assistant_notifications;
create trigger trg_enforce_assistant_notification_consistency
before insert or update of shop_id on public.assistant_notifications
for each row execute function public.enforce_assistant_notification_consistency();

alter table public.assistant_notifications enable row level security;

drop policy if exists assistant_notifications_select_same_shop
  on public.assistant_notifications;
drop policy if exists assistant_notifications_insert_same_shop
  on public.assistant_notifications;
drop policy if exists assistant_notifications_update_same_shop
  on public.assistant_notifications;
drop policy if exists assistant_notifications_select_intended_recipient
  on public.assistant_notifications;
drop policy if exists assistant_notifications_acknowledge_intended_recipient
  on public.assistant_notifications;

-- Staff can read only a row explicitly addressed to their canonical profile or
-- role. Parts workflow rows preserve the established owner/admin/manager/parts
-- audience. Both supported profile/auth identity shapes flow through the
-- canonical helpers used throughout the application.
create policy assistant_notifications_select_intended_recipient
on public.assistant_notifications
for select
to authenticated
using (
  shop_id = (select public.current_shop_id())
  and (
    user_id = (select public.profixiq_workforce_profile_id())
    or (
      user_id is null
      and (
        public.canonical_shop_membership_role(role) =
          (select public.profixiq_current_role())
        or (
          public.canonical_shop_membership_role(role) = 'parts'
          and (select public.profixiq_current_role()) in (
            'owner', 'admin', 'manager', 'parts'
          )
        )
      )
    )
  )
);

-- Browser clients receive only acknowledgement column privileges. The policy
-- binds the resulting row to the canonical actor and rejects attempts to turn
-- resolved alerts back into active state. Notification creation/resolution is
-- performed only by trusted server writers or existing SECURITY DEFINER flows.
create policy assistant_notifications_acknowledge_intended_recipient
on public.assistant_notifications
for update
to authenticated
using (
  shop_id = (select public.current_shop_id())
  and resolved_at is null
  and (
    user_id = (select public.profixiq_workforce_profile_id())
    or (
      user_id is null
      and (
        public.canonical_shop_membership_role(role) =
          (select public.profixiq_current_role())
        or (
          public.canonical_shop_membership_role(role) = 'parts'
          and (select public.profixiq_current_role()) in (
            'owner', 'admin', 'manager', 'parts'
          )
        )
      )
    )
  )
)
with check (
  shop_id = (select public.current_shop_id())
  and status = 'acknowledged'
  and resolved_at is null
  and acknowledged_at is not null
  and acknowledged_by = (select public.profixiq_workforce_profile_id())
);

revoke all on table public.assistant_notifications from anon;
revoke all on table public.assistant_notifications from authenticated;
grant select on table public.assistant_notifications to authenticated;
grant update (status, acknowledged_at, acknowledged_by, updated_at)
  on table public.assistant_notifications to authenticated;
grant all on table public.assistant_notifications to service_role;

notify pgrst, 'reload schema';

commit;
