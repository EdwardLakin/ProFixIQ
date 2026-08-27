#!/usr/bin/env bash
set -euo pipefail

db_url="${1:-${DB_URL:-}}"
if [[ -z "$db_url" ]]; then
  echo "DB_URL or a database URL argument is required." >&2
  exit 2
fi
if ! command -v psql >/dev/null 2>&1; then
  echo "psql is required." >&2
  exit 2
fi

probe_dir="$(mktemp -d)"
holder_pid=""
writer_pid=""
cleanup() {
  if [[ -n "$holder_pid" ]]; then
    kill "$holder_pid" 2>/dev/null || true
  fi
  if [[ -n "$writer_pid" ]]; then
    kill "$writer_pid" 2>/dev/null || true
  fi
  rm -r -- "$probe_dir"
}
trap cleanup EXIT

psql "$db_url" -X -v ON_ERROR_STOP=1 <<'SQL'
insert into auth.users (id, email, raw_user_meta_data)
values (
  '77100000-0000-4000-8000-000000000001',
  'inspection-auth-concurrency@example.com',
  '{"full_name":"Inspection Auth Concurrency Owner"}'::jsonb
);

insert into public.profiles (id, user_id, role, full_name)
values (
  '77100000-0000-4000-8000-000000000001',
  '77100000-0000-4000-8000-000000000001',
  'owner',
  'Inspection Auth Concurrency Owner'
);

insert into public.shops (id, owner_id, business_name, name)
values (
  '77300000-0000-4000-8000-000000000001',
  '77100000-0000-4000-8000-000000000001',
  'Inspection Auth Concurrency Shop',
  'Inspection Auth Concurrency Shop'
);

update public.profiles
set shop_id = '77300000-0000-4000-8000-000000000001'
where id = '77100000-0000-4000-8000-000000000001';

insert into public.work_orders (id, shop_id, custom_id, status)
values (
  '77400000-0000-4000-8000-000000000001',
  '77300000-0000-4000-8000-000000000001',
  'INSP-AUTH-CONCURRENCY',
  'in_progress'
);

insert into public.work_order_lines (
  id, shop_id, work_order_id, line_type, status, description
) values
  (
    '77500000-0000-4000-8000-000000000001',
    '77300000-0000-4000-8000-000000000001',
    '77400000-0000-4000-8000-000000000001',
    'job',
    'in_progress',
    'Inspection advisory-lock probe'
  ),
  (
    '77500000-0000-4000-8000-000000000002',
    '77300000-0000-4000-8000-000000000001',
    '77400000-0000-4000-8000-000000000001',
    'job',
    'in_progress',
    'Inspection parent-lock probe'
  );

insert into public.inspections (
  id,
  work_order_id,
  work_order_line_id,
  shop_id,
  user_id,
  summary,
  is_canonical,
  sync_revision,
  is_draft,
  completed,
  locked,
  status,
  updated_at
) values
  (
    '77600000-0000-4000-8000-000000000001',
    '77400000-0000-4000-8000-000000000001',
    '77500000-0000-4000-8000-000000000001',
    '77300000-0000-4000-8000-000000000001',
    '77100000-0000-4000-8000-000000000001',
    '{"syncRevision":0,"lastUpdated":"2026-08-25T21:40:00Z","sections":[],"quote":[]}'::jsonb,
    true,
    0,
    true,
    false,
    false,
    'draft',
    '2026-08-25T21:40:00Z'
  ),
  (
    '77600000-0000-4000-8000-000000000002',
    '77400000-0000-4000-8000-000000000001',
    '77500000-0000-4000-8000-000000000002',
    '77300000-0000-4000-8000-000000000001',
    '77100000-0000-4000-8000-000000000001',
    '{"syncRevision":1,"lastUpdated":"2026-08-25T21:40:00Z","sections":[],"quote":[]}'::jsonb,
    true,
    1,
    false,
    true,
    true,
    'completed',
    '2026-08-25T21:40:00Z'
  );

insert into public.inspection_signatures (
  inspection_id,
  role,
  signed_by,
  signed_name,
  signing_cycle,
  signed_sync_revision,
  signed_at
) values (
  '77600000-0000-4000-8000-000000000002',
  'technician',
  '77100000-0000-4000-8000-000000000001',
  'Inspection Auth Concurrency Owner',
  0,
  1,
  '2026-08-25T21:40:00Z'
);
SQL

psql "$db_url" -X -v ON_ERROR_STOP=1 >"$probe_dir/holder.log" 2>&1 <<'SQL' &
begin;
select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended(
    '77300000-0000-4000-8000-000000000001:save_inspection_progress:inspection-auth:concurrent-save',
    0
  )
);
select pg_sleep(8);
commit;
SQL
holder_pid="$!"

