#!/usr/bin/env bash
set -euo pipefail

# @regression-flow field.service-visit-execution-locking
# Session A changes a visit assignment while holding the visit row lock.
# Session B starts as the former assignee with a nullable expected version. The
# transition must recheck authorization against the tuple visible after A
# commits; the former check-then-lock implementation transitioned the visit.

db_url="${1:-${DB_URL:-}}"
if [[ -z "$db_url" ]]; then
  echo "Usage: $0 <postgres-url> (or set DB_URL)" >&2
  exit 64
fi

probe_dir="$(mktemp -d)"
reassign_log="$probe_dir/reassign.log"
transition_log="$probe_dir/transition.log"

cleanup() {
  set +e
  psql "$db_url" -X -v ON_ERROR_STOP=1 >/dev/null 2>&1 <<'SQL'
drop trigger if exists aaa_field_visit_reassignment_probe
  on public.service_visits;
drop function if exists public.test_field_visit_reassignment_probe();
delete from public.scheduler_operation_keys
where shop_id = 'fb250000-0000-4000-8000-000000000010'
  and operation_key = 'field-execution:former-assignee:concurrent';
delete from public.service_visits
where id = 'fd250000-0000-4000-8000-000000000010';
delete from public.work_orders
where id = 'fc250000-0000-4000-8000-000000000010';
delete from public.mobile_field_operators
where shop_id = 'fb250000-0000-4000-8000-000000000010';
delete from public.mobile_service_settings
where shop_id = 'fb250000-0000-4000-8000-000000000010';
update public.profiles
set shop_id = null
where id in (
  'fa250000-0000-4000-8000-000000000010',
  'fa250000-0000-4000-8000-000000000011',
  'fa250000-0000-4000-8000-000000000012'
);
delete from public.shops
where id = 'fb250000-0000-4000-8000-000000000010';
delete from public.profiles
where id in (
  'fa250000-0000-4000-8000-000000000010',
  'fa250000-0000-4000-8000-000000000011',
  'fa250000-0000-4000-8000-000000000012'
);
delete from auth.users
where id in (
  'fa250000-0000-4000-8000-000000000010',
  'fa250000-0000-4000-8000-000000000011',
  'fa250000-0000-4000-8000-000000000012'
);
SQL
  rm -rf -- "$probe_dir"
}
trap cleanup EXIT

wait_for_reassignment_probe() {
  psql "$db_url" -X -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
do $wait_for_reassignment_probe$
declare
  v_deadline timestamptz := clock_timestamp() + interval '10 seconds';
begin
  loop
    perform pg_stat_clear_snapshot();
    if exists (
      select 1
      from pg_locks probe_lock
      join pg_stat_activity activity on activity.pid = probe_lock.pid
      where activity.application_name = 'field-visit-reassign-a'
        and probe_lock.locktype = 'advisory'
        and probe_lock.classid = '782511'::oid
        and probe_lock.objid = '1'::oid
        and probe_lock.objsubid = 2
        and probe_lock.mode = 'ExclusiveLock'
        and probe_lock.granted
    ) then
      return;
    end if;
    if clock_timestamp() >= v_deadline then
      raise exception 'Timed out waiting for the reassignment probe.';
    end if;
    perform pg_sleep(0.05);
  end loop;
end;
$wait_for_reassignment_probe$;
SQL
}

psql "$db_url" -X -v ON_ERROR_STOP=1 <<'SQL'
insert into auth.users (id, email, raw_user_meta_data)
values
  (
    'fa250000-0000-4000-8000-000000000010',
    'field-lock-owner@example.com',
    '{"full_name":"Field Lock Owner"}'::jsonb
  ),
  (
    'fa250000-0000-4000-8000-000000000011',
    'field-lock-former@example.com',
    '{"full_name":"Field Lock Former Assignee"}'::jsonb
  ),
  (
    'fa250000-0000-4000-8000-000000000012',
    'field-lock-new@example.com',
    '{"full_name":"Field Lock New Assignee"}'::jsonb
  )
on conflict (id) do nothing;

