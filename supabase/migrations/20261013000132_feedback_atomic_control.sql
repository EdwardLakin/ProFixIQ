-- Approved retirement boundary: browser clients no longer own this ledger.
-- Preserve every historical row, FK, enum, policy and existing trigger.
-- Grant revocation is the separate post-deployment contract migration.
create function public.feedback_ready()
returns boolean language sql stable security invoker set search_path = '' as $$
  select not has_table_privilege('authenticated', 'public.agent_requests', 'SELECT,INSERT,UPDATE,DELETE')
    and not has_table_privilege('anon', 'public.agent_requests', 'SELECT,INSERT,UPDATE,DELETE');
$$;

create unique index agent_requests_feedback_auth_key_uidx
  on public.agent_requests (
    (coalesce(normalized_json ->> 'reporterAuthId', reporter_id::text)),
    (normalized_json ->> 'submissionKey')
  ) where nullif(btrim(normalized_json ->> 'submissionKey'), '') is not null;
create index agent_requests_feedback_cluster_idx
  on public.agent_requests ((normalized_json -> 'feedback' ->> 'clusterId'));

-- All feedback mutations lock the canonical row first. External AI/email calls
-- happen outside transactions. These invoker functions are service-role only.
create function public.feedback_metadata(p_row jsonb)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(p_row -> 'normalized_json' -> 'feedback', jsonb_build_object(
    'version', 1, 'clusterId', (p_row ->> 'id'), 'isCanonical', true,
    'status', case (p_row ->> 'status') when 'merged' then 'completed'
      when 'rejected' then 'declined' when 'approved' then 'reviewing'
      when 'awaiting_approval' then 'planned' when 'in_progress' then 'in_progress' else 'new' end,
    'kind', case when (p_row ->> 'intent') = 'bug_report' then 'bug' else 'feature_request' end,
    'surface', 'other', 'title', left((p_row ->> 'description'), 100), 'summary', left((p_row ->> 'description'), 500),
    'severity', 'normal', 'needsAttention', (p_row ->> 'status') = 'failed',
    'recommendation', coalesce((p_row ->> 'llm_notes'), 'Review alongside similar feedback.'),
    'aiMode', 'fallback', 'aiModel', (p_row ->> 'llm_model'), 'duplicateConfidence', null,
    'firstSeenAt', (p_row ->> 'created_at'), 'lastSeenAt', (p_row ->> 'updated_at')
  ));
$$;