holder_ready="false"
for _ in $(seq 1 50); do
  if [[ "$(psql "$db_url" -X -Atv ON_ERROR_STOP=1 -c "
    select not pg_catalog.pg_try_advisory_xact_lock(
      pg_catalog.hashtextextended(
        '77300000-0000-4000-8000-000000000001:save_inspection_progress:inspection-auth:concurrent-save',
        0
      )
    );
  ")" == "t" ]]; then
    holder_ready="true"
    break
  fi
  sleep 0.1
done
if [[ "$holder_ready" != "true" ]]; then
  echo "Advisory-lock holder did not reach the inspection save window." >&2
  cat "$probe_dir/holder.log" >&2 || true
  exit 1
fi

psql "$db_url" -X -v ON_ERROR_STOP=1 >"$probe_dir/writer.log" 2>&1 <<'SQL' &
begin;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select public.save_inspection_progress_v3_atomic(
  '77300000-0000-4000-8000-000000000001',
  '77500000-0000-4000-8000-000000000001',
  '77100000-0000-4000-8000-000000000001',
  '{"syncRevision":0,"lastUpdated":"2026-08-25T21:41:00Z","sections":[],"quote":[]}'::jsonb,
  'inspection-auth:concurrent-save',
  '2026-08-25T21:41:00Z'
);
commit;
SQL
writer_pid="$!"

writer_waited="false"
for _ in $(seq 1 50); do
  if [[ "$(psql "$db_url" -X -Atv ON_ERROR_STOP=1 -c "
    select exists (
      select 1
      from pg_catalog.pg_stat_activity activity
      where activity.pid <> pg_catalog.pg_backend_pid()
        and activity.query like '%inspection-auth:concurrent-save%'
        and activity.wait_event_type = 'Lock'
        and activity.wait_event = 'advisory'
    );
  ")" == "t" ]]; then
    writer_waited="true"
    break
  fi
  sleep 0.1
done
if [[ "$writer_waited" != "true" ]]; then
  echo "Inspection writer did not wait on the tenant-scoped operation lock." >&2
  cat "$probe_dir/holder.log" >&2 || true
  cat "$probe_dir/writer.log" >&2 || true
  exit 1
fi

wait "$holder_pid"
holder_pid=""
wait "$writer_pid"
writer_pid=""

psql "$db_url" -X -v ON_ERROR_STOP=1 <<'SQL'
begin;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

do $inspection_save_retry$
declare
  v_retry jsonb;
begin
  v_retry := public.save_inspection_progress_v3_atomic(
    '77300000-0000-4000-8000-000000000001',
    '77500000-0000-4000-8000-000000000001',
    '77100000-0000-4000-8000-000000000001',
    '{"syncRevision":0,"lastUpdated":"2026-08-25T21:41:00Z","sections":[],"quote":[]}'::jsonb,
    'inspection-auth:concurrent-save',
    '2026-08-25T21:41:00Z'
  );
  if not coalesce((v_retry ->> 'idempotent')::boolean, false) then
    raise exception 'Serialized inspection save retry was not idempotent: %', v_retry;
  end if;
end
$inspection_save_retry$;

reset role;
do $inspection_save_concurrency_result$
begin
  if (
    select count(*)
    from public.mobile_operation_keys receipt
    where receipt.shop_id = '77300000-0000-4000-8000-000000000001'
      and receipt.operation_name = 'save_inspection_progress'
      and receipt.operation_key = 'inspection-auth:concurrent-save'
  ) <> 1 then
    raise exception 'Concurrent inspection save created a duplicate or missing receipt.';
  end if;
  if (
    select inspection.sync_revision
    from public.inspections inspection
    where inspection.id = '77600000-0000-4000-8000-000000000001'
  ) <> 1 then
    raise exception 'Concurrent inspection save applied the snapshot more than once.';
  end if;
end
$inspection_save_concurrency_result$;
commit;
SQL

