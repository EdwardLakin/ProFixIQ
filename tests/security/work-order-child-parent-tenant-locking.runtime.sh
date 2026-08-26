#!/usr/bin/env bash
set -euo pipefail

# @regression-flow work-orders.child-parent-tenant-locking
# A probe trigger pauses the first insert after the task-owned parent lock but
# before the pre-existing status reconciliation trigger. With a weak SHARE
# lock, the second insert reaches the probe too and both sessions deadlock while
# upgrading to update the parent. The canonical NO KEY UPDATE lock instead
# blocks the second insert until the first reconciliation commits.

db_url="${1:-${DB_URL:-}}"
if [[ -z "$db_url" ]]; then
  echo "Usage: $0 <postgres-url> (or set DB_URL)" >&2
  exit 64
fi

probe_dir="$(mktemp -d)"
first_log="$probe_dir/first.log"
second_log="$probe_dir/second.log"

cleanup() {
  set +e
  psql "$db_url" -X -v ON_ERROR_STOP=1 >/dev/null 2>&1 <<'SQL'
drop trigger if exists aaa_work_order_child_lock_probe
  on public.work_order_lines;
drop function if exists public.test_work_order_child_lock_probe();
delete from public.work_order_lines
where id in (
  'bf250000-0000-4000-8000-000000000001',
  'bf250000-0000-4000-8000-000000000002'
);
delete from public.work_orders
where id = 'be250000-0000-4000-8000-000000000010';
update public.profiles
set shop_id = null
where id = 'bd250000-0000-4000-8000-000000000010';
delete from public.shops
where id = 'bc250000-0000-4000-8000-000000000010';
delete from public.profiles
where id = 'bd250000-0000-4000-8000-000000000010';
delete from auth.users
where id = 'bd250000-0000-4000-8000-000000000010';
SQL
  rm -rf -- "$probe_dir"
}
trap cleanup EXIT

wait_for_first_probe() {
  psql "$db_url" -X -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
do $wait_for_first_probe$
declare
  v_deadline timestamptz := clock_timestamp() + interval '10 seconds';
begin
  loop
    perform pg_stat_clear_snapshot();
    if exists (
      select 1
      from pg_locks probe_lock
      join pg_stat_activity activity on activity.pid = probe_lock.pid
      where activity.application_name = 'work-order-child-lock-probe-a'
        and probe_lock.locktype = 'advisory'
        and probe_lock.classid = '782510'::oid
        and probe_lock.objid = '1'::oid
        and probe_lock.objsubid = 2
        and probe_lock.mode = 'ExclusiveLock'
        and probe_lock.granted
    ) then
      return;
    end if;
    if clock_timestamp() >= v_deadline then
      raise exception 'Timed out waiting for the first child lock probe.';
    end if;
    perform pg_sleep(0.05);
  end loop;
end
$wait_for_first_probe$;
SQL
}

psql "$db_url" -X -v ON_ERROR_STOP=1 <<'SQL'
insert into auth.users (id, email, raw_user_meta_data)
values (
  'bd250000-0000-4000-8000-000000000010',
  'work-order-child-lock-probe@example.com',
  '{"full_name":"Work Order Child Lock Probe"}'::jsonb
);

insert into public.profiles (id, user_id, role, full_name)
values (
  'bd250000-0000-4000-8000-000000000010',
  'bd250000-0000-4000-8000-000000000010',
  'owner',
  'Work Order Child Lock Probe'
);

insert into public.shops (id, owner_id, business_name, name)
values (
  'bc250000-0000-4000-8000-000000000010',
  'bd250000-0000-4000-8000-000000000010',
  'Work Order Child Lock Probe',
  'Work Order Child Lock Probe'
);

update public.profiles
set shop_id = 'bc250000-0000-4000-8000-000000000010'
where id = 'bd250000-0000-4000-8000-000000000010';

insert into public.work_orders (id, shop_id, custom_id, status, record_type)
values (
  'be250000-0000-4000-8000-000000000010',
  'bc250000-0000-4000-8000-000000000010',
  'CHILD-LOCK-PROBE',
  'in_progress',
  'work_order'
);

