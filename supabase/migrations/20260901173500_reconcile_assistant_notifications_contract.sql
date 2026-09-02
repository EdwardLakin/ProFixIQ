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

-- The deployed application records the first production observation of its
-- trusted notification writer. Rollout compatibility closes automatically only
-- after one immutable deployment has served traffic for a drain interval.
create table if not exists public.assistant_notification_rollout_markers (
  contract text primary key,
  deployment_sha text not null,
  deployment_id text,
  first_observed_at timestamptz not null default now(),
  last_observed_at timestamptz not null default now(),
  finalized_at timestamptz,
  constraint assistant_notification_rollout_marker_contract_chk
    check (coalesce(trim(contract), '') <> ''),
  constraint assistant_notification_rollout_marker_sha_chk
    check (coalesce(trim(deployment_sha), '') <> '')
);

alter table public.assistant_notification_rollout_markers
  enable row level security;
revoke all on table public.assistant_notification_rollout_markers
  from anon, authenticated;
grant all on table public.assistant_notification_rollout_markers
  to service_role;

create or replace function public.mark_assistant_notification_trusted_writer_rollout(
  p_deployment_sha text,
  p_deployment_id text default null
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if coalesce(trim(p_deployment_sha), '') = '' then
    raise exception 'A deployment SHA is required for the trusted-writer marker.';
  end if;

  -- Finalization is a terminal contract state. Later application deployments
  -- must not reopen the drain window or repeat catalog-locking DDL.
  if exists (
    select 1
    from public.assistant_notification_rollout_markers
    where contract = 'assistant_notifications_trusted_writer_v1'
      and finalized_at is not null
  ) then
    return;
  end if;

  insert into public.assistant_notification_rollout_markers (
    contract,
    deployment_sha,
    deployment_id,
    first_observed_at,
    last_observed_at,
    finalized_at
  ) values (
    'assistant_notifications_trusted_writer_v1',
    trim(p_deployment_sha),
    nullif(trim(p_deployment_id), ''),
    now(),
    now(),
    null
  )
  on conflict (contract) do update
  set deployment_sha = excluded.deployment_sha,
      deployment_id = excluded.deployment_id,
      first_observed_at = case
        when public.assistant_notification_rollout_markers.deployment_sha =
          excluded.deployment_sha
          then public.assistant_notification_rollout_markers.first_observed_at
        else excluded.first_observed_at
      end,
      last_observed_at = excluded.last_observed_at,
      finalized_at = case
        when public.assistant_notification_rollout_markers.deployment_sha =
          excluded.deployment_sha
          then public.assistant_notification_rollout_markers.finalized_at
        else null
      end;

  if exists (
    select 1
    from public.assistant_notification_rollout_markers
    where contract = 'assistant_notifications_trusted_writer_v1'
      and finalized_at is null
      and first_observed_at <= now() - interval '10 minutes'
      and last_observed_at >= first_observed_at
  ) then
    execute 'drop policy if exists assistant_notifications_insert_rollout_compat '
      || 'on public.assistant_notifications';
    execute 'drop policy if exists assistant_notifications_update_rollout_compat '
      || 'on public.assistant_notifications';
    execute 'revoke insert, update on table public.assistant_notifications '
      || 'from authenticated';
    execute 'grant select on table public.assistant_notifications '
      || 'to authenticated';
    execute 'grant update (status, acknowledged_at, acknowledged_by, updated_at) '
      || 'on table public.assistant_notifications to authenticated';

    update public.assistant_notification_rollout_markers
    set finalized_at = now(),
        last_observed_at = now()
    where contract = 'assistant_notifications_trusted_writer_v1'
      and deployment_sha = trim(p_deployment_sha)
      and finalized_at is null;
  end if;
end;
$function$;

revoke all on function
  public.mark_assistant_notification_trusted_writer_rollout(text, text)
  from public, anon, authenticated;
grant execute on function
  public.mark_assistant_notification_trusted_writer_rollout(text, text)
  to service_role;

create or replace function
  public.assistant_notification_trusted_writer_rollout_complete()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select exists (
    select 1
    from public.assistant_notification_rollout_markers
    where contract = 'assistant_notifications_trusted_writer_v1'
      and finalized_at is not null
  );
$function$;

revoke all on function
  public.assistant_notification_trusted_writer_rollout_complete()
  from public, anon;
grant execute on function
  public.assistant_notification_trusted_writer_rollout_complete()
  to authenticated, service_role;

-- Parts notification functions were compiled while production still exposed a
-- UUID entity_id. Recreate the three surviving table-backed definitions with
-- explicit text comparisons so both clean replay and the forward production
-- conversion keep Parts lifecycle mutations executable.
do $reconcile_parts_notification_writers$
declare
  v_definition text;
begin
  select pg_get_functiondef(
    'public.parts_publish_request_notification_with_table(uuid,text)'::regprocedure
  ) into v_definition;
  v_definition := replace(
    v_definition,
    'and entity_id = p_request_id',
    'and entity_id = p_request_id::text'
  );
  if position('and entity_id = p_request_id::text' in v_definition) = 0 then
    raise exception
      'Unable to reconcile parts_publish_request_notification_with_table';
  end if;
  execute v_definition;

  select pg_get_functiondef(
    'public.parts_sync_technician_ready_notification_with_table(uuid)'::regprocedure
  ) into v_definition;
  v_definition := replace(
    v_definition,
    'and entity_id = p_request_id',
    'and entity_id = p_request_id::text'
  );
  if position('and entity_id = p_request_id::text' in v_definition) = 0 then
    raise exception
      'Unable to reconcile parts_sync_technician_ready_notification_with_table';
  end if;
  execute v_definition;

  select pg_get_functiondef(
    'public.parts_reconcile_pick_request_notification(uuid)'::regprocedure
  ) into v_definition;
  v_definition := replace(
    v_definition,
    'and notification.entity_id = $2',
    'and notification.entity_id = $2::text'
  );
  if position('and notification.entity_id = $2::text' in v_definition) = 0 then
    raise exception
      'Unable to reconcile parts_reconcile_pick_request_notification';
  end if;
  execute v_definition;
end
$reconcile_parts_notification_writers$;

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
-- role. Shared Agent ops rows use shop-scoped fingerprints, so every staff role
-- in the shop sees the same row instead of alternately overwriting its role.
-- Parts workflow rows preserve the established owner/admin/manager/parts
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
        (
          source = 'ops'
          and (select public.profixiq_current_role()) in (
            'owner', 'admin', 'manager', 'advisor', 'service', 'parts',
            'lead_hand', 'foreman'
          )
        )
        or (
          source <> 'ops'
          and public.canonical_shop_membership_role(role) =
            (select public.profixiq_current_role())
        )
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
        (
          source = 'ops'
          and (select public.profixiq_current_role()) in (
            'owner', 'admin', 'manager', 'advisor', 'service', 'parts',
            'lead_hand', 'foreman'
          )
        )
        or (
          source <> 'ops'
          and public.canonical_shop_membership_role(role) =
            (select public.profixiq_current_role())
        )
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

-- Rollout compatibility: the currently deployed Agent writes ops projections
-- with its authenticated server client. Keep only that recipient-bound path
-- until the trusted-writer application change has reached every instance; a
-- follow-up migration can then remove these policies and broad UPDATE columns.
create policy assistant_notifications_insert_rollout_compat
on public.assistant_notifications
for insert
to authenticated
with check (
  shop_id = (select public.current_shop_id())
  and not (
    select public.assistant_notification_trusted_writer_rollout_complete()
  )
  and source in ('ops', 'ops_user')
  and (
    (
      source = 'ops_user'
      and user_id = (select public.profixiq_workforce_profile_id())
      and (select public.profixiq_current_role()) = 'mechanic'
    )
    or (
      source = 'ops'
      and user_id is null
      and (select public.profixiq_current_role()) in (
        'owner', 'admin', 'manager', 'advisor', 'service', 'parts',
        'lead_hand', 'foreman'
      )
      and public.canonical_shop_membership_role(role) =
        (select public.profixiq_current_role())
    )
  )
);

create policy assistant_notifications_update_rollout_compat
on public.assistant_notifications
for update
to authenticated
using (
  shop_id = (select public.current_shop_id())
  and not (
    select public.assistant_notification_trusted_writer_rollout_complete()
  )
  and source in ('ops', 'ops_user')
  and (
    (
      source = 'ops_user'
      and user_id = (select public.profixiq_workforce_profile_id())
      and (select public.profixiq_current_role()) = 'mechanic'
    )
    or (
      source = 'ops'
      and user_id is null
      and (select public.profixiq_current_role()) in (
        'owner', 'admin', 'manager', 'advisor', 'service', 'parts',
        'lead_hand', 'foreman'
      )
    )
  )
)
with check (
  shop_id = (select public.current_shop_id())
  and not (
    select public.assistant_notification_trusted_writer_rollout_complete()
  )
  and source in ('ops', 'ops_user')
  and (
    (
      source = 'ops_user'
      and user_id = (select public.profixiq_workforce_profile_id())
      and (select public.profixiq_current_role()) = 'mechanic'
    )
    or (
      source = 'ops'
      and user_id is null
      and (select public.profixiq_current_role()) in (
        'owner', 'admin', 'manager', 'advisor', 'service', 'parts',
        'lead_hand', 'foreman'
      )
    )
  )
);

revoke all on table public.assistant_notifications from anon;
revoke all on table public.assistant_notifications from authenticated;
grant select, insert, update on table public.assistant_notifications
  to authenticated;
grant all on table public.assistant_notifications to service_role;

notify pgrst, 'reload schema';

commit;
