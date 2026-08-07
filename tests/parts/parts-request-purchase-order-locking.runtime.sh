#!/usr/bin/env bash
set -euo pipefail

# @regression-flow parts.request-to-po
# The first pair models canonical receiving's PO -> request-item lock order
# against the real ordering wrapper. The second pair locks a PO in a header
# editor before changing its supplier while the wrapper serializes on that
# supplier. Both pairs would deadlock with the former incompatible lock modes.

db_url="${1:-${DB_URL:-}}"
if [[ -z "$db_url" ]]; then
  echo "Usage: $0 <postgres-url> (or set DB_URL)" >&2
  exit 64
fi

probe_dir="$(mktemp -d)"
receiver_log="$probe_dir/receiver.log"
ordering_log="$probe_dir/ordering.log"
header_editor_log="$probe_dir/header-editor.log"
supplier_ordering_log="$probe_dir/supplier-ordering.log"

cleanup() {
  set +e
  psql "$db_url" -X -v ON_ERROR_STOP=1 >/dev/null 2>&1 <<'SQL'
delete from public.parts_lifecycle_operations
where shop_id = '76a00000-0000-4000-8000-000000000001';
delete from public.purchase_order_lines
where po_id in (
  '76d00000-0000-4000-8000-000000000001',
  '76d00000-0000-4000-8000-000000000002'
);
delete from public.work_order_parts
where source_parts_request_item_id in (
  '76500000-0000-4000-8000-000000000001',
  '76500000-0000-4000-8000-000000000002'
);
delete from public.part_request_items
where id in (
  '76500000-0000-4000-8000-000000000001',
  '76500000-0000-4000-8000-000000000002'
);
delete from public.part_requests
where id in (
  '76400000-0000-4000-8000-000000000001',
  '76400000-0000-4000-8000-000000000002'
);
delete from public.purchase_orders
where id in (
  '76d00000-0000-4000-8000-000000000001',
  '76d00000-0000-4000-8000-000000000002'
);
delete from public.work_order_lines
where id = '76f00000-0000-4000-8000-000000000001';
delete from public.work_orders
where id = '76e00000-0000-4000-8000-000000000001';
delete from public.suppliers
where id in (
  '76c00000-0000-4000-8000-000000000001',
  '76c00000-0000-4000-8000-000000000002'
);
update public.profiles
set shop_id = null
where id = '76100000-0000-4000-8000-000000000001';
delete from public.shops
where id = '76a00000-0000-4000-8000-000000000001';
delete from public.profiles
where id = '76100000-0000-4000-8000-000000000001';
delete from auth.users
where id = '76100000-0000-4000-8000-000000000001';
SQL
  rm -rf -- "$probe_dir"
}
trap cleanup EXIT

psql "$db_url" -X -v ON_ERROR_STOP=1 <<'SQL'
insert into auth.users (id, email, raw_user_meta_data)
values (
  '76100000-0000-4000-8000-000000000001',
  'parts-lock-probe@example.com',
  '{"full_name":"Parts Lock Probe"}'::jsonb
);

insert into public.profiles (id, user_id, role, full_name)
values (
  '76100000-0000-4000-8000-000000000001',
  '76100000-0000-4000-8000-000000000001',
  'parts',
  'Parts Lock Probe'
);

insert into public.shops (id, owner_id, business_name, name)
values (
  '76a00000-0000-4000-8000-000000000001',
  '76100000-0000-4000-8000-000000000001',
  'Parts PO Lock Probe',
  'Parts PO Lock Probe'
);

update public.profiles
set shop_id = '76a00000-0000-4000-8000-000000000001'
where id = '76100000-0000-4000-8000-000000000001';

insert into public.suppliers (id, shop_id, name)
values
  (
    '76c00000-0000-4000-8000-000000000001',
    '76a00000-0000-4000-8000-000000000001',
    'Parts Lock Probe Supplier'
  ),
  (
    '76c00000-0000-4000-8000-000000000002',
    '76a00000-0000-4000-8000-000000000001',
    'Parts Header FK Probe Supplier'
  );

insert into public.purchase_orders (id, shop_id, supplier_id, status, notes)
values
  (
    '76d00000-0000-4000-8000-000000000001',
    '76a00000-0000-4000-8000-000000000001',
    '76c00000-0000-4000-8000-000000000001',
    'draft',
    'PO-first concurrency fixture'
  ),
  (
    '76d00000-0000-4000-8000-000000000002',
    '76a00000-0000-4000-8000-000000000001',
    '76c00000-0000-4000-8000-000000000001',
    'draft',
    'Supplier FK concurrency fixture'
  );