run_parent_lock_probe() {
  local operation="$1"
  local writer_sql="$2"
  local inspection_id="77600000-0000-4000-8000-000000000002"
  local holder_app="inspection-${operation}-holder"
  local writer_app="inspection-${operation}-writer"

  PGAPPNAME="$holder_app" psql "$db_url" -X -v ON_ERROR_STOP=1 \
    >"$probe_dir/${operation}-holder.log" 2>&1 <<'SQL' &
begin;
select 1
from public.work_orders
where id = '77400000-0000-4000-8000-000000000001'
for update;
select pg_sleep(8);
commit;
SQL
  holder_pid="$!"

  local holder_ready="false"
  for _ in $(seq 1 50); do
    if [[ "$(psql "$db_url" -X -Atv ON_ERROR_STOP=1 -c "
      select exists (
        select 1
        from pg_catalog.pg_stat_activity
        where application_name = '$holder_app'
          and state = 'active'
          and query like '%pg_sleep%'
      );
    ")" == "t" ]]; then
      holder_ready="true"
      break
    fi
    sleep 0.1
  done
  if [[ "$holder_ready" != "true" ]]; then
    echo "${operation} Work Order lock holder did not become ready." >&2
    cat "$probe_dir/${operation}-holder.log" >&2 || true
    exit 1
  fi

  PGAPPNAME="$writer_app" psql "$db_url" -X -v ON_ERROR_STOP=1 \
    >"$probe_dir/${operation}-writer.log" 2>&1 <<<"$writer_sql" &
  writer_pid="$!"

  local writer_waited="false"
  for _ in $(seq 1 50); do
    if [[ "$(psql "$db_url" -X -Atv ON_ERROR_STOP=1 -c "
      select exists (
        select 1
        from pg_catalog.pg_stat_activity writer
        join pg_catalog.pg_stat_activity holder
          on holder.application_name = '$holder_app'
        where writer.application_name = '$writer_app'
          and holder.pid = any(pg_catalog.pg_blocking_pids(writer.pid))
      );
    ")" == "t" ]]; then
      writer_waited="true"
      break
    fi
    sleep 0.1
  done
  if [[ "$writer_waited" != "true" ]]; then
    echo "${operation} did not wait on the canonical Work Order lock." >&2
    cat "$probe_dir/${operation}-holder.log" >&2 || true
    cat "$probe_dir/${operation}-writer.log" >&2 || true
    exit 1
  fi

  # A parent-first writer waiting on the Work Order must not already own the
  # inspection row. The historical inspection-first order fails this NOWAIT
  # probe and can deadlock against autosave's Work Order -> inspection order.
  psql "$db_url" -X -v ON_ERROR_STOP=1 <<SQL
begin;
select 1
from public.inspections
where id = '$inspection_id'
for update nowait;
rollback;
SQL

  wait "$holder_pid"
  holder_pid=""
  wait "$writer_pid"
  writer_pid=""
}

run_parent_lock_probe "attach" "
begin;
set local role service_role;
select set_config('request.jwt.claims', '{\"role\":\"service_role\"}', true);
select public.attach_signed_inspection_pdf_atomic(
  '77600000-0000-4000-8000-000000000002',
  '77500000-0000-4000-8000-000000000002',
  '77100000-0000-4000-8000-000000000001',
  1,
  'shops/77300000-0000-4000-8000-000000000001/work_orders/77400000-0000-4000-8000-000000000001/inspections/77600000-0000-4000-8000-000000000002/line_77500000-0000-4000-8000-000000000002_r1_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.pdf',
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  '/api/inspections/77600000-0000-4000-8000-000000000002/report/pdf'
);
commit;
"

psql "$db_url" -X -v ON_ERROR_STOP=1 <<'SQL'
do $inspection_attach_parent_lock_result$
begin
  if not exists (
    select 1
    from public.inspections inspection
    join public.work_orders work_order
      on work_order.id = inspection.work_order_id
     and work_order.shop_id = inspection.shop_id
    where inspection.id = '77600000-0000-4000-8000-000000000002'
      and inspection.pdf_sha256 = repeat('a', 64)
      and work_order.inspection_id = inspection.id
      and work_order.inspection_pdf_url = '/api/inspections/77600000-0000-4000-8000-000000000002/report/pdf'
  ) then
    raise exception 'Parent-first PDF attachment did not persist its report link.';
  end if;
end
$inspection_attach_parent_lock_result$;
SQL

run_parent_lock_probe "reopen" "
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{\"sub\":\"77100000-0000-4000-8000-000000000001\",\"role\":\"authenticated\"}',
  true
);
select public.reopen_inspection(
  '77600000-0000-4000-8000-000000000002',
  'Parent-lock concurrency regression'
);
commit;
"

psql "$db_url" -X -v ON_ERROR_STOP=1 <<'SQL'
do $inspection_reopen_parent_lock_result$
begin
  if not exists (
    select 1
    from public.inspections inspection
    join public.work_orders work_order
      on work_order.id = inspection.work_order_id
     and work_order.shop_id = inspection.shop_id
    where inspection.id = '77600000-0000-4000-8000-000000000002'
      and inspection.signing_cycle = 1
      and not inspection.locked
      and not inspection.completed
      and inspection.is_draft
      and inspection.pdf_storage_path is null
      and inspection.pdf_sha256 is null
      and inspection.pdf_url is null
      and work_order.inspection_id is null
      and work_order.inspection_pdf_url is null
  ) then
    raise exception 'Parent-first inspection reopen did not clear immutable report linkage.';
  end if;
end
$inspection_reopen_parent_lock_result$;
SQL

echo "Inspection write authorization advisory and parent-lock concurrency probes: PASS"