create or replace function public.test_work_order_child_lock_probe()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_application_name text := current_setting('application_name', true);
  v_deadline timestamptz := clock_timestamp() + interval '10 seconds';
begin
  if v_application_name = 'work-order-child-lock-probe-a' then
    perform pg_advisory_xact_lock(782510, 1);
    loop
      perform pg_stat_clear_snapshot();
      if exists (
        select 1
        from pg_stat_activity contender
        where contender.application_name = 'work-order-child-lock-probe-b'
          and contender.state = 'active'
          and contender.wait_event_type = 'Lock'
          and pg_backend_pid() = any(pg_blocking_pids(contender.pid))
      ) or exists (
        select 1
        from pg_locks probe_lock
        join pg_stat_activity activity on activity.pid = probe_lock.pid
        where activity.application_name = 'work-order-child-lock-probe-b'
          and probe_lock.locktype = 'advisory'
          and probe_lock.classid = '782510'::oid
          and probe_lock.objid = '2'::oid
          and probe_lock.objsubid = 2
          and probe_lock.mode = 'ExclusiveLock'
          and probe_lock.granted
      ) then
        return new;
      end if;
      if clock_timestamp() >= v_deadline then
        raise exception 'Timed out waiting for the second child insert.';
      end if;
      perform pg_sleep(0.05);
    end loop;
  elsif v_application_name = 'work-order-child-lock-probe-b' then
    perform pg_advisory_xact_lock(782510, 2);
  end if;
  return new;
end;
$function$;

create trigger aaa_work_order_child_lock_probe
after insert on public.work_order_lines
for each row
execute function public.test_work_order_child_lock_probe();
SQL

psql "$db_url" -X -v ON_ERROR_STOP=1 >"$first_log" 2>&1 <<'SQL' &
select set_config('application_name', 'work-order-child-lock-probe-a', false);
begin;
set local lock_timeout = '12s';
set local statement_timeout = '20s';
insert into public.work_order_lines (
  id, shop_id, work_order_id, complaint, job_type, status,
  line_status, approval_state, urgency
) values (
  'bf250000-0000-4000-8000-000000000001',
  'bc250000-0000-4000-8000-000000000010',
  'be250000-0000-4000-8000-000000000010',
  'First concurrent repair line', 'repair', 'awaiting',
  'pending', 'pending', 'medium'
);
commit;
SQL
first_pid=$!

if ! wait_for_first_probe; then
  echo "First child insert did not reach the concurrency probe." >&2
  first_status=0
  wait "$first_pid" || first_status=$?
  cat "$first_log" >&2
  echo "First insert exit status: $first_status" >&2
  exit 1
fi

psql "$db_url" -X -v ON_ERROR_STOP=1 >"$second_log" 2>&1 <<'SQL' &
select set_config('application_name', 'work-order-child-lock-probe-b', false);
begin;
set local lock_timeout = '12s';
set local statement_timeout = '20s';
insert into public.work_order_lines (
  id, shop_id, work_order_id, complaint, job_type, status,
  line_status, approval_state, urgency
) values (
  'bf250000-0000-4000-8000-000000000002',
  'bc250000-0000-4000-8000-000000000010',
  'be250000-0000-4000-8000-000000000010',
  'Second concurrent repair line', 'repair', 'awaiting',
  'pending', 'pending', 'medium'
);
commit;
SQL
second_pid=$!

set +e
wait "$first_pid"
first_status=$?
wait "$second_pid"
second_status=$?
set -e

if (( first_status != 0 || second_status != 0 )); then
  echo "Concurrent child inserts did not both commit (possible parent lock regression)." >&2
  cat "$first_log" >&2
  cat "$second_log" >&2
  exit 1
fi

line_count="$(psql "$db_url" -X -Atv ON_ERROR_STOP=1 -c "
  select count(*)
  from public.work_order_lines
  where id in (
    'bf250000-0000-4000-8000-000000000001',
    'bf250000-0000-4000-8000-000000000002'
  );
")"
if [[ "$line_count" != "2" ]]; then
  echo "Concurrent child inserts did not both commit: found $line_count rows." >&2
  exit 1
fi

echo "work_order_child_parent_tenant_locking_ok"