create function public.submit_feedback(p_submission jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_row public.agent_requests;
  v_canonical public.agent_requests;
  v_id uuid := gen_random_uuid();
  v_auth uuid := (p_submission ->> 'reporterAuthId')::uuid;
  v_key text := p_submission ->> 'submissionKey';
  v_cluster uuid := nullif(p_submission -> 'feedback' ->> 'clusterId', '')::uuid;
  v_meta jsonb := p_submission -> 'feedback';
  v_old jsonb;
  v_events jsonb;
  v_count integer;
  v_shops integer;
  v_threshold integer;
  v_legacy public.agent_request_status;
  v_now timestamptz := clock_timestamp();
begin
  if not public.feedback_ready() then raise exception using errcode = '55000', message = 'Feedback ledger lockdown is pending'; end if;
  if v_auth is null or coalesce(length(v_key), 0) not between 1 and 100
    or coalesce(length(p_submission ->> 'description'), 0) not between 1 and 12000 then
    raise exception using errcode = '22023', message = 'Invalid feedback submission';
  end if;
  -- Serialize even concurrent first attempts for one user operation.
  perform pg_advisory_xact_lock(hashtextextended(v_auth::text || ':' || v_key, 0));
  select * into v_row from public.agent_requests
    where coalesce(normalized_json ->> 'reporterAuthId', reporter_id::text) = v_auth::text
      and normalized_json ->> 'submissionKey' = v_key;
  if found then
    return jsonb_build_object('submissionId', v_row.id,
      'clusterId', coalesce(v_row.normalized_json -> 'feedback' ->> 'clusterId', v_row.id::text),
      'replayed', true);
  end if;

  if v_cluster is not null then
    select * into v_canonical from public.agent_requests where id = v_cluster for update;
    if not found then v_cluster := null;
    else
      v_old := public.feedback_metadata(to_jsonb(v_canonical));
      -- Revalidate under the same lock used by Ops lifecycle updates.
      if v_old ->> 'status' in ('completed', 'declined')
        or v_canonical.status::text in ('merged', 'rejected')
        or coalesce(v_old ->> 'clusterId', v_cluster::text) <> v_cluster::text then
        v_cluster := null;
      end if;
    end if;
  end if;
  v_cluster := coalesce(v_cluster, v_id);
  v_meta := v_meta || jsonb_build_object('clusterId', v_cluster, 'isCanonical', v_cluster = v_id,
    'firstSeenAt', v_now, 'lastSeenAt', v_now,
    'status', case when v_cluster = v_id then 'new' else v_old ->> 'status' end);
  v_legacy := case v_meta ->> 'status' when 'new' then 'submitted' when 'reviewing' then 'approved'
    when 'planned' then 'awaiting_approval' when 'in_progress' then 'in_progress'
    when 'completed' then 'merged' when 'declined' then 'rejected' end;

  insert into public.agent_requests(id, shop_id, reporter_id, reporter_role, description, intent,
      normalized_json, status, llm_model, llm_confidence, llm_notes)
    values(v_id, nullif(p_submission ->> 'shopId', '')::uuid,
      nullif(p_submission ->> 'profileId', '')::uuid, p_submission ->> 'role',
      p_submission ->> 'description', (p_submission ->> 'intent')::public.agent_request_intent,
      (p_submission -> 'context') || jsonb_build_object('reporterAuthId', v_auth, 'submissionKey', v_key, 'feedback', v_meta),
      v_legacy, v_meta ->> 'aiModel', nullif(v_meta ->> 'duplicateConfidence', '')::numeric,
      (v_meta ->> 'summary') || E'\n\nRecommendation: ' || (v_meta ->> 'recommendation'));

  if v_cluster = v_id then
    v_old := v_meta;
    v_events := '["created"]'::jsonb;
  else
    v_events := coalesce(v_old -> 'ownerPendingNotificationKeys', '[]'::jsonb);
    if coalesce((v_meta ->> 'needsAttention')::boolean, false)
      and not coalesce((v_old ->> 'needsAttention')::boolean, false) then
      v_events := v_events || jsonb_build_array('attention:' || v_id::text);
    end if;
    v_old := v_old || jsonb_build_object('lastSeenAt', v_now,
      'needsAttention', coalesce((v_old ->> 'needsAttention')::boolean, false) or (v_meta ->> 'needsAttention')::boolean);
    if array_position(array['low','normal','high','critical'], v_meta ->> 'severity') >
      array_position(array['low','normal','high','critical'], v_old ->> 'severity') then
      v_old := v_old || jsonb_build_object('severity', v_meta ->> 'severity');
    end if;
    -- Promote historical metadata without discarding its mapped lifecycle.
    if v_canonical.normalized_json -> 'feedback' is null then
      v_old := v_old || jsonb_build_object('surface', v_meta ->> 'surface');
    end if;
  end if;
  select count(*), count(distinct shop_id) into v_count, v_shops
    from public.agent_requests where id = v_cluster or normalized_json -> 'feedback' ->> 'clusterId' = v_cluster::text;
  -- Persist every crossed threshold, including jumps caused by concurrency.
  foreach v_threshold in array array[3,5,10,25,50,100] loop
    if v_threshold > coalesce((v_old ->> 'observedReportCount')::integer, v_count - 1)
      and v_threshold <= v_count then v_events := v_events || jsonb_build_array('reports:' || v_threshold); end if;
  end loop;
  foreach v_threshold in array array[2,3,5,10,25,50] loop
    if v_threshold > coalesce((v_old ->> 'observedShopCount')::integer,
      (select count(distinct shop_id) from public.agent_requests where id <> v_id and
        (id = v_cluster or normalized_json -> 'feedback' ->> 'clusterId' = v_cluster::text)))
      and v_threshold <= v_shops then v_events := v_events || jsonb_build_array('shops:' || v_threshold); end if;
  end loop;
  v_old := v_old || jsonb_build_object('clusterId', v_cluster, 'isCanonical', true,
    'ownerPendingNotificationKeys', v_events, 'observedReportCount', v_count, 'observedShopCount', v_shops);
  update public.agent_requests set normalized_json = coalesce(normalized_json, '{}'::jsonb) ||
    jsonb_build_object('feedback', v_old) where id = v_cluster;
  return jsonb_build_object('submissionId', v_id, 'clusterId', v_cluster, 'replayed', false);
end;
$$;

create function public.update_feedback(p_id uuid, p_expected_updated_at timestamptz, p_patch jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_row public.agent_requests;
  v_meta jsonb;
  v_status text;
  v_legacy public.agent_request_status;
begin
  if not public.feedback_ready() then raise exception using errcode = '55000', message = 'Feedback ledger lockdown is pending'; end if;
  select * into v_row from public.agent_requests where id = p_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Feedback not found'; end if;
  if v_row.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = '40001', message = 'Feedback changed concurrently';
  end if;
  v_meta := public.feedback_metadata(to_jsonb(v_row));
  if coalesce(v_meta ->> 'clusterId', p_id::text) <> p_id::text then
    raise exception using errcode = '22023', message = 'Expected canonical feedback';
  end if;
  v_status := coalesce(p_patch ->> 'status', v_meta ->> 'status');
  v_legacy := case v_status when 'new' then 'submitted' when 'reviewing' then 'approved'
    when 'planned' then 'awaiting_approval' when 'in_progress' then 'in_progress'
    when 'completed' then 'merged' when 'declined' then 'rejected' end;
  if v_legacy is null then raise exception using errcode = '22023', message = 'Invalid feedback status'; end if;
  v_meta := v_meta || (p_patch - 'notifyRequesters' - 'retryUnknownNotifications') ||
    jsonb_build_object('clusterId', p_id, 'isCanonical', true, 'status', v_status,
      'completedAt', case when v_status = 'completed' then coalesce(v_meta ->> 'completedAt', clock_timestamp()::text) else null end);
  -- One transaction: no partial status writes or rollback races.
  update public.agent_requests set status = v_legacy,
    normalized_json = coalesce(normalized_json, '{}'::jsonb) || jsonb_build_object('feedback',
      case when id = p_id then v_meta else public.feedback_metadata(to_jsonb(agent_requests)) || jsonb_build_object('status', v_status) end)
    where id = p_id or normalized_json -> 'feedback' ->> 'clusterId' = p_id::text;
  return v_meta;
end;
$$;

create function public.feedback_notification(p_id uuid, p_kind text, p_key text,
  p_action text, p_token uuid default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_row public.agent_requests;
  v_meta jsonb;
  v_claims jsonb;
  v_claim jsonb;
  v_field text;
  v_receipts text;
  v_token uuid;
  v_now timestamptz := clock_timestamp();
begin
  if not public.feedback_ready() then raise exception using errcode = '55000', message = 'Feedback ledger lockdown is pending'; end if;
  if p_kind not in ('owner', 'requester') or nullif(p_key, '') is null then
    raise exception using errcode = '22023', message = 'Invalid notification';
  end if;
  select * into v_row from public.agent_requests where id = p_id for update;
  if not found then return null; end if;
  v_meta := public.feedback_metadata(to_jsonb(v_row));
  v_field := case p_kind when 'owner' then 'ownerNotificationClaims' else 'requesterNotificationClaims' end;
  v_receipts := case p_kind when 'owner' then 'ownerNotificationKeys' else 'requesterNotifiedReporterIds' end;
  v_claims := coalesce(v_meta -> v_field, '{}'::jsonb);
  v_claim := v_claims -> p_key;
  if coalesce(v_meta -> v_receipts, '[]'::jsonb) ? p_key or
    (p_kind = 'requester' and coalesce(v_meta -> 'requesterNotificationSkippedReporterIds', '[]'::jsonb) ? p_key) then return null; end if;
  if p_kind = 'requester' and v_meta ->> 'status' <> 'completed' then return null; end if;

  if p_action in ('claim', 'retry_unknown') then
    if v_claim is not null then
      if (v_claim ->> 'at')::timestamptz > v_now - interval '5 minutes' then return null; end if;
      -- Only pre-dispatch reservations expire automatically. An interrupted send
      -- has an unknown external outcome and needs an explicit operator resend.
      if v_claim ->> 'state' <> 'reserved' and p_action <> 'retry_unknown' then return null; end if;
    end if;
    v_token := gen_random_uuid();
    v_claims := v_claims || jsonb_build_object(p_key, jsonb_build_object('token', v_token, 'state', 'reserved', 'at', v_now));
  else
    if p_token is null or v_claim is null or v_claim ->> 'token' is distinct from p_token::text then return null; end if;
    if p_action = 'begin' then
      if v_claim ->> 'state' <> 'reserved' or (v_claim ->> 'at')::timestamptz <= v_now - interval '5 minutes' then return null; end if;
      v_claims := v_claims || jsonb_build_object(p_key, v_claim || jsonb_build_object('state', 'sending', 'at', v_now));
    elsif p_action in ('delivered', 'skipped', 'release', 'unknown') then
      if p_action = 'unknown' then
        v_claims := v_claims || jsonb_build_object(p_key, v_claim || jsonb_build_object('state', 'unknown', 'at', v_now - interval '5 minutes'));
      else
        v_claims := v_claims - p_key;
        if p_action = 'delivered' then
          v_meta := v_meta || jsonb_build_object(v_receipts, coalesce(v_meta -> v_receipts, '[]'::jsonb) || jsonb_build_array(p_key),
            case p_kind when 'owner' then 'ownerNotifiedAt' else 'requesterNotifiedAt' end, v_now);
        elsif p_action = 'skipped' then
          v_meta := v_meta || jsonb_build_object('requesterNotificationSkippedReporterIds',
            coalesce(v_meta -> 'requesterNotificationSkippedReporterIds', '[]'::jsonb) || jsonb_build_array(p_key));
        end if;
      end if;
    else raise exception using errcode = '22023', message = 'Invalid notification action'; end if;
    v_token := p_token;
  end if;
  v_meta := v_meta || jsonb_build_object(v_field, v_claims);
  update public.agent_requests set normalized_json = coalesce(normalized_json, '{}'::jsonb) ||
    jsonb_build_object('feedback', v_meta) where id = p_id;
  return jsonb_build_object('token', v_token);
end;
$$;

revoke all on function public.feedback_ready() from public, anon, authenticated;
grant execute on function public.feedback_ready() to service_role;
revoke all on function public.feedback_metadata(jsonb) from public, anon, authenticated;
revoke all on function public.submit_feedback(jsonb) from public, anon, authenticated;
revoke all on function public.update_feedback(uuid, timestamptz, jsonb) from public, anon, authenticated;
revoke all on function public.feedback_notification(uuid, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.feedback_metadata(jsonb), public.submit_feedback(jsonb),
  public.update_feedback(uuid, timestamptz, jsonb), public.feedback_notification(uuid, text, text, text, uuid) to service_role;

notify pgrst, 'reload schema';
