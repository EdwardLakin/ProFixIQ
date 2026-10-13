\set ON_ERROR_STOP on
begin;

insert into auth.users(id, email, raw_user_meta_data) values
  ('6f100000-0000-4000-8000-000000000003', 'feedback-owner-a@example.test', '{"full_name":"Feedback Owner A"}'),
  ('6f100000-0000-4000-8000-000000000004', 'feedback-owner-b@example.test', '{"full_name":"Feedback Owner B"}'),
  ('6f100000-0000-4000-8000-000000000009', 'feedback-portal@example.test', '{"role":"customer"}');
insert into public.profiles(id, user_id, role, full_name) values
  ('6f100000-0000-4000-8000-000000000003', '6f100000-0000-4000-8000-000000000003', 'owner', 'Feedback Owner A'),
  ('6f100000-0000-4000-8000-000000000004', '6f100000-0000-4000-8000-000000000004', 'owner', 'Feedback Owner B')
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name;
-- Model the canonical profile-less portal identity, even if an auth hook
-- provisioned a profile while creating this disposable fixture account.
delete from public.profiles where id = '6f100000-0000-4000-8000-000000000009';
insert into public.shops(id, owner_id, business_name, name, user_limit) values
  ('6f200000-0000-4000-8000-000000000001', '6f100000-0000-4000-8000-000000000003', 'Feedback Shop A', 'Feedback Shop A', 5),
  ('6f200000-0000-4000-8000-000000000002', '6f100000-0000-4000-8000-000000000004', 'Feedback Shop B', 'Feedback Shop B', 5);
insert into public.agent_requests(id, description, status)
values ('6f300000-0000-4000-8000-000000000001', 'Historical request preserved', 'approved');

do $feedback$
declare
  actor constant uuid := '6f100000-0000-4000-8000-000000000009';
  legacy constant uuid := '6f300000-0000-4000-8000-000000000001';
  v_submission jsonb;
  v_receipt jsonb;
  v_second jsonb;
  v_id uuid;
  v_meta jsonb;
  v_version timestamptz;
  v_token uuid;
  v_next uuid;
  v_count integer;