insert into public.profiles (id, user_id, role, full_name, email, shop_id)
values
  (
    'fa250000-0000-4000-8000-000000000010',
    'fa250000-0000-4000-8000-000000000010',
    'owner', 'Field Lock Owner', 'field-lock-owner@example.com', null
  ),
  (
    'fa250000-0000-4000-8000-000000000011',
    'fa250000-0000-4000-8000-000000000011',
    'mechanic', 'Field Lock Former Assignee',
    'field-lock-former@example.com', null
  ),
  (
    'fa250000-0000-4000-8000-000000000012',
    'fa250000-0000-4000-8000-000000000012',
    'mechanic', 'Field Lock New Assignee', 'field-lock-new@example.com', null
  )
on conflict (id) do update
set user_id = excluded.user_id,
    role = excluded.role,
    full_name = excluded.full_name,
    email = excluded.email,
    shop_id = null;

insert into public.shops (
  id, owner_id, business_name, name, user_limit,
  accepts_online_booking, min_notice_minutes, max_lead_days,
  location_type, country, billing_entitlement_override
)
values (
  'fb250000-0000-4000-8000-000000000010',
  'fa250000-0000-4000-8000-000000000010',
  'Field Execution Lock Runtime', 'Field Execution Lock Runtime', 10,
  true, 0, 365, 'mobile_service_branch', 'CA', 'internal_demo'
)
on conflict (id) do update
set country = 'CA',
    billing_entitlement_override = 'internal_demo';

update public.profiles
set shop_id = 'fb250000-0000-4000-8000-000000000010'
where id in (
  'fa250000-0000-4000-8000-000000000010',
  'fa250000-0000-4000-8000-000000000011',
  'fa250000-0000-4000-8000-000000000012'
);

insert into public.mobile_service_settings (
  shop_id, service_model, solo_mode, dispatch_enabled,
  service_vehicles_enabled, field_operator_count_target,
  onboarding_completed_at, configured_by
)
values (
  'fb250000-0000-4000-8000-000000000010', 'mobile', false, true,
  true, 2, now(), 'fa250000-0000-4000-8000-000000000010'
)
on conflict (shop_id) do update
set service_model = excluded.service_model,
    dispatch_enabled = excluded.dispatch_enabled,
    onboarding_completed_at = excluded.onboarding_completed_at;

insert into public.mobile_field_operators (
  shop_id, profile_id, enabled, created_by
)
values
  (
    'fb250000-0000-4000-8000-000000000010',
    'fa250000-0000-4000-8000-000000000011', true,
    'fa250000-0000-4000-8000-000000000010'
  ),
  (
    'fb250000-0000-4000-8000-000000000010',
    'fa250000-0000-4000-8000-000000000012', true,
    'fa250000-0000-4000-8000-000000000010'
  )
on conflict (shop_id, profile_id) do update
set enabled = true;

insert into public.work_orders (
  id, shop_id, user_id, status, approval_state, custom_id
)
values (
  'fc250000-0000-4000-8000-000000000010',
  'fb250000-0000-4000-8000-000000000010',
  'fa250000-0000-4000-8000-000000000010',
  'in_progress', 'approved', 'FIELD-EXECUTION-LOCK'
)
on conflict (id) do update
set shop_id = excluded.shop_id,
    status = excluded.status,
    approval_state = excluded.approval_state;

insert into public.service_visits (
  id, shop_id, work_order_id, mode, status,
  assigned_user_id, version, created_by
)
values (
  'fd250000-0000-4000-8000-000000000010',
  'fb250000-0000-4000-8000-000000000010',
  'fc250000-0000-4000-8000-000000000010',
  'mobile', 'scheduled',
  'fa250000-0000-4000-8000-000000000011', 1,
  'fa250000-0000-4000-8000-000000000010'
)
on conflict (id) do update
set assigned_user_id = excluded.assigned_user_id,
    status = excluded.status,
    version = excluded.version;

create or replace function public.test_field_visit_reassignment_probe()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_application_name text := current_setting('application_name', true);
  v_deadline timestamptz := clock_timestamp() + interval '10 seconds';