insert into public.work_orders (id, shop_id, status, type)
values (
  '76e00000-0000-4000-8000-000000000001',
  '76a00000-0000-4000-8000-000000000001',
  'in_progress',
  'repair'
);

insert into public.work_order_lines (
  id,
  work_order_id,
  shop_id,
  status,
  approval_state
) values (
  '76f00000-0000-4000-8000-000000000001',
  '76e00000-0000-4000-8000-000000000001',
  '76a00000-0000-4000-8000-000000000001',
  'active',
  'approved'
);

insert into public.part_requests (
  id,
  shop_id,
  work_order_id,
  job_id,
  status,
  notes
) values
  (
    '76400000-0000-4000-8000-000000000001',
    '76a00000-0000-4000-8000-000000000001',
    '76e00000-0000-4000-8000-000000000001',
    '76f00000-0000-4000-8000-000000000001',
    'approved',
    'PO-first concurrency fixture'
  ),
  (
    '76400000-0000-4000-8000-000000000002',
    '76a00000-0000-4000-8000-000000000001',
    '76e00000-0000-4000-8000-000000000001',
    '76f00000-0000-4000-8000-000000000001',
    'approved',
    'Supplier FK concurrency fixture'
  );

insert into public.part_request_items (
  id,
  request_id,
  shop_id,
  work_order_id,
  work_order_line_id,
  part_id,
  vendor_id,
  description,
  requested_part_number,
  qty,
  qty_requested,
  qty_approved,
  unit_cost,
  unit_price,
  quoted_price,
  approved,
  status
) values
  (
    '76500000-0000-4000-8000-000000000001',
    '76400000-0000-4000-8000-000000000001',
    '76a00000-0000-4000-8000-000000000001',
    '76e00000-0000-4000-8000-000000000001',
    '76f00000-0000-4000-8000-000000000001',
    null,
    '76c00000-0000-4000-8000-000000000001',
    'PO-first free-text concurrency fixture',
    'LOCK-PROBE',
    1,
    1,
    1,
    80,
    80,
    80,
    true,
    'approved'
  ),
  (
    '76500000-0000-4000-8000-000000000002',
    '76400000-0000-4000-8000-000000000002',
    '76a00000-0000-4000-8000-000000000001',
    '76e00000-0000-4000-8000-000000000001',
    '76f00000-0000-4000-8000-000000000001',
    null,
    '76c00000-0000-4000-8000-000000000002',
    'Supplier FK free-text concurrency fixture',
    'SUPPLIER-LOCK-PROBE',
    1,
    1,
    1,
    80,
    80,
    80,
    true,
    'approved'
  );
SQL

psql "$db_url" -X -v ON_ERROR_STOP=1 >"$receiver_log" 2>&1 <<'SQL' &
select set_config(
  'application_name',
  'parts-po-lock-probe-receiver',
  false
);
begin;
set local lock_timeout = '8s';
set local statement_timeout = '15s';
set local deadlock_timeout = '250ms';
select id
from public.purchase_orders
where id = '76d00000-0000-4000-8000-000000000001'
for update;
select pg_sleep(5);
select id
from public.part_request_items
where id = '76500000-0000-4000-8000-000000000001'
for update;
rollback;
SQL
receiver_pid=$!

receiver_ready=false
for _ in $(seq 1 100); do
  if [[ "$(psql "$db_url" -X -Atc "select count(*) from pg_stat_activity where application_name = 'parts-po-lock-probe-receiver' and state = 'active' and query like '%pg_sleep(5)%'")" == "1" ]]; then
    receiver_ready=true
    break
  fi
  sleep 0.05
done

if [[ "$receiver_ready" != "true" ]]; then
  echo "Receiver session did not reach the PO-held concurrency window." >&2
  wait "$receiver_pid" || true
  exit 1
fi

psql "$db_url" -X -v ON_ERROR_STOP=1 >"$ordering_log" 2>&1 <<'SQL' &
select set_config(
  'application_name',
  'parts-po-lock-probe-ordering',
  false
);
begin;
set local lock_timeout = '8s';
set local statement_timeout = '15s';
set local deadlock_timeout = '250ms';
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  '76100000-0000-4000-8000-000000000001',
  true
);
set local role authenticated;
select public.parts_create_or_reuse_po_line_for_request(
  p_request_item_id := '76500000-0000-4000-8000-000000000001',
  p_qty := 1,
  p_idempotency_key :=
    '76a00000-0000-4000-8000-000000000001:parts-order:lock-probe',
  p_po_id := '76d00000-0000-4000-8000-000000000001',
  p_unit_cost := 40
);
commit;
SQL
ordering_pid=$!

