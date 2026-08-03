begin;

-- Reinstall the canonical inspection writer and signer as a forward-only repair.
-- Some deployed environments retained an older writer whose conflict target
-- did not have a matching unique constraint.
-- These definitions preserve shop authorization, revision checks, idempotency,
-- profile identity compatibility, locking, and finalization behavior.

-- The API resolves shops through either profiles.id or profiles.user_id.
-- Keep the atomic writer on the same identity contract so linked/imported
-- technicians can persist the canonical inspection instead of remaining local.
create or replace function public.save_inspection_progress_atomic(
  p_shop_id uuid,
  p_work_order_line_id uuid,
  p_actor_user_id uuid,
  p_session jsonb,
  p_operation_key text,
  p_at timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line record;
  v_existing_result jsonb;
  v_existing_summary jsonb := '{}'::jsonb;
  v_canonical_session jsonb;
  v_session_id uuid;
  v_inspection_id uuid;
  -- `p_at` remains in the public signature for forward compatibility, but a
  -- caller-controlled timestamp cannot be used as a concurrency token.
  v_now timestamptz := clock_timestamp();
  v_result jsonb;
  v_server_revision bigint := 0;
  v_client_revision bigint := 0;
  v_next_revision bigint;
  v_server_updated_at timestamptz;
  v_client_updated_at timestamptz;
  v_inspection_exists boolean := false;
  v_inspection_locked boolean := false;
  v_inspection_completed boolean := false;
  v_inspection_is_draft boolean := true;
  v_inspection_status text := 'draft';
  v_inspection_finalized_at timestamptz;
  v_inspection_finalized_by uuid;
  v_session_fingerprint text := md5(p_session::text);
begin
  if auth.uid() is not null and auth.uid() <> p_actor_user_id then
    raise exception using
      errcode = 'P0001',
      message = 'Authenticated actor does not match the inspection actor.';
  end if;

  if nullif(trim(p_operation_key), '') is null then
    raise exception using
      errcode = 'P0001',
      message = 'A stable operation key is required.';
  end if;

  if p_session is null or jsonb_typeof(p_session) <> 'object' then
    raise exception using
      errcode = 'P0001',
      message = 'Inspection session payload must be a JSON object.';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where (p.id = p_actor_user_id or p.user_id = p_actor_user_id)
      and p.shop_id = p_shop_id
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'Actor is not a member of this shop.';
  end if;

  select wol.id, wol.work_order_id, wol.shop_id
    into v_line
  from public.work_order_lines wol
  where wol.id = p_work_order_line_id
    and wol.shop_id = p_shop_id
  for update;

  if not found or v_line.work_order_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'Work-order line not found for shop.';
  end if;

  -- Authorization and line scope are checked before idempotency lookup because
  -- this SECURITY DEFINER function is callable directly by authenticated users.
  -- Locking the line first also makes simultaneous retries with the same key
  -- observe the committed idempotency result instead of a false revision clash.
  select mok.result
    into v_existing_result
  from public.mobile_operation_keys mok
  where mok.shop_id = p_shop_id
    and mok.operation_name = 'save_inspection_progress'
    and mok.operation_key = p_operation_key;

  if found then
    if coalesce(v_existing_result->>'session_fingerprint', '') is distinct from
       v_session_fingerprint then
      raise exception using
        errcode = 'P0001',
        message = 'Inspection operation key was reused for a different snapshot.';
    end if;
    return v_existing_result || jsonb_build_object('idempotent', true);
  end if;

  -- Lock only the deterministic canonical row. Historical duplicates may
  -- contain old finalized evidence and must not block an active canonical draft.
  select
    i.id,
    coalesce(i.summary, '{}'::jsonb),
    coalesce(i.locked, false),
    coalesce(i.completed, false),
    coalesce(i.is_draft, true),
    coalesce(i.status, 'draft'),
    i.finalized_at,
    i.finalized_by,
    i.updated_at
  into
    v_inspection_id,
    v_existing_summary,
    v_inspection_locked,
    v_inspection_completed,
    v_inspection_is_draft,
    v_inspection_status,
    v_inspection_finalized_at,
    v_inspection_finalized_by,
    v_server_updated_at
  from public.inspections i
  where i.work_order_line_id = p_work_order_line_id
    and i.shop_id = p_shop_id
  order by i.updated_at desc nulls last, i.id desc
  limit 1
  for update;

  if found then
    v_inspection_exists := true;
    if (
      v_inspection_locked
      or v_inspection_completed
      or not v_inspection_is_draft
      or v_inspection_finalized_at is not null
      or v_inspection_finalized_by is not null
      or lower(v_inspection_status) in ('completed', 'finalized', 'signed')
    ) then
      raise exception using
        errcode = 'P0001',
        message = 'Inspection is finalized and locked. Reopen is required before editing.';
    end if;

    if coalesce(v_existing_summary->>'syncRevision', '') ~ '^[0-9]+$' then
      v_server_revision := (v_existing_summary->>'syncRevision')::bigint;
    end if;
  else
    insert into public.inspections (
      work_order_id,
      work_order_line_id,
      shop_id,
      user_id,
      summary,
      is_draft,
      completed,
      locked,
      status,
      finalized_at,
      finalized_by,
      updated_at
    ) values (
      v_line.work_order_id,
      p_work_order_line_id,
      p_shop_id,
      p_actor_user_id,
      p_session,
      true,
      false,
      false,
      'draft',
      null,
      null,
      v_now
    )
    returning id into v_inspection_id;
  end if;

  if coalesce(p_session->>'syncRevision', '') ~ '^[0-9]+$' then
    v_client_revision := (p_session->>'syncRevision')::bigint;
  end if;

  if v_inspection_exists and v_client_revision <> v_server_revision then
    raise exception using
      errcode = 'P0001',
      message = 'Inspection save conflicts with a newer server version.';
  end if;

  v_next_revision := v_server_revision + 1;
  v_canonical_session :=
    p_session || jsonb_build_object(
      'id', v_inspection_id,
      'workOrderId', v_line.work_order_id,
      'workOrderLineId', p_work_order_line_id,
      'syncRevision', v_next_revision,
      'serverUpdatedAt', v_now
    );

  update public.inspections
  set work_order_id = v_line.work_order_id,
      work_order_line_id = p_work_order_line_id,
      shop_id = p_shop_id,
      user_id = p_actor_user_id,
      summary = v_canonical_session,
      is_draft = true,
      completed = false,
      locked = false,
      status = 'draft',
      finalized_at = null,
      finalized_by = null,
      updated_at = v_now
  where id = v_inspection_id
    and shop_id = p_shop_id
    and not coalesce(locked, false)
    and not coalesce(completed, false)
    and coalesce(is_draft, true)
    and lower(coalesce(status, 'draft')) not in (
      'completed',
      'finalized',
      'signed'
    );

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'Inspection was finalized while autosave was in progress.';
  end if;

  select s.id
    into v_session_id
  from public.inspection_sessions s
  where s.work_order_line_id = p_work_order_line_id
  order by s.updated_at desc nulls last, s.id desc
  limit 1
  for update;

  if found then
    update public.inspection_sessions
    set work_order_id = v_line.work_order_id,
        user_id = p_actor_user_id,
        state = v_canonical_session,
        updated_at = v_now
    where id = v_session_id;
  else
    insert into public.inspection_sessions (
      work_order_id,
      work_order_line_id,
      user_id,
      state,
      updated_at
    ) values (
      v_line.work_order_id,
      p_work_order_line_id,
      p_actor_user_id,
      v_canonical_session,
      v_now
    )
    returning id into v_session_id;
  end if;

  v_result := jsonb_build_object(
    'ok', true,
    'inspection_id', v_inspection_id,
    'inspection_session_id', v_session_id,
    'work_order_id', v_line.work_order_id,
    'work_order_line_id', p_work_order_line_id,
    'sync_revision', v_next_revision,
    'saved_at', v_now,
    'session_fingerprint', v_session_fingerprint,
    'idempotent', false
  );

  insert into public.mobile_operation_keys (
    shop_id,
    operation_name,
    operation_key,
    actor_user_id,
    work_order_id,
    work_order_line_id,
    result
  ) values (
    p_shop_id,
    'save_inspection_progress',
    p_operation_key,
    p_actor_user_id,
    v_line.work_order_id,
    p_work_order_line_id,
    v_result
  );

  return v_result;
exception
  when unique_violation then
    select mok.result
      into v_existing_result
    from public.mobile_operation_keys mok
    where mok.shop_id = p_shop_id
      and mok.operation_name = 'save_inspection_progress'
      and mok.operation_key = p_operation_key;

    if found then
      if coalesce(v_existing_result->>'session_fingerprint', '') is distinct from
         v_session_fingerprint then
        raise exception using
          errcode = 'P0001',
          message = 'Inspection operation key was reused for a different snapshot.';
      end if;
      return v_existing_result || jsonb_build_object('idempotent', true);
    end if;

    raise;
end;
$$;

revoke all on function public.save_inspection_progress_atomic(
  uuid, uuid, uuid, jsonb, text, timestamptz
) from public;
grant execute on function public.save_inspection_progress_atomic(
  uuid, uuid, uuid, jsonb, text, timestamptz
) to authenticated, service_role;

-- Keep technician signing aligned with the profile identity used by settings.
-- Imported/legacy staff may link auth.users through profiles.user_id while
-- profiles.id remains the employee identity and signature storage namespace.

create or replace function public.sign_inspection(
  p_inspection_id uuid,
  p_role text,
  p_signed_name text,
  p_expected_sync_revision bigint,
  p_signature_image_path text default null,
  p_signature_hash text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_inspection_shop_id uuid;
  v_inspection_locked boolean := false;
  v_inspection_completed boolean := false;
  v_inspection_is_draft boolean := true;
  v_inspection_finalized_at timestamptz;
  v_signing_cycle bigint := 0;
  v_inspection_summary jsonb := '{}'::jsonb;
  v_inspection_revision bigint := 0;
  v_signature_id uuid;
  v_signature_actor uuid;
  v_signature_name text;
  v_now timestamptz := clock_timestamp();
  v_effective_name text := nullif(trim(p_signed_name), '');
  v_effective_path text := nullif(trim(p_signature_image_path), '');
  v_effective_hash text := nullif(trim(p_signature_hash), '');
  v_profile record;
begin
  if v_actor_user_id is null then
    raise exception using errcode = 'P0001', message = 'Authentication is required.';
  end if;

  if p_role is null or p_role not in ('technician', 'customer', 'advisor') then
    raise exception using errcode = 'P0001', message = 'Unsupported inspection signature role.';
  end if;

  if p_expected_sync_revision is null or p_expected_sync_revision < 1 then
    raise exception using
      errcode = 'P0001',
      message = 'A saved inspection revision is required before signing.';
  end if;

  select
    i.shop_id,
    coalesce(i.locked, false),
    coalesce(i.completed, false),
    coalesce(i.is_draft, true),
    i.finalized_at,
    coalesce(i.signing_cycle, 0),
    coalesce(i.summary, '{}'::jsonb)
  into
    v_inspection_shop_id,
    v_inspection_locked,
    v_inspection_completed,
    v_inspection_is_draft,
    v_inspection_finalized_at,
    v_signing_cycle,
    v_inspection_summary
  from public.inspections i
  where i.id = p_inspection_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'Inspection was not found.';
  end if;

  if coalesce(v_inspection_summary->>'syncRevision', '') ~ '^[0-9]+$' then
    v_inspection_revision :=
      (v_inspection_summary->>'syncRevision')::bigint;
  end if;

  if p_expected_sync_revision <> v_inspection_revision then
    raise exception using
      errcode = 'P0001',
      message = 'Inspection changed on another device before signing. Review the latest version and sign again.';
  end if;

  select
    p.id,
    p.shop_id,
    p.role,
    p.full_name,
    p.tech_signature_path,
    p.tech_signature_hash
  into v_profile
  from public.profiles p
  where p.id = v_actor_user_id
     or p.user_id = v_actor_user_id
  order by case when p.id = v_actor_user_id then 0 else 1 end
  limit 1;

  if not found or v_profile.shop_id is distinct from v_inspection_shop_id then
    raise exception using
      errcode = 'P0001',
      message = 'Inspection does not belong to the authenticated user shop.';
  end if;

  if p_role = 'advisor' then
    if lower(coalesce(v_profile.role::text, '')) not in (
      'advisor',
      'service_advisor',
      'service advisor',
      'owner',
      'admin',
      'manager'
    ) then
      raise exception using
        errcode = 'P0001',
        message = 'Authenticated user cannot sign as service advisor.';
    end if;

    v_effective_name := coalesce(
      nullif(trim(v_profile.full_name), ''),
      nullif(trim(auth.jwt() -> 'user_metadata' ->> 'full_name'), ''),
      nullif(trim(auth.jwt() -> 'user_metadata' ->> 'name'), '')
    );
  end if;

  if p_role = 'technician' then
    if lower(coalesce(v_profile.role::text, '')) not in (
      'technician',
      'tech',
      'mechanic',
      'owner',
      'admin',
      'manager',
      'foreman',
      'lead_hand',
      'lead hand'
    ) then
      raise exception using
        errcode = 'P0001',
        message = 'Authenticated user cannot sign as technician.';
    end if;

    v_effective_name := coalesce(
      nullif(trim(v_profile.full_name), ''),
      nullif(trim(auth.jwt() -> 'user_metadata' ->> 'full_name'), ''),
      nullif(trim(auth.jwt() -> 'user_metadata' ->> 'name'), '')
    );
    v_effective_path := nullif(trim(v_profile.tech_signature_path), '');
    v_effective_hash := nullif(trim(v_profile.tech_signature_hash), '');

    if v_effective_path is null
       or v_effective_hash is null
       or v_effective_hash !~ '^[0-9a-fA-F]{64}$'
       or not (
         v_effective_path =
           'tech-signatures/' || v_profile.id::text || '.png'
         or v_effective_path =
           'tech-signatures/' || v_profile.id::text || '/' ||
           lower(v_effective_hash) || '.png'
       )
       or not exists (
         select 1
         from storage.objects o
         where o.bucket_id = 'signatures'
           and o.name = v_effective_path
       ) then
      raise exception using
        errcode = 'P0001',
        message = 'No valid saved technician signature exists in this profile.';
    end if;
  end if;

  if v_effective_name is null then
    raise exception using errcode = 'P0001', message = 'Signed name is required.';
  end if;

  -- Only this exact atomic reopen generation and server revision can satisfy
  -- an idempotent retry. Older evidence remains queryable but cannot suppress
  -- a new signing cycle.
  select s.id, s.signed_by, s.signed_name
    into v_signature_id, v_signature_actor, v_signature_name
  from public.inspection_signatures s
  where s.inspection_id = p_inspection_id
    and s.role = p_role
    and s.signing_cycle = v_signing_cycle
    and s.signed_sync_revision = v_inspection_revision
  order by s.signed_at desc nulls last, s.id desc
  limit 1
  for update;

  if found then
    if (
      v_inspection_locked
      or v_inspection_completed
      or not v_inspection_is_draft
      or v_inspection_finalized_at is not null
    ) and v_signature_actor = v_actor_user_id
      and (
        p_role in ('technician', 'advisor')
        or v_signature_name is not distinct from v_effective_name
      ) then
      return;
    end if;

    raise exception using
      errcode = 'P0001',
      message = 'This inspection revision is already signed for that role.';
  end if;

  insert into public.inspection_signatures (
    inspection_id,
    role,
    signed_by,
    signed_name,
    signature_image_path,
    signature_hash,
    signing_cycle,
    signed_sync_revision,
    signed_summary_hash,
    signed_summary,
    signed_at
  ) values (
    p_inspection_id,
    p_role,
    v_actor_user_id,
    v_effective_name,
    v_effective_path,
    v_effective_hash,
    v_signing_cycle,
    v_inspection_revision,
    encode(
      extensions.digest(
        convert_to(v_inspection_summary::text, 'UTF8'),
        'sha256'
      ),
      'hex'
    ),
    v_inspection_summary,
    v_now
  );

  -- The first role finalizes the snapshot. Additional roles can append their
  -- own immutable evidence without rewriting the already-finalized row.
  if not v_inspection_locked
     and not v_inspection_completed
     and v_inspection_is_draft
     and v_inspection_finalized_at is null then
    perform set_config('profixiq.inspection_sign', 'on', true);
    update public.inspections
    set locked = true,
        completed = true,
        is_draft = false,
        status = 'completed',
        finalized_at = v_now,
        finalized_by = v_actor_user_id,
        updated_at = v_now
    where id = p_inspection_id;
  end if;
end;
$$;

revoke all on function public.sign_inspection(
  uuid, text, text, bigint, text, text
) from public;
grant execute on function public.sign_inspection(
  uuid, text, text, bigint, text, text
) to authenticated, service_role;

commit;