begin
  if not public.feedback_ready() then raise exception 'Ledger lockdown not active'; end if;
  if has_function_privilege('authenticated', 'public.submit_feedback(jsonb)', 'EXECUTE')
    or has_function_privilege('anon', 'public.feedback_notification(uuid,text,text,text,uuid)', 'EXECUTE') then
    raise exception 'Feedback RPC exposed outside service role';
  end if;
  v_submission := jsonb_build_object('reporterAuthId', actor, 'profileId', null,
    'shopId', '6f200000-0000-4000-8000-000000000001', 'role', 'customer', 'submissionKey', 'portal-1',
    'description', 'Pure portal report', 'intent', 'bug_report', 'context', '{}'::jsonb,
    'feedback', jsonb_build_object('version', 1, 'clusterId', null, 'status', 'new',
      'title', 'Portal issue', 'summary', 'A portal issue', 'kind', 'bug', 'surface', 'customer_portal',
      'severity', 'high', 'needsAttention', true, 'recommendation', 'Review', 'aiMode', 'fallback'));
  v_receipt := public.submit_feedback(v_submission);
  v_id := (v_receipt ->> 'submissionId')::uuid;
  if (select reporter_id is not null or normalized_json ->> 'reporterAuthId' <> actor::text from public.agent_requests where id = v_id) then
    raise exception 'Portal identity violated the profile FK or lost the auth identity';
  end if;
  v_second := public.submit_feedback(v_submission);
  if v_second ->> 'submissionId' <> v_receipt ->> 'submissionId' or v_second ->> 'replayed' <> 'true' then
    raise exception 'Receipt was not idempotent';
  end if;
  if (select count(*) from public.agent_requests where normalized_json ->> 'submissionKey' = 'portal-1') <> 1 then
    raise exception 'Replay created another report';
  end if;
  if (select normalized_json -> 'feedback' -> 'ownerPendingNotificationKeys' from public.agent_requests where id = v_id) <> '["created"]'::jsonb then
    raise exception 'Receipt acknowledged without a durable owner alert';
  end if;

  -- Active historical rows are promoted, preserving their lifecycle and text.
  v_submission := jsonb_set(v_submission, '{submissionKey}', '"historical-1"');
  v_submission := jsonb_set(v_submission, '{feedback,clusterId}', to_jsonb(legacy));
  v_second := public.submit_feedback(v_submission);
  if (select status::text <> 'approved' or normalized_json -> 'feedback' ->> 'status' <> 'reviewing' from public.agent_requests where id = (v_second ->> 'submissionId')::uuid) then
    raise exception 'New duplicate did not inherit the canonical lifecycle';
  end if;
  select normalized_json -> 'feedback' into v_meta from public.agent_requests where id = legacy;
  if v_meta ->> 'status' <> 'reviewing' or v_meta ->> 'severity' <> 'high'
    or v_meta ->> 'needsAttention' <> 'true' or v_meta ->> 'title' <> 'Historical request preserved' then
    raise exception 'Historical promotion lost lifecycle or urgency';
  end if;
  -- Two matching reports move 2 -> 3 -> 4 under the canonical lock.
  v_submission := jsonb_set(v_submission, '{submissionKey}', '"historical-2"');
  v_submission := jsonb_set(v_submission, '{shopId}', '"6f200000-0000-4000-8000-000000000002"');
  perform public.submit_feedback(v_submission);
  v_submission := jsonb_set(v_submission, '{submissionKey}', '"historical-3"');
  perform public.submit_feedback(v_submission);
  select normalized_json -> 'feedback' into v_meta from public.agent_requests where id = legacy;
  if not (v_meta -> 'ownerPendingNotificationKeys' ? 'reports:3')
    or not (v_meta -> 'ownerPendingNotificationKeys' ? 'shops:2') then
    raise exception 'Crossed report/shop milestone was lost';
  end if;

  -- Atomic lifecycle writes align every member's legacy and metadata status.
  select updated_at into v_version from public.agent_requests where id = legacy;
  perform public.update_feedback(legacy, v_version, '{"status":"completed","internalNotes":"Ops only"}');
  select count(*) into v_count from public.agent_requests where (id = legacy or normalized_json -> 'feedback' ->> 'clusterId' = legacy::text)
    and (status::text <> 'merged' or normalized_json -> 'feedback' ->> 'status' <> 'completed');
  if v_count <> 0 then raise exception 'Group lifecycle diverged'; end if;
  begin
    perform public.update_feedback(legacy, '2000-01-01', '{"status":"declined"}');
    raise exception 'A stale operator edit overwrote the winner';
  exception when serialization_failure then null; end;
  if (select status::text from public.agent_requests where id = legacy) <> 'merged' then
    raise exception 'Conflict left a partial status write';
  end if;
  -- AI-selected target became terminal before submit: create a new theme.
  v_submission := jsonb_set(v_submission, '{submissionKey}', '"after-completion"');
  v_second := public.submit_feedback(v_submission);
  if v_second ->> 'clusterId' = legacy::text or v_second ->> 'clusterId' <> v_second ->> 'submissionId' then
    raise exception 'Terminal cluster swallowed new demand';
  end if;

  -- Reservation races, expiry, fencing and unknown external outcomes.
  v_token := (public.feedback_notification(legacy, 'requester', actor::text, 'claim') ->> 'token')::uuid;
  if v_token is null or public.feedback_notification(legacy, 'requester', actor::text, 'claim') is not null then
    raise exception 'Concurrent requester reservation was not exclusive';
  end if;
  update public.agent_requests set normalized_json = jsonb_set(normalized_json,
    array['feedback','requesterNotificationClaims',actor::text,'at'], '"2000-01-01T00:00:00Z"') where id = legacy;
  v_next := (public.feedback_notification(legacy, 'requester', actor::text, 'claim') ->> 'token')::uuid;
  if v_next is null or v_next = v_token then raise exception 'Abandoned reservation did not recover'; end if;
  if public.feedback_notification(legacy, 'requester', actor::text, 'begin', v_token) is not null then
    raise exception 'Expired worker was not fenced';
  end if;
  perform public.feedback_notification(legacy, 'requester', actor::text, 'begin', v_next);
  update public.agent_requests set normalized_json = jsonb_set(normalized_json,
    array['feedback','requesterNotificationClaims',actor::text,'at'], '"2000-01-01T00:00:00Z"') where id = legacy;
  if public.feedback_notification(legacy, 'requester', actor::text, 'claim') is not null then
    raise exception 'An unknown send was automatically duplicated';
  end if;
  v_next := (public.feedback_notification(legacy, 'requester', actor::text, 'retry_unknown') ->> 'token')::uuid;
  if v_next is null then raise exception 'Ops could not retry an unconfirmed outcome'; end if;
  perform public.feedback_notification(legacy, 'requester', actor::text, 'begin', v_next);
  perform public.feedback_notification(legacy, 'requester', actor::text, 'release', v_next);
  v_next := (public.feedback_notification(legacy, 'requester', actor::text, 'claim') ->> 'token')::uuid;
  perform public.feedback_notification(legacy, 'requester', actor::text, 'begin', v_next);
  perform public.feedback_notification(legacy, 'requester', actor::text, 'delivered', v_next);
  if public.feedback_notification(legacy, 'requester', actor::text, 'claim') is not null then
    raise exception 'Delivered requester was notified twice';
  end if;
  -- First delivery timestamp never blocks a later reporter.
  if public.feedback_notification(legacy, 'requester', '6f100000-0000-4000-8000-000000000002', 'claim') is null then
    raise exception 'Cluster-wide timestamp blocked a later requester';
  end if;
  v_token := (public.feedback_notification(v_id, 'owner', 'created', 'claim') ->> 'token')::uuid;
  update public.agent_requests set normalized_json = jsonb_set(normalized_json,
    '{feedback,ownerNotificationClaims,created,at}', '"2000-01-01T00:00:00Z"') where id = v_id;
  v_next := (public.feedback_notification(v_id, 'owner', 'created', 'claim') ->> 'token')::uuid;
  if v_next is null or v_next = v_token then raise exception 'Abandoned owner reservation did not recover'; end if;
  if public.feedback_notification(v_id, 'owner', 'created', 'delivered', v_token) is not null then
    raise exception 'Owner settlement did not fence an expired worker';
  end if;
end;
$feedback$;

set local role authenticated;
do $denials$
begin
  begin perform 1 from public.agent_requests; raise exception 'Browser read private Ops metadata'; exception when insufficient_privilege then null; end;
  begin insert into public.agent_requests(description) values ('forged'); raise exception 'Browser forged a report'; exception when insufficient_privilege then null; end;
  begin update public.agent_requests set status = 'merged'; raise exception 'Browser changed lifecycle'; exception when insufficient_privilege then null; end;
  begin delete from public.agent_requests; raise exception 'Browser deleted reports'; exception when insufficient_privilege then null; end;
  begin perform public.submit_feedback('{}'::jsonb); raise exception 'Browser invoked privileged RPC'; exception when insufficient_privilege then null; end;
end;
$denials$;
reset role;
rollback;