set +e
wait "$receiver_pid"
receiver_status=$?
wait "$ordering_pid"
ordering_status=$?
set -e

if (( receiver_status != 0 || ordering_status != 0 )); then
  echo "PO/request-item concurrency probe failed (possible lock-order regression)." >&2
  cat "$receiver_log" >&2
  cat "$ordering_log" >&2
  exit 1
fi

psql "$db_url" -X -v ON_ERROR_STOP=1 >"$header_editor_log" 2>&1 <<'SQL' &
select set_config(
  'application_name',
  'parts-po-lock-probe-header-editor',
  false
);
begin;
set local lock_timeout = '8s';
set local statement_timeout = '15s';
set local deadlock_timeout = '250ms';
select id
from public.purchase_orders
where id = '76d00000-0000-4000-8000-000000000002'
for update;
select pg_sleep(5);
update public.purchase_orders
set supplier_id = '76c00000-0000-4000-8000-000000000002'
where id = '76d00000-0000-4000-8000-000000000002';
commit;
SQL
header_editor_pid=$!

header_editor_ready=false
for _ in $(seq 1 100); do
  if [[ "$(psql "$db_url" -X -Atc "select count(*) from pg_stat_activity where application_name = 'parts-po-lock-probe-header-editor' and state = 'active' and query like '%pg_sleep(5)%'")" == "1" ]]; then
    header_editor_ready=true
    break
  fi
  sleep 0.05
done

if [[ "$header_editor_ready" != "true" ]]; then
  echo "Header editor did not reach the PO-held supplier-FK window." >&2
  wait "$header_editor_pid" || true
  exit 1
fi

psql "$db_url" -X -v ON_ERROR_STOP=1 >"$supplier_ordering_log" 2>&1 <<'SQL' &
select set_config(
  'application_name',
  'parts-po-lock-probe-supplier-ordering',
  false
);
begin;
set local lock_timeout = '8s';
set local statement_timeout = '15s';
set local deadlock_timeout = '250ms';
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  '76100000-0000-4000-8000-000000000001',
  true
);
set local role authenticated;
select public.parts_create_or_reuse_po_line_for_request(
  p_request_item_id := '76500000-0000-4000-8000-000000000002',
  p_qty := 1,
  p_idempotency_key :=
    '76a00000-0000-4000-8000-000000000001:parts-order:supplier-lock-probe',
  p_po_id := '76d00000-0000-4000-8000-000000000002',
  p_supplier_id := '76c00000-0000-4000-8000-000000000002',
  p_unit_cost := 40
);
commit;
SQL
supplier_ordering_pid=$!

set +e
wait "$header_editor_pid"
header_editor_status=$?
wait "$supplier_ordering_pid"
supplier_ordering_status=$?
set -e

if (( header_editor_status != 0 || supplier_ordering_status != 0 )); then
  echo "Supplier/PO FK concurrency probe failed (possible lock-mode regression)." >&2
  cat "$header_editor_log" >&2
  cat "$supplier_ordering_log" >&2
  exit 1
fi

psql "$db_url" -X -v ON_ERROR_STOP=1 <<'SQL'
do $assert_lock_probe$
begin
  if (
    select count(*)
    from public.purchase_order_lines line
    where line.po_id = '76d00000-0000-4000-8000-000000000001'
      and line.part_request_item_id =
        '76500000-0000-4000-8000-000000000001'
      and line.qty = 1
      and line.unit_cost = 40
  ) <> 1 or not exists (
    select 1
    from public.part_request_items item
    where item.id = '76500000-0000-4000-8000-000000000001'
      and item.po_id = '76d00000-0000-4000-8000-000000000001'
      and item.qty_ordered = 1
      and item.status = 'ordered'
  ) then
    raise exception
      'Parts PO lock-order regression: concurrent ordering did not commit exactly once.';
  end if;
  if not exists (
    select 1
    from public.purchase_orders purchase_order
    join public.purchase_order_lines line
      on line.po_id = purchase_order.id
    join public.part_request_items item
      on item.id = line.part_request_item_id
    where purchase_order.id = '76d00000-0000-4000-8000-000000000002'
      and purchase_order.supplier_id =
        '76c00000-0000-4000-8000-000000000002'
      and line.part_request_item_id =
        '76500000-0000-4000-8000-000000000002'
      and line.qty = 1
      and line.unit_cost = 40
      and item.po_id = purchase_order.id
      and item.qty_ordered = 1
      and item.status = 'ordered'
  ) then
    raise exception
      'Parts supplier/PO lock regression: header edit and ordering did not both commit.';
  end if;
end
$assert_lock_probe$;
SQL

echo "Parts request-to-PO lock-order concurrency probe: PASS"
