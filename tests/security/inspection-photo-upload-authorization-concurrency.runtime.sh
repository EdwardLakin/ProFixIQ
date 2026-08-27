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
begin;

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '78100000-0000-4000-8000-000000000001',
    'inspection-photo-race-owner@example.com',
    '{"full_name":"Inspection Photo Race Owner"}'::jsonb
  ),
  (
    '78100000-0000-4000-8000-000000000002',
    'inspection-photo-race-tech@example.com',
    '{"full_name":"Inspection Photo Race Tech"}'::jsonb
  ),
  (
    '78100000-0000-4000-8000-000000000003',
    'inspection-photo-race-replacement@example.com',
    '{"full_name":"Inspection Photo Race Replacement"}'::jsonb
  );

insert into public.profiles (id, user_id, role, full_name)
values
  (
    '78100000-0000-4000-8000-000000000001',
    '78100000-0000-4000-8000-000000000001',
    'owner',
    'Inspection Photo Race Owner'
  ),
  (
    '78100000-0000-4000-8000-000000000002',
    '78100000-0000-4000-8000-000000000002',
    'mechanic',
    'Inspection Photo Race Tech'
  ),
  (
    '78100000-0000-4000-8000-000000000003',
    '78100000-0000-4000-8000-000000000003',
    'mechanic',
    'Inspection Photo Race Replacement'
  );

insert into public.shops (id, owner_id, business_name, name)
values (
  '78300000-0000-4000-8000-000000000001',
  '78100000-0000-4000-8000-000000000001',
  'Inspection Photo Race Shop',
  'Inspection Photo Race Shop'
);

update public.profiles
set shop_id = '78300000-0000-4000-8000-000000000001'
where id in (
  '78100000-0000-4000-8000-000000000001',
  '78100000-0000-4000-8000-000000000002',
  '78100000-0000-4000-8000-000000000003'
);

insert into public.work_orders (id, shop_id, custom_id, status)
values (
  '78400000-0000-4000-8000-000000000001',
  '78300000-0000-4000-8000-000000000001',
  'INSP-PHOTO-RACE',
  'in_progress'
);

insert into public.work_order_lines (
  id,
  shop_id,
  work_order_id,
  line_type,
  status,
  description,
  assigned_tech_id
) values (
  '78500000-0000-4000-8000-000000000001',
  '78300000-0000-4000-8000-000000000001',
  '78400000-0000-4000-8000-000000000001',
  'job',
  'in_progress',
  'Inspection photo authorization race',
  '78100000-0000-4000-8000-000000000002'
);

insert into public.work_order_line_technicians (
  work_order_line_id,
  technician_id,
  assigned_by
) values (
  '78500000-0000-4000-8000-000000000001',
  '78100000-0000-4000-8000-000000000002',
  '78100000-0000-4000-8000-000000000001'
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
  status
) values (
  '78600000-0000-4000-8000-000000000001',
  '78400000-0000-4000-8000-000000000001',
  '78500000-0000-4000-8000-000000000001',
  '78300000-0000-4000-8000-000000000001',
  '78100000-0000-4000-8000-000000000002',
  '{"syncRevision":1,"sections":[],"quote":[]}'::jsonb,
  true,
  1,
  true,
  false,
  false,
  'draft'
);

insert into storage.buckets (id, name, public)
values ('job-photos', 'job-photos', true)
on conflict (id) do nothing;

commit;
SQL

wait_for_holder() {
  local app_name="$1"
  local ready="false"
  for _ in $(seq 1 60); do
    if [[ "$(psql "$db_url" -X -Atv ON_ERROR_STOP=1 -c "
      select exists (
        select 1
        from pg_catalog.pg_stat_activity
        where application_name = '$app_name'
          and state = 'active'
          and query like '%pg_sleep%'
      );
    ")" == "t" ]]; then
      ready="true"
      break
    fi
    sleep 0.1
  done
  if [[ "$ready" != "true" ]]; then
    echo "Photo authorization race holder did not become ready: $app_name" >&2
    exit 1
  fi
}

wait_for_blocker() {
  local holder_app="$1"
  local writer_app="$2"
  local blocked="false"
  for _ in $(seq 1 60); do
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
      blocked="true"
      break
    fi
    sleep 0.1
  done
  if [[ "$blocked" != "true" ]]; then
    echo "Photo upload did not wait for the committed authorization change." >&2
    cat "$probe_dir/${writer_app}.log" >&2 || true
    exit 1
  fi
}

start_upload() {
  local writer_app="$1"
  local object_id="$2"
  local suffix="$3"
  PGAPPNAME="$writer_app" psql "$db_url" -X -v ON_ERROR_STOP=1 \
    >"$probe_dir/${writer_app}.log" 2>&1 <<SQL &
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"78100000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
insert into storage.objects (id, bucket_id, name, owner, owner_id, metadata)
values (
  '$object_id',
  'job-photos',
  'wo/78400000-0000-4000-8000-000000000001/lines/78500000-0000-4000-8000-000000000001/ip-${suffix}_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg',
  '78100000-0000-4000-8000-000000000002',
  '78100000-0000-4000-8000-000000000002',
  '{"mimetype":"image/jpeg","size":17}'::jsonb
);
commit;
SQL
  writer_pid="$!"
}

assert_upload_denied() {
  local label="$1"
  if wait "$writer_pid"; then
    writer_pid=""
    echo "Photo upload survived a committed ${label}." >&2
    exit 1
  fi
  writer_pid=""
}