begin
  if v_application_name = 'field-visit-reassign-a'
     and new.assigned_user_id is distinct from old.assigned_user_id then
    perform pg_advisory_xact_lock(782511, 1);
    loop
      perform pg_stat_clear_snapshot();
      if exists (
        select 1
        from pg_stat_activity contender
        where contender.application_name = 'field-visit-transition-b'
          and contender.state = 'active'
          and contender.wait_event_type = 'Lock'
          and pg_backend_pid() = any(pg_blocking_pids(contender.pid))
      ) then
        return new;
      end if;
      if clock_timestamp() >= v_deadline then
        raise exception 'Timed out waiting for the former assignee transition.';
      end if;
      perform pg_sleep(0.05);
    end loop;
  end if;
  return new;
end;
$function$;

create trigger aaa_field_visit_reassignment_probe
before update of assigned_user_id on public.service_visits
for each row
execute function public.test_field_visit_reassignment_probe();
SQL

psql "$db_url" -X -v ON_ERROR_STOP=1 >"$reassign_log" 2>&1 <<'SQL' &
select set_config('application_name', 'field-visit-reassign-a', false);
begin;
set local lock_timeout = '12s';
set local statement_timeout = '20s';
update public.service_visits
set assigned_user_id = 'fa250000-0000-4000-8000-000000000012'
where id = 'fd250000-0000-4000-8000-000000000010';
commit;
SQL
reassign_pid=$!

if ! wait_for_reassignment_probe; then
  echo "Reassignment did not reach the concurrency probe." >&2
  reassign_status=0
  wait "$reassign_pid" || reassign_status=$?
  cat "$reassign_log" >&2
  echo "Reassignment exit status: $reassign_status" >&2
  exit 1
fi

transition_status=0
psql "$db_url" -X -v ON_ERROR_STOP=1 >"$transition_log" 2>&1 <<'SQL' || transition_status=$?
select set_config('application_name', 'field-visit-transition-b', false);
begin;
set local lock_timeout = '12s';
set local statement_timeout = '20s';
select set_config(
  'request.jwt.claim.sub',
  'fa250000-0000-4000-8000-000000000011',
  true
);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"fa250000-0000-4000-8000-000000000011"}',
  true
);
set local role authenticated;
do $former_assignee_must_be_denied$
declare
  v_denied boolean := false;
begin
  begin
    perform public.dispatch_transition_service_visit_atomic(
      'fb250000-0000-4000-8000-000000000010',
      'fd250000-0000-4000-8000-000000000010',
      'dispatched', null, null, null,
      'fa250000-0000-4000-8000-000000000011',
      'field-execution:former-assignee:concurrent'
    );
  exception when sqlstate '42501' then
    v_denied := true;
  end;

  if not v_denied then
    raise exception 'Former assignee transitioned a concurrently reassigned visit';
  end if;
end;
$former_assignee_must_be_denied$;
reset role;
rollback;
SQL

set +e
wait "$reassign_pid"
reassign_status=$?
set -e

if (( reassign_status != 0 || transition_status != 0 )); then
  echo "Concurrent reassignment contract failed." >&2
  cat "$reassign_log" >&2
  cat "$transition_log" >&2
  exit 1
fi

final_state="$(psql "$db_url" -X -Atv ON_ERROR_STOP=1 -c "
  select concat_ws('|', assigned_user_id::text, status, version::text)
  from public.service_visits
  where id = 'fd250000-0000-4000-8000-000000000010';
")"
if [[ "$final_state" != "fa250000-0000-4000-8000-000000000012|scheduled|1" ]]; then
  echo "Concurrent transition changed the reassigned visit: $final_state" >&2
  exit 1
fi

receipt_count="$(psql "$db_url" -X -Atv ON_ERROR_STOP=1 -c "
  select count(*)
  from public.scheduler_operation_keys
  where shop_id = 'fb250000-0000-4000-8000-000000000010'
    and operation_key = 'field-execution:former-assignee:concurrent';
")"
if [[ "$receipt_count" != "0" ]]; then
  echo "Denied former-assignee transition created a receipt." >&2
  exit 1
fi

echo "field_visit_execution_locking_ok"
