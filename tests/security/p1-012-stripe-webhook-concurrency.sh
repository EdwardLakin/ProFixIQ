#!/usr/bin/env bash
set -euo pipefail

: "${DB_URL:?DB_URL is required}"

tmp_dir="$(mktemp -d)"

cleanup() {
  psql "$DB_URL" -X -v ON_ERROR_STOP=1 >/dev/null <<'SQL' || true
delete from private.stripe_webhook_event_receipts
where event_id = 'evt_p1012_concurrent';
SQL
  rm -rf "$tmp_dir"
}
trap cleanup EXIT

psql "$DB_URL" -X -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
delete from private.stripe_webhook_event_receipts
where event_id = 'evt_p1012_concurrent';
SQL

psql "$DB_URL" -X -qAt -F '|' -v ON_ERROR_STOP=1 >"$tmp_dir/worker-a.txt" <<'SQL' &
begin;
set local role service_role;
select claimed, already_processed, in_progress, attempt_count
from public.claim_stripe_webhook_event(
  'evt_p1012_concurrent',
  'customer.subscription.updated',
  true,
  '',
  'sub_p1012concurrent',
  '2026-07-27T02:00:00Z'::timestamptz,
  300
);
select pg_sleep(3);
commit;
SQL
worker_a_pid=$!

sleep 1

psql "$DB_URL" -X -qAt -F '|' -v ON_ERROR_STOP=1 >"$tmp_dir/worker-b.txt" <<'SQL'
begin;
set local role service_role;
select claimed, already_processed, in_progress, attempt_count
from public.claim_stripe_webhook_event(
  'evt_p1012_concurrent',
  'customer.subscription.updated',
  true,
  '',
  'sub_p1012concurrent',
  '2026-07-27T02:00:00Z'::timestamptz,
  300
);
commit;
SQL

wait "$worker_a_pid"

worker_a_result="$(grep -E '^[tf]\|[tf]\|[tf]\|[0-9]+$' "$tmp_dir/worker-a.txt" | head -n 1)"
worker_b_result="$(grep -E '^[tf]\|[tf]\|[tf]\|[0-9]+$' "$tmp_dir/worker-b.txt" | head -n 1)"

test "$worker_a_result" = "t|f|f|1"
test "$worker_b_result" = "f|f|t|1"

echo "P1-012 concurrent webhook delivery produced one claim: $worker_a_result / $worker_b_result"