PGAPPNAME="inspection-photo-reassignment-holder" \
  psql "$db_url" -X -v ON_ERROR_STOP=1 \
  >"$probe_dir/reassignment-holder.log" 2>&1 <<'SQL' &
begin;
update public.work_order_lines
set assigned_tech_id = '78100000-0000-4000-8000-000000000003'
where id = '78500000-0000-4000-8000-000000000001';
delete from public.work_order_line_technicians
where work_order_line_id = '78500000-0000-4000-8000-000000000001';
insert into public.work_order_line_technicians (
  work_order_line_id,
  technician_id,
  assigned_by
) values (
  '78500000-0000-4000-8000-000000000001',
  '78100000-0000-4000-8000-000000000003',
  '78100000-0000-4000-8000-000000000001'
);
select pg_sleep(8);
commit;
SQL
holder_pid="$!"
wait_for_holder "inspection-photo-reassignment-holder"
start_upload \
  "inspection-photo-reassignment-writer" \
  "78800000-0000-4000-8000-000000000001" \
  "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
wait_for_blocker \
  "inspection-photo-reassignment-holder" \
  "inspection-photo-reassignment-writer"
wait "$holder_pid"
holder_pid=""
assert_upload_denied "technician reassignment"

psql "$db_url" -X -v ON_ERROR_STOP=1 <<'SQL'
begin;

do $inspection_photo_reassignment_result$
begin
  if exists (
    select 1 from storage.objects
    where id = '78800000-0000-4000-8000-000000000001'
  ) or exists (
    select 1 from public.work_order_media
    where storage_path like '%/ip-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb_%'
  ) or exists (
    select 1 from public.inspection_photos
    where image_url like '%/ip-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb_%'
  ) then
    raise exception 'Photo upload survived a committed technician reassignment.';
  end if;
end
$inspection_photo_reassignment_result$;

update public.work_order_lines
set assigned_tech_id = '78100000-0000-4000-8000-000000000002'
where id = '78500000-0000-4000-8000-000000000001';
delete from public.work_order_line_technicians
where work_order_line_id = '78500000-0000-4000-8000-000000000001';
insert into public.work_order_line_technicians (
  work_order_line_id,
  technician_id,
  assigned_by
) values (
  '78500000-0000-4000-8000-000000000001',
  '78100000-0000-4000-8000-000000000002',
  '78100000-0000-4000-8000-000000000001'
);

commit;
SQL

PGAPPNAME="inspection-photo-capability-holder" \
  psql "$db_url" -X -v ON_ERROR_STOP=1 \
  >"$probe_dir/capability-holder.log" 2>&1 <<'SQL' &
begin;
select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended(
    'workspace-authorization:78300000-0000-4000-8000-000000000001:work_order.inspection.run',
    0
  )
);
insert into public.staff_capability_overrides (
  shop_id,
  profile_id,
  capability_key,
  effect,
  changed_by_profile_id
) values (
  '78300000-0000-4000-8000-000000000001',
  '78100000-0000-4000-8000-000000000002',
  'work_order.inspection.run',
  'deny',
  '78100000-0000-4000-8000-000000000001'
)
on conflict (shop_id, profile_id, capability_key) do update
set effect = excluded.effect,
    changed_by_profile_id = excluded.changed_by_profile_id,
    updated_at = now();
select pg_sleep(8);
commit;
SQL
holder_pid="$!"
wait_for_holder "inspection-photo-capability-holder"
start_upload \
  "inspection-photo-capability-writer" \
  "78800000-0000-4000-8000-000000000002" \
  "cccccccccccccccccccccccccccccccccccccccc"
wait_for_blocker \
  "inspection-photo-capability-holder" \
  "inspection-photo-capability-writer"
wait "$holder_pid"
holder_pid=""
assert_upload_denied "capability deny"

psql "$db_url" -X -v ON_ERROR_STOP=1 <<'SQL'
do $inspection_photo_capability_result$
begin
  if exists (
    select 1 from storage.objects
    where id = '78800000-0000-4000-8000-000000000002'
  ) or exists (
    select 1 from public.work_order_media
    where storage_path like '%/ip-cccccccccccccccccccccccccccccccccccccccc_%'
  ) or exists (
    select 1 from public.inspection_photos
    where image_url like '%/ip-cccccccccccccccccccccccccccccccccccccccc_%'
  ) then
    raise exception 'Photo upload survived a committed capability deny.';
  end if;
end
$inspection_photo_capability_result$;

delete from public.staff_capability_overrides
where shop_id = '78300000-0000-4000-8000-000000000001';
delete from public.inspections
where id = '78600000-0000-4000-8000-000000000001';
delete from public.work_order_lines
where id = '78500000-0000-4000-8000-000000000001';
delete from public.work_orders
where id = '78400000-0000-4000-8000-000000000001';
update public.profiles
set shop_id = null
where id in (
  '78100000-0000-4000-8000-000000000001',
  '78100000-0000-4000-8000-000000000002',
  '78100000-0000-4000-8000-000000000003'
);
delete from public.shops
where id = '78300000-0000-4000-8000-000000000001';
delete from public.profiles
where id in (
  '78100000-0000-4000-8000-000000000001',
  '78100000-0000-4000-8000-000000000002',
  '78100000-0000-4000-8000-000000000003'
);
delete from auth.users
where id in (
  '78100000-0000-4000-8000-000000000001',
  '78100000-0000-4000-8000-000000000002',
  '78100000-0000-4000-8000-000000000003'
);
SQL

echo "Inspection photo upload authorization concurrency probes: PASS"
