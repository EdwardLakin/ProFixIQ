#!/usr/bin/env bash
set -euo pipefail
: "${DB_URL:?Provide the disposable test database URL}"
feedback_test_dir="$(mktemp -d)"
feedback_cluster="6f400000-0000-4000-8000-000000000001"
cleanup() {
  psql "$DB_URL" -X -v ON_ERROR_STOP=1 -c "delete from public.agent_requests where id = '$feedback_cluster' or normalized_json->>'submissionKey' like 'feedback-concurrency-%'" >/dev/null
  rm -rf "$feedback_test_dir"
}
trap cleanup EXIT
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -c "insert into public.agent_requests(id, description) values ('$feedback_cluster', 'Concurrency fixture')" >/dev/null
payload() {
  cat <<SQL
select public.submit_feedback(jsonb_build_object(
 'reporterAuthId','6f100000-0000-4000-8000-000000000009','profileId',null,'shopId',null,'role','customer',
 'submissionKey','$1','description','Concurrent feedback','intent','bug_report','context','{}'::jsonb,
 'feedback',jsonb_build_object('version',1,'clusterId','$feedback_cluster','status','new','kind','bug',
 'surface','shop','title','Concurrent report','summary','Concurrent report','severity','normal',
 'needsAttention',false,'recommendation','Review','aiMode','fallback')));
SQL
}
payload feedback-concurrency-seed | psql "$DB_URL" -X -v ON_ERROR_STOP=1 >/dev/null
# Real simultaneous connections share one canonical row and cross report 3.
payload feedback-concurrency-a | psql "$DB_URL" -X -v ON_ERROR_STOP=1 > "$feedback_test_dir/a" &
feedback_pid_a=$!
payload feedback-concurrency-b | psql "$DB_URL" -X -v ON_ERROR_STOP=1 > "$feedback_test_dir/b" &
feedback_pid_b=$!
wait "$feedback_pid_a"
wait "$feedback_pid_b"
psql "$DB_URL" -X -v ON_ERROR_STOP=1 <<SQL
DO \$\$ begin
 if (select normalized_json->'feedback'->>'observedReportCount' from public.agent_requests where id='$feedback_cluster') <> '4'
  or not (select normalized_json->'feedback'->'ownerPendingNotificationKeys' ? 'reports:3' from public.agent_requests where id='$feedback_cluster') then
  raise exception 'Concurrent submissions lost their aggregate or milestone'; end if;
end \$\$;
SQL
# Two simultaneous first attempts of the same operation produce one receipt.
payload feedback-concurrency-replay | psql "$DB_URL" -X -v ON_ERROR_STOP=1 > "$feedback_test_dir/replay-a" &
feedback_pid_a=$!
payload feedback-concurrency-replay | psql "$DB_URL" -X -v ON_ERROR_STOP=1 > "$feedback_test_dir/replay-b" &
feedback_pid_b=$!
wait "$feedback_pid_a"
wait "$feedback_pid_b"
psql "$DB_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
DO $$ begin
 if (select count(*) from public.agent_requests where normalized_json->>'submissionKey'='feedback-concurrency-replay') <> 1 then
  raise exception 'Concurrent operation duplicated its receipt'; end if;
end $$;
SQL
feedback_version="$(psql "$DB_URL" -X -At -c "select updated_at from public.agent_requests where id='$feedback_cluster'")"
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -c "select public.update_feedback('$feedback_cluster','$feedback_version','{\"status\":\"completed\"}')" > "$feedback_test_dir/edit-a" 2>&1 &
feedback_pid_a=$!
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -c "select public.update_feedback('$feedback_cluster','$feedback_version','{\"status\":\"declined\"}')" > "$feedback_test_dir/edit-b" 2>&1 &
feedback_pid_b=$!
feedback_status_a=0
feedback_status_b=0
wait "$feedback_pid_a" || feedback_status_a=$?
wait "$feedback_pid_b" || feedback_status_b=$?
if [[ "$feedback_status_a" -eq "$feedback_status_b" ]]; then
  echo 'Exactly one concurrent Ops edit must win.' >&2
  exit 1
fi
if ! grep -q 'Feedback changed concurrently' "$feedback_test_dir/edit-a" "$feedback_test_dir/edit-b"; then
  echo 'Losing Ops edit did not return a conflict.' >&2
  exit 1
fi
psql "$DB_URL" -X -v ON_ERROR_STOP=1 <<SQL
DO \$\$ begin
 if (select count(distinct status) from public.agent_requests where id='$feedback_cluster' or normalized_json->'feedback'->>'clusterId'='$feedback_cluster') <> 1 then
  raise exception 'Concurrent edits split member statuses'; end if;
end \$\$;
SQL
echo 'Feedback concurrency checks passed.'
