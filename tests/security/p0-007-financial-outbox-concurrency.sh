#!/usr/bin/env bash
set -euo pipefail

: "${DB_URL:?DB_URL is required}"

tmp_dir="$(mktemp -d)"

cleanup() {
  psql "$DB_URL" -X -v ON_ERROR_STOP=1 >/dev/null <<'SQL' || true
delete from public.financial_domain_outbox
where id in (
  'a7000000-0000-4000-8000-000000000011',
  'a7000000-0000-4000-8000-000000000012'
);
update public.profiles
set shop_id = null
where id = '77000000-0000-4000-8000-000000000011';
delete from public.shops where id = 'e7100000-0000-4000-8000-000000000011';
delete from public.profiles where id = '77000000-0000-4000-8000-000000000011';
delete from auth.users where id = '77000000-0000-4000-8000-000000000011';
SQL
  rm -rf "$tmp_dir"
}
trap cleanup EXIT

psql "$DB_URL" -X -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
insert into auth.users (id, email, raw_user_meta_data)
values (
  '77000000-0000-4000-8000-000000000011',
  'p0-007-concurrency@example.com',
  '{"full_name":"P0-007 Concurrency"}'::jsonb
)
on conflict (id) do nothing;

insert into public.profiles (id, user_id, role, full_name, shop_id)
values (
  '77000000-0000-4000-8000-000000000011',
  '77000000-0000-4000-8000-000000000011',
  'owner',
  'P0-007 Concurrency',
  null
)
on conflict (id) do update
set user_id = excluded.user_id,
    role = excluded.role,
    full_name = excluded.full_name,
    shop_id = excluded.shop_id;

insert into public.shops (id, owner_id, business_name, name, user_limit)
values (
  'e7100000-0000-4000-8000-000000000011',
  '77000000-0000-4000-8000-000000000011',
  'P0-007 Concurrency Shop',
  'P0-007 Concurrency Shop',
  3
)
on conflict (id) do nothing;

insert into public.financial_domain_outbox (
  id,
  shop_id,
  aggregate_type,
  aggregate_id,
  event_type,
  dedupe_key,
  payload,
  occurred_at
)
values
  (
    'a7000000-0000-4000-8000-000000000011',
    'e7100000-0000-4000-8000-000000000011',
    'payment_event',
    'b7000000-0000-4000-8000-000000000011',
    'payment.failed',
    'p0-007:concurrent-a',
    '{}'::jsonb,
    now() - interval '2 minutes'
  ),
  (
    'a7000000-0000-4000-8000-000000000012',
    'e7100000-0000-4000-8000-000000000011',
    'payment_event',
    'b7000000-0000-4000-8000-000000000012',
    'payment.failed',
    'p0-007:concurrent-b',
    '{}'::jsonb,
    now() - interval '1 minute'
  )
on conflict (id) do nothing;
SQL

psql "$DB_URL" -X -qAt -v ON_ERROR_STOP=1 >"$tmp_dir/worker-a.txt" <<'SQL' &
begin;
set local role service_role;
select outbox_id
from public.claim_financial_outbox_batch(
  '71000000-0000-4000-8000-000000000011',
  1,
  120
);
select pg_sleep(3);
commit;
SQL
worker_a_pid=$!

sleep 1

psql "$DB_URL" -X -qAt -v ON_ERROR_STOP=1 >"$tmp_dir/worker-b.txt" <<'SQL'
begin;
set local role service_role;
select outbox_id
from public.claim_financial_outbox_batch(
  '72000000-0000-4000-8000-000000000012',
  1,
  120
);
commit;
SQL

wait "$worker_a_pid"

worker_a_row="$(grep -Eo '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' "$tmp_dir/worker-a.txt" | head -n 1)"
worker_b_row="$(grep -Eo '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' "$tmp_dir/worker-b.txt" | head -n 1)"

test -n "$worker_a_row"
test -n "$worker_b_row"
test "$worker_a_row" != "$worker_b_row"
test "$worker_a_row" = "a7000000-0000-4000-8000-000000000011"
test "$worker_b_row" = "a7000000-0000-4000-8000-000000000012"

echo "P0-007 concurrent claims were disjoint: $worker_a_row / $worker_b_row"
