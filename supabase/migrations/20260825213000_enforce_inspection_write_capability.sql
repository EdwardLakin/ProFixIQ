begin;

set local lock_timeout = '5s';
set local statement_timeout = '10min';

-- Inspection editing is an existing application capability. Register it in
-- the canonical Workspace authorization model so shop policy and individual
-- overrides are enforced by the database writer, not only by presentation.
insert into public.workspace_capabilities (
  capability_key,
  workspace_key,
  module_key,
  action_key,
  access_level,
  is_protected,
  description
) values (
  'work_order.inspection.run',
  'work_order',
  'inspection',
  'run',
  'manage',
  false,
  'Create and edit canonical inspection progress for authorized Work Order repair lines.'
)
on conflict (capability_key) do update
set workspace_key = excluded.workspace_key,
    module_key = excluded.module_key,
    action_key = excluded.action_key,
    access_level = excluded.access_level,
    is_protected = excluded.is_protected,
    description = excluded.description,
    updated_at = now();

insert into public.workspace_role_capability_presets (
  capability_key,
  role_key,
  effect
) values
  ('work_order.inspection.run', 'owner', 'allow'),
  ('work_order.inspection.run', 'admin', 'allow'),
  ('work_order.inspection.run', 'manager', 'allow'),
  ('work_order.inspection.run', 'advisor', 'allow'),
  ('work_order.inspection.run', 'service', 'allow'),
  ('work_order.inspection.run', 'mechanic', 'allow'),
  ('work_order.inspection.run', 'lead_hand', 'allow'),
  ('work_order.inspection.run', 'foreman', 'allow')
on conflict (capability_key, role_key) do update
set effect = excluded.effect,
    updated_at = now();

-- Imported staff retain their canonical profile id while authenticating through
-- profiles.user_id. Keep lifecycle receipt visibility on the same Shop boundary
-- for both supported identity shapes; the previous id-only policy hid valid
-- receipts from an activated imported profile.
drop policy if exists quote_lifecycle_operation_keys_shop_select
  on public.quote_lifecycle_operation_keys;
create policy quote_lifecycle_operation_keys_shop_select
on public.quote_lifecycle_operation_keys
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles profile
    where profile.shop_id = quote_lifecycle_operation_keys.shop_id
      and (
        profile.id = (select auth.uid())
        or profile.user_id = (select auth.uid())
      )
  )
);

-- Preserve the established canonical writer implementation as a private core.
-- The public signature below remains stable for current and installed clients,
-- while every public compatibility name passes through the same authorization
-- gate before any receipt or inspection row can be read or mutated.
alter function public.save_inspection_progress_v3_atomic(
  uuid, uuid, uuid, jsonb, text, timestamptz
) set schema private;

alter function private.save_inspection_progress_v3_atomic(
  uuid, uuid, uuid, jsonb, text, timestamptz
) rename to save_inspection_progress_v3_core;

alter function private.save_inspection_progress_v3_core(
  uuid, uuid, uuid, jsonb, text, timestamptz
) set search_path to '';

revoke all on function private.save_inspection_progress_v3_core(
  uuid, uuid, uuid, jsonb, text, timestamptz
) from public, anon, authenticated, service_role;

create or replace function public.save_inspection_progress_v3_atomic(
  p_shop_id uuid,
  p_work_order_line_id uuid,
  p_actor_user_id uuid,
  p_session jsonb,
  p_operation_key text,
  p_at timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_is_service_role boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
  v_actor_profile_id uuid;
  v_actor_linked_user_id uuid;
  v_core_actor_user_id uuid;
  v_actor_role text;
  v_actor_can_run_inspections boolean := false;
  v_work_order_id uuid;
  v_existing_actor_user_id uuid;
  v_existing_work_order_line_id uuid;
  v_existing_result jsonb;
  v_session_fingerprint text;
begin
  if v_auth_user_id is null and not v_is_service_role then
    raise exception using
      errcode = '42501',
      message = 'Authentication is required to save inspection progress.';
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
  v_session_fingerprint := md5(p_session::text);

  select
    profile.id,
    profile.user_id,
    private.workspace_canonical_role(profile.role::text)
    into v_actor_profile_id, v_actor_linked_user_id, v_actor_role
  from public.profiles profile
  where profile.shop_id = p_shop_id
    and (profile.id = p_actor_user_id or profile.user_id = p_actor_user_id)
    and (
      v_is_service_role
      or profile.id = v_auth_user_id
      or profile.user_id = v_auth_user_id
    )
  order by
    (profile.user_id = p_actor_user_id) desc,
    (profile.id = p_actor_user_id) desc,
    profile.updated_at desc nulls last,
    profile.id
  limit 1;

  if v_actor_profile_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authenticated actor is not available for this shop.';
  end if;

  v_core_actor_user_id := case
    when not v_is_service_role then v_auth_user_id
    else coalesce(v_actor_linked_user_id, v_actor_profile_id)
  end;

  select decision.granted
    into v_actor_can_run_inspections
  from private.resolve_workspace_profile_capability(
    v_actor_profile_id,
    p_shop_id,
    'work_order.inspection.run'
  ) decision;

  if not coalesce(v_actor_can_run_inspections, false) then
    raise exception using
      errcode = '42501',
      message = 'Inspection capability is required to save inspection progress.';
  end if;

  -- Serialize the complete receipt lifecycle for one tenant-scoped command.
  -- The private writer performs its receipt lookup before its row locks, so a
  -- transaction-level lock here prevents two first attempts from both passing
  -- that lookup and racing the unique operation-key insert.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_shop_id::text || ':save_inspection_progress:' || p_operation_key,
      0
    )
  );

  -- A committed same-actor receipt remains recoverable if dispatch reassigns
  -- the line before the response reaches the device. Bind the receipt to its
  -- original actor, line and exact snapshot before returning it. A new key
  -- still proceeds to the current-assignment check below and fails closed.
  select
    receipt.actor_user_id,
    receipt.work_order_line_id,
    receipt.result
    into
      v_existing_actor_user_id,
      v_existing_work_order_line_id,
      v_existing_result
  from public.mobile_operation_keys receipt
  where receipt.shop_id = p_shop_id
    and receipt.operation_name = 'save_inspection_progress'
    and receipt.operation_key = p_operation_key;

  if found then
    if v_existing_actor_user_id is distinct from v_core_actor_user_id
       or v_existing_work_order_line_id is distinct from p_work_order_line_id then
      raise exception using
        errcode = 'P0001',
        message = 'Inspection operation key belongs to a different actor or repair line.';
    end if;
    if coalesce(v_existing_result->>'session_fingerprint', '') is distinct from
       v_session_fingerprint then
      raise exception using
        errcode = 'P0001',
        message = 'Inspection operation key was reused for a different snapshot.';
    end if;
    return v_existing_result || jsonb_build_object('idempotent', true);
  end if;

  -- Resolve the parent without a row lock, then acquire the canonical Work
  -- Order -> inspection -> exact line order. The private core reuses those
  -- locks, so quote import, PDF finalization, signing and autosave cannot form
  -- an inspection/line lock-order cycle.
  select line.work_order_id
    into v_work_order_id
  from public.work_order_lines line
  where line.id = p_work_order_line_id
    and line.shop_id = p_shop_id;

  if v_work_order_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'Work-order line not found for shop.';
  end if;

  perform 1
  from public.work_orders work_order
  where work_order.id = v_work_order_id
    and work_order.shop_id = p_shop_id
  for update;
  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'Work order not found for shop.';
  end if;

  perform 1
  from public.inspections inspection
  where inspection.work_order_line_id = p_work_order_line_id
    and inspection.shop_id = p_shop_id
    and inspection.work_order_id = v_work_order_id
    and coalesce(inspection.is_canonical, false)
  for update;

  perform 1
  from public.work_order_lines line
  where line.id = p_work_order_line_id
    and line.shop_id = p_shop_id
    and line.work_order_id = v_work_order_id
  for update;
  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'Work-order line changed before authorization completed.';
  end if;

  -- Shop-wide inspection roles retain their established access. A mechanic's
  -- capability is scoped to the repair lines explicitly assigned to their
  -- canonical profile (including legacy auth-user identifiers).
  if v_actor_role = 'mechanic'
     and not exists (
       select 1
       from public.work_order_lines line
       where line.id = p_work_order_line_id
         and line.shop_id = p_shop_id
         and line.work_order_id = v_work_order_id
         and (
           line.assigned_tech_id in (
             v_actor_profile_id,
             v_core_actor_user_id
           )
           or line.assigned_to in (
             v_actor_profile_id,
             v_core_actor_user_id
           )
           or exists (
             select 1
             from public.work_order_line_technicians assignment
             where assignment.work_order_line_id = line.id
               and assignment.technician_id in (
                 v_actor_profile_id,
                 v_core_actor_user_id
               )
           )
         )
     ) then
    raise exception using
      errcode = '42501',
      message = 'Inspection progress is limited to the assigned technician.';
  end if;

  return private.save_inspection_progress_v3_core(
    p_shop_id,
    p_work_order_line_id,
    v_core_actor_user_id,
    p_session,
    p_operation_key,
    p_at
  );
end;
$$;

-- Recreate both installed-client compatibility signatures after moving the
-- original implementation so neither can retain a direct path to the core.
create or replace function public.save_inspection_progress_v2_atomic(
  p_shop_id uuid,
  p_work_order_line_id uuid,
  p_actor_user_id uuid,
  p_session jsonb,
  p_operation_key text,
  p_at timestamptz default now()
) returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.save_inspection_progress_v3_atomic(
    p_shop_id,
    p_work_order_line_id,
    p_actor_user_id,
    p_session,
    p_operation_key,
    p_at
  );
$$;

create or replace function public.save_inspection_progress_atomic(
  p_shop_id uuid,
  p_work_order_line_id uuid,
  p_actor_user_id uuid,
  p_session jsonb,
  p_operation_key text,
  p_at timestamptz default now()
) returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.save_inspection_progress_v3_atomic(
    p_shop_id,
    p_work_order_line_id,
    p_actor_user_id,
    p_session,
    p_operation_key,
    p_at
  );
$$;

revoke all on function public.save_inspection_progress_atomic(
  uuid, uuid, uuid, jsonb, text, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.save_inspection_progress_v2_atomic(
  uuid, uuid, uuid, jsonb, text, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.save_inspection_progress_v3_atomic(
  uuid, uuid, uuid, jsonb, text, timestamptz
) from public, anon, authenticated, service_role;

grant execute on function public.save_inspection_progress_atomic(
  uuid, uuid, uuid, jsonb, text, timestamptz
) to authenticated, service_role;
grant execute on function public.save_inspection_progress_v2_atomic(
  uuid, uuid, uuid, jsonb, text, timestamptz
) to authenticated, service_role;
grant execute on function public.save_inspection_progress_v3_atomic(
  uuid, uuid, uuid, jsonb, text, timestamptz
) to authenticated, service_role;

comment on function public.save_inspection_progress_v3_atomic(
  uuid, uuid, uuid, jsonb, text, timestamptz
) is
  'Capability-gated canonical inspection writer. Mechanics must be assigned to the target repair line; compatibility names delegate here.';

-- Signing is also an authenticated canonical inspection mutation. Preserve the
-- established public signature and customer-signature behavior, while moving
-- the existing role/evidence implementation behind the same Workspace gate.
alter function public.sign_inspection(
  uuid, text, text, bigint, text, text
) set schema private;

alter function private.sign_inspection(
  uuid, text, text, bigint, text, text
) rename to sign_inspection_core;

alter function private.sign_inspection_core(
  uuid, text, text, bigint, text, text
) set search_path to '';

revoke all on function private.sign_inspection_core(
  uuid, text, text, bigint, text, text
) from public, anon, authenticated, service_role;

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
set search_path = ''
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_actor_profile_id uuid;
  v_actor_role text;
  v_actor_can_run_inspections boolean := false;
  v_inspection_shop_id uuid;
  v_work_order_id uuid;
  v_work_order_line_id uuid;
  v_locked boolean := false;
  v_completed boolean := false;
  v_is_draft boolean := true;
  v_finalized_at timestamptz;
  v_signing_cycle bigint := 0;
  v_summary jsonb := '{}'::jsonb;
  v_inspection_revision bigint := 0;
  v_same_actor_retry boolean := false;
begin
  if v_actor_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication is required to sign an inspection.';
  end if;

  select
    inspection.shop_id,
    inspection.work_order_id,
    inspection.work_order_line_id
    into v_inspection_shop_id, v_work_order_id, v_work_order_line_id
  from public.inspections inspection
  where inspection.id = p_inspection_id
    and coalesce(inspection.is_canonical, false);

  if v_inspection_shop_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'Inspection was not found.';
  end if;

  select
    profile.id,
    private.workspace_canonical_role(profile.role::text)
    into v_actor_profile_id, v_actor_role
  from public.profiles profile
  where profile.shop_id = v_inspection_shop_id
    and (profile.id = v_actor_user_id or profile.user_id = v_actor_user_id)
  order by
    (profile.id = v_actor_user_id) desc,
    profile.updated_at desc nulls last,
    profile.id
  limit 1;

  if v_actor_profile_id is null then
    raise exception using
      errcode = '42501',
      message = 'Inspection does not belong to the authenticated user shop.';
  end if;

  -- p_role describes the evidence being recorded, not the caller class. This
  -- staff-only RPC must authorize technician, advisor, and staff-captured
  -- customer acknowledgement through the same capability boundary.
  select decision.granted
    into v_actor_can_run_inspections
  from private.resolve_workspace_profile_capability(
    v_actor_profile_id,
    v_inspection_shop_id,
    'work_order.inspection.run'
  ) decision;

  if not coalesce(v_actor_can_run_inspections, false) then
    raise exception using
      errcode = '42501',
      message = 'Inspection capability is required to sign an inspection.';
  end if;

  -- Match the canonical Work Order -> inspection -> exact line lock order used
  -- by the other inspection writers. The initial inspection read above is
  -- revalidated under these locks before assignment or lifecycle decisions.
  if v_work_order_id is not null then
    perform 1
    from public.work_orders work_order
    where work_order.id = v_work_order_id
      and work_order.shop_id = v_inspection_shop_id
    for update;
    if not found then
      raise exception using
        errcode = '42501',
        message = 'Inspection work order is not available in this shop.';
    end if;
  end if;

  select
    coalesce(inspection.locked, false),
    coalesce(inspection.completed, false),
    coalesce(inspection.is_draft, true),
    inspection.finalized_at,
    coalesce(inspection.signing_cycle, 0),
    coalesce(inspection.summary, '{}'::jsonb)
    into
      v_locked,
      v_completed,
      v_is_draft,
      v_finalized_at,
      v_signing_cycle,
      v_summary
  from public.inspections inspection
  where inspection.id = p_inspection_id
    and inspection.shop_id = v_inspection_shop_id
    and inspection.work_order_id is not distinct from v_work_order_id
    and inspection.work_order_line_id is not distinct from v_work_order_line_id
    and coalesce(inspection.is_canonical, false)
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'Inspection changed before signing.';
  end if;

  if v_work_order_line_id is not null then
    perform 1
    from public.work_order_lines line
    where line.id = v_work_order_line_id
      and line.shop_id = v_inspection_shop_id
      and line.work_order_id is not distinct from v_work_order_id
    for update;
    if not found then
      raise exception using
        errcode = '42501',
        message = 'Inspection repair line is not available in this shop.';
    end if;
  end if;

  if coalesce(v_summary->>'syncRevision', '') ~ '^[0-9]+$' then
    v_inspection_revision := (v_summary->>'syncRevision')::bigint;
  end if;

  v_same_actor_retry := (
    v_locked
    or v_completed
    or not v_is_draft
    or v_finalized_at is not null
  ) and exists (
    select 1
    from public.inspection_signatures signature
    where signature.inspection_id = p_inspection_id
      and signature.role = p_role
      and signature.signing_cycle = v_signing_cycle
      and signature.signed_sync_revision = v_inspection_revision
      and signature.signed_by = v_actor_user_id
      and p_expected_sync_revision = v_inspection_revision
      and (
        coalesce(p_role, '') <> 'customer'
        or signature.signed_name is not distinct from
          nullif(pg_catalog.btrim(p_signed_name), '')
      )
  );

  if v_actor_role = 'mechanic'
     and v_work_order_line_id is not null
     and not v_same_actor_retry
     and not exists (
         select 1
         from public.work_order_lines line
         where line.id = v_work_order_line_id
           and line.shop_id = v_inspection_shop_id
           and (
             line.assigned_tech_id in (v_actor_profile_id, v_actor_user_id)
             or line.assigned_to in (v_actor_profile_id, v_actor_user_id)
             or exists (
               select 1
               from public.work_order_line_technicians assignment
               where assignment.work_order_line_id = line.id
                 and assignment.technician_id in (
                   v_actor_profile_id,
                   v_actor_user_id
                 )
             )
           )
       )
     then
    raise exception using
      errcode = '42501',
      message = 'Inspection signing is limited to the assigned technician.';
  end if;

  perform private.sign_inspection_core(
    p_inspection_id,
    p_role,
    p_signed_name,
    p_expected_sync_revision,
    p_signature_image_path,
    p_signature_hash
  );
end;
$$;

revoke all on function public.sign_inspection(
  uuid, text, text, bigint, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.sign_inspection(
  uuid, text, text, bigint, text, text
) to authenticated, service_role;

comment on function public.sign_inspection(
  uuid, text, text, bigint, text, text
) is
  'Capability-gated staff inspection signature writer. Evidence role never bypasses authorization; mechanics must be assigned unless recovering their exact committed signature.';

-- Signed-report attachment updates the inspection, whose synchronization
-- trigger then updates its Work Order. Move the established implementation
-- behind a parent-first wrapper so it cannot deadlock against autosave's
-- Work Order -> inspection lock order. The immutable signature receipt remains
-- the authority for recovery after a technician is reassigned.
alter function public.attach_signed_inspection_pdf_atomic(
  uuid, uuid, uuid, bigint, text, text, text
) set schema private;

alter function private.attach_signed_inspection_pdf_atomic(
  uuid, uuid, uuid, bigint, text, text, text
) rename to attach_signed_inspection_pdf_core;

alter function private.attach_signed_inspection_pdf_core(
  uuid, uuid, uuid, bigint, text, text, text
) set search_path to '';

revoke all on function private.attach_signed_inspection_pdf_core(
  uuid, uuid, uuid, bigint, text, text, text
) from public, anon, authenticated, service_role;

create or replace function public.attach_signed_inspection_pdf_atomic(
  p_inspection_id uuid,
  p_work_order_line_id uuid,
  p_actor_user_id uuid,
  p_expected_sync_revision bigint,
  p_pdf_storage_path text,
  p_pdf_sha256 text,
  p_pdf_url text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_is_service_role boolean :=
    coalesce(auth.jwt() ->> 'role', '') = 'service_role'
    or coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role';
  v_inspection_shop_id uuid;
  v_work_order_id uuid;
begin
  if v_auth_user_id is null and not v_is_service_role then
    raise exception using
      errcode = '42501',
      message = 'Authentication is required.';
  end if;
  if v_auth_user_id is not null
     and v_auth_user_id is distinct from p_actor_user_id then
    raise exception using
      errcode = '42501',
      message = 'Actor identity mismatch';
  end if;

  -- Resolve the parent without taking the inspection row lock. Revalidate the
  -- complete anchor after the exact Work Order lock is held.
  select inspection.shop_id, inspection.work_order_id
    into v_inspection_shop_id, v_work_order_id
  from public.inspections inspection
  where inspection.id = p_inspection_id
    and inspection.work_order_line_id = p_work_order_line_id
    and coalesce(inspection.is_canonical, false);
  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'Inspection not found';
  end if;
  if v_work_order_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'Inspection is missing its work order';
  end if;

  perform 1
  from public.work_orders work_order
  where work_order.id = v_work_order_id
    and work_order.shop_id = v_inspection_shop_id
  for update;
  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'Inspection work order is not available';
  end if;

  perform 1
  from public.inspections inspection
  where inspection.id = p_inspection_id
    and inspection.shop_id = v_inspection_shop_id
    and inspection.work_order_id = v_work_order_id
    and inspection.work_order_line_id = p_work_order_line_id
    and coalesce(inspection.is_canonical, false)
  for update;
  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'Inspection changed before report attachment';
  end if;

  return private.attach_signed_inspection_pdf_core(
    p_inspection_id,
    p_work_order_line_id,
    p_actor_user_id,
    p_expected_sync_revision,
    p_pdf_storage_path,
    p_pdf_sha256,
    p_pdf_url
  );
end;
$$;

revoke all on function public.attach_signed_inspection_pdf_atomic(
  uuid, uuid, uuid, bigint, text, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.attach_signed_inspection_pdf_atomic(
  uuid, uuid, uuid, bigint, text, text, text
) to authenticated, service_role;

comment on function public.attach_signed_inspection_pdf_atomic(
  uuid, uuid, uuid, bigint, text, text, text
) is
  'Parent-first immutable inspection report attachment; the private core preserves exact signature actor, revision, path, and idempotency checks.';

-- Reopening changes canonical inspection state and therefore must honor an
-- effective capability deny in addition to the established role allow-list.
alter function public.reopen_inspection(uuid, text) set schema private;
alter function private.reopen_inspection(uuid, text)
  rename to reopen_inspection_core;

alter function private.reopen_inspection_core(uuid, text)
  set search_path to '';

revoke all on function private.reopen_inspection_core(uuid, text)
  from public, anon, authenticated, service_role;

create or replace function public.reopen_inspection(
  p_inspection_id uuid,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_actor_profile_id uuid;
  v_actor_can_run_inspections boolean := false;
  v_inspection_shop_id uuid;
  v_work_order_id uuid;
begin
  if v_actor_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication is required to reopen an inspection.';
  end if;

  select inspection.shop_id, inspection.work_order_id
    into v_inspection_shop_id, v_work_order_id
  from public.inspections inspection
  where inspection.id = p_inspection_id
    and coalesce(inspection.is_canonical, false);

  if v_inspection_shop_id is null then
    raise exception using
      errcode = 'P0002',
      message = 'Canonical inspection was not found.';
  end if;

  select profile.id
    into v_actor_profile_id
  from public.profiles profile
  where profile.shop_id = v_inspection_shop_id
    and (profile.id = v_actor_user_id or profile.user_id = v_actor_user_id)
  order by
    (profile.id = v_actor_user_id) desc,
    profile.updated_at desc nulls last,
    profile.id
  limit 1;

  if v_actor_profile_id is null then
    raise exception using
      errcode = '42501',
      message = 'Inspection does not belong to the authenticated user shop.';
  end if;

  select decision.granted
    into v_actor_can_run_inspections
  from private.resolve_workspace_profile_capability(
    v_actor_profile_id,
    v_inspection_shop_id,
    'work_order.inspection.run'
  ) decision;

  if not coalesce(v_actor_can_run_inspections, false) then
    raise exception using
      errcode = '42501',
      message = 'Inspection capability is required to reopen an inspection.';
  end if;

  -- The private core updates the inspection and its reopen trigger updates the
  -- parent Work Order. Lock the parent first, then revalidate the canonical
  -- inspection anchor under its row lock before delegating to the unchanged
  -- lifecycle implementation.
  if v_work_order_id is not null then
    perform 1
    from public.work_orders work_order
    where work_order.id = v_work_order_id
      and work_order.shop_id = v_inspection_shop_id
    for update;
    if not found then
      raise exception using
        errcode = 'P0002',
        message = 'Canonical inspection work order was not found.';
    end if;
  end if;

  perform 1
  from public.inspections inspection
  where inspection.id = p_inspection_id
    and inspection.shop_id = v_inspection_shop_id
    and inspection.work_order_id is not distinct from v_work_order_id
    and coalesce(inspection.is_canonical, false)
  for update;
  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Canonical inspection changed before reopening.';
  end if;

  return private.reopen_inspection_core(p_inspection_id, p_reason);
end;
$$;

revoke all on function public.reopen_inspection(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.reopen_inspection(uuid, text)
  to authenticated;

comment on function public.reopen_inspection(uuid, text) is
  'Capability-gated canonical inspection reopen command; the established role and lifecycle checks remain in the private core.';

-- Inspection-to-quote import is also an inspection mutation. Preserve the
-- installed public signature and existing quote/parts implementation, but keep
-- the receipt-bearing engine private so caller identity, capability, tenant,
-- canonical source line, and assignment are all checked first.
alter function public.import_inspection_quote_package_atomic(
  uuid, uuid, uuid, uuid, uuid, text, jsonb, timestamptz
) set schema private;

alter function private.import_inspection_quote_package_atomic(
  uuid, uuid, uuid, uuid, uuid, text, jsonb, timestamptz
) rename to import_inspection_quote_package_core;

alter function private.import_inspection_quote_package_core(
  uuid, uuid, uuid, uuid, uuid, text, jsonb, timestamptz
) set search_path to '';

revoke all on function private.import_inspection_quote_package_core(
  uuid, uuid, uuid, uuid, uuid, text, jsonb, timestamptz
) from public, anon, authenticated, service_role;

create or replace function public.import_inspection_quote_package_atomic(
  p_shop_id uuid,
  p_work_order_id uuid,
  p_inspection_id uuid,
  p_requested_vehicle_id uuid,
  p_actor_user_id uuid,
  p_operation_key text,
  p_items jsonb,
  p_at timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_is_service_role boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
  v_actor_profile_id uuid;
  v_actor_linked_user_id uuid;
  v_core_actor_user_id uuid;
  v_actor_role text;
  v_actor_can_run_inspections boolean := false;
  v_inspection_work_order_id uuid;
  v_source_line_id uuid;
  v_receipt_actor_user_id uuid;
  v_receipt_work_order_id uuid;
  v_receipt_result jsonb;
begin
  if v_auth_user_id is null and not v_is_service_role then
    raise exception using
      errcode = '42501',
      message = 'Authentication is required to import inspection findings.';
  end if;

  if nullif(trim(p_operation_key), '') is null then
    raise exception using
      errcode = 'P0001',
      message = 'A stable operation key is required.';
  end if;

  select
    profile.id,
    profile.user_id,
    private.workspace_canonical_role(profile.role::text)
    into v_actor_profile_id, v_actor_linked_user_id, v_actor_role
  from public.profiles profile
  where profile.shop_id = p_shop_id
    and (profile.id = p_actor_user_id or profile.user_id = p_actor_user_id)
    and (
      v_is_service_role
      or profile.id = v_auth_user_id
      or profile.user_id = v_auth_user_id
    )
  order by
    (profile.user_id = p_actor_user_id) desc,
    (profile.id = p_actor_user_id) desc,
    profile.updated_at desc nulls last,
    profile.id
  limit 1;

  if v_actor_profile_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authenticated import actor is not available for this shop.';
  end if;

  if not v_is_service_role then
    v_core_actor_user_id := v_auth_user_id;
  else
    v_core_actor_user_id := v_actor_linked_user_id;
    if v_core_actor_user_id is null
       and exists (
         select 1
         from auth.users auth_user
         where auth_user.id = v_actor_profile_id
       ) then
      v_core_actor_user_id := v_actor_profile_id;
    end if;
  end if;

  if v_core_actor_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Inspection import actor is not linked to an authenticated user.';
  end if;

  select decision.granted
    into v_actor_can_run_inspections
  from private.resolve_workspace_profile_capability(
    v_actor_profile_id,
    p_shop_id,
    'work_order.inspection.run'
  ) decision;

  if not coalesce(v_actor_can_run_inspections, false) then
    raise exception using
      errcode = '42501',
      message = 'Inspection capability is required to import findings.';
  end if;

  -- The receipt key is tenant-global, while the protected Work Order lock is
  -- target-specific. Serialize the key first so two different Work Orders
  -- cannot both miss the receipt and let the private core replay one actor's
  -- result to the other transaction.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_shop_id::text || ':inspection_quote_import:' || p_operation_key,
      0
    )
  );

  -- Match the private engine's canonical lock order before reading its receipt.
  -- This also serializes concurrent first attempts for one work order.
  perform 1
  from public.work_orders work_order
  where work_order.id = p_work_order_id
    and work_order.shop_id = p_shop_id
  for update;
  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'Work order not found for shop.';
  end if;

  select inspection.work_order_id, inspection.work_order_line_id
    into v_inspection_work_order_id, v_source_line_id
  from public.inspections inspection
  where inspection.id = p_inspection_id
    and inspection.shop_id = p_shop_id
    and coalesce(inspection.is_canonical, false)
  for update;
  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'Canonical inspection not found for shop.';
  end if;
  if v_inspection_work_order_id is distinct from p_work_order_id
     or v_source_line_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'Inspection is not anchored to this work order.';
  end if;

  perform 1
  from public.work_order_lines line
  where line.id = v_source_line_id
    and line.shop_id = p_shop_id
    and line.work_order_id = p_work_order_id
  for update;
  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'Inspection source line is not anchored to this work order.';
  end if;

  select receipt.actor_user_id, receipt.work_order_id, receipt.result
    into v_receipt_actor_user_id, v_receipt_work_order_id, v_receipt_result
  from public.quote_lifecycle_operation_keys receipt
  where receipt.shop_id = p_shop_id
    and receipt.operation_name = 'inspection_quote_import'
    and receipt.operation_key = p_operation_key;
  if found then
    if v_receipt_work_order_id is distinct from p_work_order_id
       or not (
         v_receipt_actor_user_id is not distinct from v_core_actor_user_id
         or v_receipt_actor_user_id is not distinct from v_actor_profile_id
       )
       or coalesce(v_receipt_result ->> 'sourceWorkOrderLineId', '')
            is distinct from v_source_line_id::text then
      raise exception using
        errcode = 'P0001',
        message = 'Inspection import operation key belongs to a different actor, work order, or source line.';
    end if;

    -- Receipts written before this gate could retain an imported profile UUID.
    -- Normalize that accepted alias while holding the operation lock so every
    -- retry and downstream audit row is bound to the linked auth subject.
    if v_receipt_actor_user_id is distinct from v_core_actor_user_id then
      update public.quote_lifecycle_operation_keys receipt
      set actor_user_id = v_core_actor_user_id
      where receipt.shop_id = p_shop_id
        and receipt.operation_name = 'inspection_quote_import'
        and receipt.operation_key = p_operation_key
        and receipt.actor_user_id is not distinct from v_receipt_actor_user_id;
    end if;

    -- The private core already committed this exact actor/Work Order/source-line
    -- result. Return it before current mechanic assignment so response-loss
    -- recovery cannot create new side effects after dispatch reassigns the line.
    return coalesce(v_receipt_result, '{}'::jsonb)
      || jsonb_build_object('idempotent', true);
  end if;

  if v_actor_role = 'mechanic'
     and not exists (
       select 1
       from public.work_order_lines line
       where line.id = v_source_line_id
         and line.shop_id = p_shop_id
         and line.work_order_id = p_work_order_id
         and (
           line.assigned_tech_id in (
             v_actor_profile_id,
             v_actor_linked_user_id,
             v_core_actor_user_id
           )
           or line.assigned_to in (
             v_actor_profile_id,
             v_actor_linked_user_id,
             v_core_actor_user_id
           )
           or exists (
             select 1
             from public.work_order_line_technicians assignment
             where assignment.work_order_line_id = line.id
               and assignment.technician_id in (
                 v_actor_profile_id,
                 v_actor_linked_user_id,
                 v_core_actor_user_id
               )
           )
         )
     ) then
    raise exception using
      errcode = '42501',
      message = 'Inspection import is limited to the assigned technician.';
  end if;

  return private.import_inspection_quote_package_core(
    p_shop_id,
    p_work_order_id,
    p_inspection_id,
    p_requested_vehicle_id,
    v_core_actor_user_id,
    p_operation_key,
    p_items,
    p_at
  );
end;
$$;

revoke all on function public.import_inspection_quote_package_atomic(
  uuid, uuid, uuid, uuid, uuid, text, jsonb, timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.import_inspection_quote_package_atomic(
  uuid, uuid, uuid, uuid, uuid, text, jsonb, timestamptz
) to authenticated, service_role;

comment on function public.import_inspection_quote_package_atomic(
  uuid, uuid, uuid, uuid, uuid, text, jsonb, timestamptz
) is
  'Capability-gated compatibility wrapper for canonical inspection finding import; mechanics must be assigned to the exact source repair line.';

-- Technician signing materializes eligible findings immediately before it
-- finalizes the immutable inspection snapshot. Keep those two established
-- commands, but execute them inside one database transaction so dispatch
-- reassignment cannot commit between the import and signature boundaries.
create or replace function public.import_inspection_findings_and_sign_atomic(
  p_shop_id uuid,
  p_work_order_id uuid,
  p_inspection_id uuid,
  p_requested_vehicle_id uuid,
  p_actor_user_id uuid,
  p_operation_key text,
  p_items jsonb,
  p_role text,
  p_signed_name text,
  p_expected_sync_revision bigint,
  p_signature_image_path text default null,
  p_signature_hash text default null,
  p_at timestamptz default now()
) returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_import_result jsonb;
begin
  if p_role is distinct from 'technician' then
    raise exception using
      errcode = '22023',
      message = 'Atomic inspection finding import is limited to technician signing.';
  end if;

  v_import_result := public.import_inspection_quote_package_atomic(
    p_shop_id,
    p_work_order_id,
    p_inspection_id,
    p_requested_vehicle_id,
    p_actor_user_id,
    p_operation_key,
    p_items,
    p_at
  );

  perform public.sign_inspection(
    p_inspection_id,
    p_role,
    p_signed_name,
    p_expected_sync_revision,
    p_signature_image_path,
    p_signature_hash
  );

  return coalesce(v_import_result, '{}'::jsonb)
    || jsonb_build_object('signedAtomically', true);
end;
$$;

revoke all on function public.import_inspection_findings_and_sign_atomic(
  uuid, uuid, uuid, uuid, uuid, text, jsonb, text, text, bigint, text, text,
  timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.import_inspection_findings_and_sign_atomic(
  uuid, uuid, uuid, uuid, uuid, text, jsonb, text, text, bigint, text, text,
  timestamptz
) to authenticated;

comment on function public.import_inspection_findings_and_sign_atomic(
  uuid, uuid, uuid, uuid, uuid, text, jsonb, text, text, bigint, text, text,
  timestamptz
) is
  'Authenticated technician command that imports canonical findings and signs the exact inspection revision in one transaction.';

-- Work Order inspection photos are uploaded after their bytes are hashed, so
-- the application-level authorization above that work can no longer be the
-- final write decision.  Keep the established early check for fast failures,
-- then serialize capability administration and line reassignment with the
-- durable Storage receipt.  This helper intentionally owns only inspection
-- photo paths; the broader job-photo visibility and media mutation contract is
-- repaired by the later Work Order media isolation migration.
create or replace function private.authorize_work_order_inspection_photo_write(
  p_shop_id uuid,
  p_work_order_id uuid,
  p_work_order_line_id uuid,
  p_inspection_id uuid default null
) returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_actor_profile_id uuid;
  v_actor_linked_user_id uuid;
  v_actor_role text;
  v_actor_can_run_inspections boolean := false;
  v_canonical_inspection_id uuid;
begin
  if v_actor_user_id is null
     or p_shop_id is null
     or p_work_order_id is null
     or p_work_order_line_id is null then
    return false;
  end if;

  -- Capability mutations use this exact tenant/capability lock. Waiting here
  -- before resolving the effective decision means a committed deny always wins
  -- before any new photo receipt is allowed to become durable.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'workspace-authorization:' || p_shop_id::text || ':work_order.inspection.run',
      0
    )
  );

  perform 1
  from public.work_orders work_order
  where work_order.id = p_work_order_id
    and work_order.shop_id = p_shop_id
  for update;
  if not found then
    return false;
  end if;

  select inspection.id
    into v_canonical_inspection_id
  from public.inspections inspection
  where inspection.shop_id = p_shop_id
    and inspection.work_order_id = p_work_order_id
    and inspection.work_order_line_id = p_work_order_line_id
    and coalesce(inspection.is_canonical, false)
    and (p_inspection_id is null or inspection.id = p_inspection_id)
  order by inspection.id
  limit 1
  for update;
  if v_canonical_inspection_id is null then
    return false;
  end if;

  perform 1
  from public.work_order_lines line
  where line.id = p_work_order_line_id
    and line.shop_id = p_shop_id
    and line.work_order_id = p_work_order_id
  for update;
  if not found then
    return false;
  end if;

  -- The installed assignment writers do not share one profile/domain lock
  -- order: human assignment reaches the line first, while Assistant bulk
  -- assignment locks its target profile first. The exact line lock above is
  -- the assignment serialization boundary, so keep this identity lookup
  -- lock-free rather than introducing either inverse profile lock order.
  select
    profile.id,
    profile.user_id,
    private.workspace_canonical_role(profile.role::text)
    into
      v_actor_profile_id,
      v_actor_linked_user_id,
      v_actor_role
  from public.profiles profile
  where profile.shop_id = p_shop_id
    and (
      profile.id = v_actor_user_id
      or profile.user_id = v_actor_user_id
    )
  order by
    (profile.user_id = v_actor_user_id) desc,
    (profile.id = v_actor_user_id) desc,
    profile.updated_at desc nulls last,
    profile.id
  limit 1;
  if v_actor_profile_id is null then
    return false;
  end if;

  select decision.granted
    into v_actor_can_run_inspections
  from private.resolve_workspace_profile_capability(
    v_actor_profile_id,
    p_shop_id,
    'work_order.inspection.run'
  ) decision;
  if not coalesce(v_actor_can_run_inspections, false) then
    return false;
  end if;

  if v_actor_role = 'mechanic'
     and not exists (
       select 1
       from public.work_order_lines line
       where line.id = p_work_order_line_id
         and line.shop_id = p_shop_id
         and line.work_order_id = p_work_order_id
         and (
           line.assigned_tech_id in (
             v_actor_profile_id,
             v_actor_linked_user_id,
             v_actor_user_id
           )
           or line.assigned_to in (
             v_actor_profile_id,
             v_actor_linked_user_id,
             v_actor_user_id
           )
           or exists (
             select 1
             from public.work_order_line_technicians assignment
             where assignment.work_order_line_id = line.id
               and assignment.technician_id in (
                 v_actor_profile_id,
                 v_actor_linked_user_id,
                 v_actor_user_id
               )
           )
         )
     ) then
    return false;
  end if;

  return true;
end;
$$;

revoke all on function private.authorize_work_order_inspection_photo_write(
  uuid, uuid, uuid, uuid
) from public, anon, authenticated, service_role;

comment on function private.authorize_work_order_inspection_photo_write(
  uuid, uuid, uuid, uuid
) is
  'Internal lock-aware capability and exact-line assignment decision for a canonical Work Order inspection photo write.';

create or replace function private.work_order_inspection_photo_storage_insert_access(
  p_name text,
  p_owner_id text
) returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_owner_user_id uuid;
  v_match text[];
  v_work_order_id uuid;
  v_work_order_line_id uuid;
  v_shop_id uuid;
begin
  if v_actor_user_id is null then
    return false;
  end if;

  v_match := pg_catalog.regexp_match(
    coalesce(p_name, ''),
    '^wo/([0-9a-fA-F-]{36})/lines/([0-9a-fA-F-]{36})/ip-[0-9a-f]{40}_[0-9a-f]{32}\.(jpg|png)$'
  );
  if v_match is null then
    return false;
  end if;

  begin
    v_work_order_id := v_match[1]::uuid;
    v_work_order_line_id := v_match[2]::uuid;
    v_owner_user_id := nullif(pg_catalog.btrim(coalesce(p_owner_id, '')), '')::uuid;
  exception when invalid_text_representation then
    return false;
  end;
  if v_owner_user_id is distinct from v_actor_user_id then
    return false;
  end if;

  select work_order.shop_id
    into v_shop_id
  from public.work_orders work_order
  join public.work_order_lines line
    on line.id = v_work_order_line_id
   and line.work_order_id = work_order.id
   and line.shop_id = work_order.shop_id
  where work_order.id = v_work_order_id;
  if v_shop_id is null then
    return false;
  end if;

  return private.authorize_work_order_inspection_photo_write(
    v_shop_id,
    v_work_order_id,
    v_work_order_line_id,
    null
  );
end;
$$;

revoke all on function private.work_order_inspection_photo_storage_insert_access(
  text, text
) from public, anon, authenticated, service_role;
grant execute on function private.work_order_inspection_photo_storage_insert_access(
  text, text
) to authenticated;

comment on function private.work_order_inspection_photo_storage_insert_access(
  text, text
) is
  'Authenticated Storage INSERT decision for route-generated canonical Work Order inspection photo paths.';

-- A permissive policy supplies the route's new authenticated upload grant. A
-- restrictive companion makes this authorization mandatory for the same
-- route-owned path even if an existing project has a broader dashboard-created
-- permissive policy. Non-inspection job-photo names keep their existing state.
drop policy if exists job_photos_inspection_photo_insert on storage.objects;
create policy job_photos_inspection_photo_insert
on storage.objects
as permissive
for insert
to authenticated
with check (
  bucket_id = 'job-photos'
  and private.work_order_inspection_photo_storage_insert_access(
    name,
    coalesce(nullif(owner_id, ''), owner::text)
  )
);

drop policy if exists job_photos_inspection_photo_insert_boundary
  on storage.objects;
create policy job_photos_inspection_photo_insert_boundary
on storage.objects
as restrictive
for insert
to authenticated
with check (
  bucket_id <> 'job-photos'
  or name !~ '^wo/[0-9a-fA-F-]{36}/lines/[0-9a-fA-F-]{36}/ip-[0-9a-f]{40}_[0-9a-f]{32}\.(jpg|png)$'
  or private.work_order_inspection_photo_storage_insert_access(
    name,
    coalesce(nullif(owner_id, ''), owner::text)
  )
);

-- Attach the durable object receipt to the canonical inspection under the same
-- authorization and lock order. Keep the established public-bucket URL contract
-- until the later private-bucket migration changes all readers together.
create or replace function public.save_work_order_inspection_photo_evidence_atomic(
  p_inspection_id uuid,
  p_shop_id uuid,
  p_work_order_id uuid,
  p_work_order_line_id uuid,
  p_storage_bucket text,
  p_storage_path text,
  p_item_name text,
  p_notes text
) returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_expected_prefix text;
  v_signed_suffix text;
  v_public_suffix text;
  v_image_url text;
  v_photo public.inspection_photos%rowtype;
  v_inserted boolean := false;
begin
  if v_actor_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication is required to attach an inspection photo.';
  end if;
  if p_shop_id is null
     or p_work_order_id is null
     or p_work_order_line_id is null
     or p_inspection_id is null
     or p_storage_bucket is distinct from 'job-photos'
     or nullif(pg_catalog.btrim(coalesce(p_storage_path, '')), '') is null then
    raise exception using
      errcode = '22023',
      message = 'Canonical inspection photo scope and evidence are required.';
  end if;

  v_expected_prefix :=
    'wo/' || p_work_order_id::text ||
    '/lines/' || p_work_order_line_id::text || '/';
  if p_storage_path !~ (
    '^' || v_expected_prefix ||
    'ip-[0-9a-f]{40}_[0-9a-f]{32}\.(jpg|png)$'
  ) then
    raise exception using
      errcode = '22023',
      message = 'Inspection photo path does not match the exact Work Order line.';
  end if;

  v_signed_suffix := '/storage/v1/object/sign/job-photos/' || p_storage_path;
  v_public_suffix := '/storage/v1/object/public/job-photos/' || p_storage_path;
  -- #1557 leaves the existing public bucket contract unchanged. Persist a
  -- stable object URL rather than a short-lived signed token; the later media
  -- isolation migration replaces this same RPC signature when it makes the
  -- bucket private and updates all readers together.
  v_image_url := v_public_suffix;

  if not private.authorize_work_order_inspection_photo_write(
    p_shop_id,
    p_work_order_id,
    p_work_order_line_id,
    p_inspection_id
  ) then
    raise exception using
      errcode = '42501',
      message = 'Inspection photo access is limited to an authorized assigned actor.';
  end if;

  perform 1
  from storage.objects object
  where object.bucket_id = p_storage_bucket
    and object.name = p_storage_path
    and coalesce(nullif(object.owner_id, ''), object.owner::text)
      = v_actor_user_id::text
  for update;
  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'Authorized inspection photo object receipt was not found.';
  end if;

  perform 1
  from public.work_order_media media
  where media.shop_id = p_shop_id
    and media.work_order_id = p_work_order_id
    and media.work_order_line_id = p_work_order_line_id
    and media.user_id = v_actor_user_id
    and media.storage_bucket = p_storage_bucket
    and media.storage_path = p_storage_path
  for update;
  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'Authorized Work Order media receipt was not found.';
  end if;

  select photo.*
    into v_photo
  from public.inspection_photos photo
  where photo.inspection_id = p_inspection_id
    and (
      pg_catalog.right(
        pg_catalog.split_part(photo.image_url, '?', 1),
        pg_catalog.length(v_signed_suffix)
      ) = v_signed_suffix
      or pg_catalog.right(
        pg_catalog.split_part(photo.image_url, '?', 1),
        pg_catalog.length(v_public_suffix)
      ) = v_public_suffix
    )
  order by photo.created_at nulls last, photo.id
  limit 1
  for update;

  if found then
    if v_photo.image_url is distinct from v_image_url then
      update public.inspection_photos photo
      set image_url = v_image_url
      where photo.id = v_photo.id
        and photo.inspection_id = p_inspection_id
      returning photo.* into v_photo;
    end if;
  else
    insert into public.inspection_photos (
      inspection_id,
      item_name,
      image_url,
      notes,
      user_id
    ) values (
      p_inspection_id,
      nullif(pg_catalog.btrim(p_item_name), ''),
      v_image_url,
      nullif(pg_catalog.btrim(p_notes), ''),
      v_actor_user_id
    )
    returning * into v_photo;
    v_inserted := true;
  end if;

  return jsonb_build_object(
    'photo', to_jsonb(v_photo),
    'inserted', v_inserted
  );
end;
$$;

revoke all on function public.save_work_order_inspection_photo_evidence_atomic(
  uuid, uuid, uuid, uuid, text, text, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.save_work_order_inspection_photo_evidence_atomic(
  uuid, uuid, uuid, uuid, text, text, text, text
) to authenticated;

comment on function public.save_work_order_inspection_photo_evidence_atomic(
  uuid, uuid, uuid, uuid, text, text, text, text
) is
  'Authenticated atomic inspection photo receipt writer that revalidates capability, canonical scope, exact-line assignment, Storage ownership, and Work Order media registration.';

-- PDF publication uses a service client after the authenticated route has
-- uploaded an immutable object. Keep that service-only contract, while binding
-- its supplied actor and exact line again inside the database transaction.
alter function public.finalize_inspection_pdf_atomic(
  uuid, uuid, uuid, bigint, text, text, text
) set schema private;

alter function private.finalize_inspection_pdf_atomic(
  uuid, uuid, uuid, bigint, text, text, text
) rename to finalize_inspection_pdf_core;

-- The legacy core looked up profiles.id and also wrote that value into the
-- auth.users-backed finalized_by column. Those identities differ for activated
-- imported staff. Keep the lifecycle/PDF contract unchanged while accepting
-- the linked auth subject selected by the public wrapper.
create or replace function private.finalize_inspection_pdf_core(
  p_inspection_id uuid,
  p_work_order_line_id uuid,
  p_actor_user_id uuid,
  p_expected_sync_revision bigint,
  p_pdf_storage_path text,
  p_pdf_sha256 text,
  p_pdf_url text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_authenticated_user_id uuid := auth.uid();
  v_actor_shop_id uuid;
  v_work_order_id uuid;
  v_summary jsonb;
  v_revision bigint := 0;
  v_locked boolean := false;
  v_completed boolean := false;
  v_is_draft boolean := true;
  v_status text := 'draft';
  v_finalized_at timestamptz;
  v_finalized_by uuid;
  v_pdf_sha256 text := lower(coalesce(nullif(trim(p_pdf_sha256), ''), ''));
  v_expected_path text;
  v_now timestamptz := clock_timestamp();
begin
  if v_authenticated_user_id is not null
     and v_authenticated_user_id is distinct from p_actor_user_id then
    raise exception using
      errcode = 'P0001',
      message = 'Authenticated actor does not match the finalization actor.';
  end if;

  if p_expected_sync_revision is null or p_expected_sync_revision < 1 then
    raise exception using
      errcode = 'P0001',
      message = 'A saved inspection revision is required before finalizing.';
  end if;

  select profile.shop_id
    into v_actor_shop_id
  from public.profiles profile
  where profile.id = p_actor_user_id
     or profile.user_id = p_actor_user_id
  order by
    (profile.user_id = p_actor_user_id) desc,
    (profile.id = p_actor_user_id) desc,
    profile.updated_at desc nulls last,
    profile.id
  limit 1;

  if not found or v_actor_shop_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'Finalization actor is not assigned to a shop.';
  end if;

  select
    inspection.work_order_id,
    inspection.summary,
    coalesce(inspection.sync_revision, 0),
    coalesce(inspection.locked, false),
    coalesce(inspection.completed, false),
    coalesce(inspection.is_draft, true),
    coalesce(inspection.status, 'draft'),
    inspection.finalized_at,
    inspection.finalized_by
  into
    v_work_order_id,
    v_summary,
    v_revision,
    v_locked,
    v_completed,
    v_is_draft,
    v_status,
    v_finalized_at,
    v_finalized_by
  from public.inspections inspection
  where inspection.id = p_inspection_id
    and inspection.work_order_line_id = p_work_order_line_id
    and inspection.shop_id = v_actor_shop_id
    and inspection.is_canonical
  for update;

  if not found or v_work_order_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'Canonical inspection was not found for this shop and work-order line.';
  end if;

  if v_summary is null or jsonb_typeof(v_summary) <> 'object' then
    raise exception using
      errcode = 'P0001',
      message = 'Inspection summary is missing or invalid.';
  end if;

  if coalesce(v_summary->>'syncRevision', '') !~ '^[0-9]+$'
     or (v_summary->>'syncRevision')::bigint <> v_revision then
    raise exception using
      errcode = 'P0001',
      message = 'Inspection summary revision does not match the canonical revision.';
  end if;

  if p_expected_sync_revision <> v_revision then
    raise exception using
      errcode = 'P0001',
      message = 'Inspection changed on another device before finalization.';
  end if;

  if (
    v_locked
    or v_completed
    or not v_is_draft
    or v_finalized_at is not null
    or v_finalized_by is not null
    or lower(v_status) in ('completed', 'finalized', 'signed')
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'Inspection is already finalized and locked.';
  end if;

  if v_pdf_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception using
      errcode = 'P0001',
      message = 'A valid finalized PDF content hash is required.';
  end if;

  v_expected_path :=
    'shops/' || v_actor_shop_id::text ||
    '/work_orders/' || v_work_order_id::text ||
    '/inspections/' || p_inspection_id::text ||
    '/line_' || p_work_order_line_id::text ||
    '_r' || v_revision::text ||
    '_' || v_pdf_sha256 || '.pdf';

  if nullif(trim(p_pdf_storage_path), '') is distinct from v_expected_path then
    raise exception using
      errcode = 'P0001',
      message = 'Finalized PDF path does not match the inspection snapshot.';
  end if;

  update public.inspections
  set summary = v_summary,
      pdf_storage_path = v_expected_path,
      pdf_url = nullif(trim(p_pdf_url), ''),
      locked = true,
      completed = true,
      is_draft = false,
      status = 'completed',
      finalized_at = v_now,
      finalized_by = p_actor_user_id,
      updated_at = v_now
  where id = p_inspection_id
    and is_canonical
    and sync_revision = v_revision;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'Inspection changed on another device before finalization.';
  end if;

  return jsonb_build_object(
    'ok', true,
    'inspection_id', p_inspection_id,
    'work_order_id', v_work_order_id,
    'work_order_line_id', p_work_order_line_id,
    'sync_revision', v_revision,
    'pdf_storage_path', v_expected_path,
    'finalized_at', v_now
  );
end;
$$;

revoke all on function private.finalize_inspection_pdf_core(
  uuid, uuid, uuid, bigint, text, text, text
) from public, anon, authenticated, service_role;

create or replace function public.finalize_inspection_pdf_atomic(
  p_inspection_id uuid,
  p_work_order_line_id uuid,
  p_actor_user_id uuid,
  p_expected_sync_revision bigint,
  p_pdf_storage_path text,
  p_pdf_sha256 text,
  p_pdf_url text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_service_role boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
  v_actor_profile_id uuid;
  v_actor_linked_user_id uuid;
  v_actor_shop_id uuid;
  v_actor_role text;
  v_actor_can_run_inspections boolean := false;
  v_work_order_id uuid;
  v_core_actor_user_id uuid;
begin
  if not v_is_service_role then
    raise exception using
      errcode = '42501',
      message = 'Inspection PDF finalization requires the trusted service route.';
  end if;

  select
    profile.id,
    profile.user_id,
    profile.shop_id,
    private.workspace_canonical_role(profile.role::text)
    into
      v_actor_profile_id,
      v_actor_linked_user_id,
      v_actor_shop_id,
      v_actor_role
  from public.profiles profile
  where profile.shop_id is not null
    and (profile.id = p_actor_user_id or profile.user_id = p_actor_user_id)
  order by
    (profile.id = p_actor_user_id) desc,
    (profile.user_id = p_actor_user_id) desc,
    profile.updated_at desc nulls last,
    profile.id
  limit 1;

  if v_actor_profile_id is null or v_actor_shop_id is null then
    raise exception using
      errcode = '42501',
      message = 'Finalization actor is not available for a shop.';
  end if;

  v_core_actor_user_id := v_actor_linked_user_id;
  if v_core_actor_user_id is null
     and exists (
       select 1
       from auth.users auth_user
       where auth_user.id = v_actor_profile_id
     ) then
    v_core_actor_user_id := v_actor_profile_id;
  end if;
  if v_core_actor_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Finalization actor is not linked to an authenticated user.';
  end if;

  select decision.granted
    into v_actor_can_run_inspections
  from private.resolve_workspace_profile_capability(
    v_actor_profile_id,
    v_actor_shop_id,
    'work_order.inspection.run'
  ) decision;
  if not coalesce(v_actor_can_run_inspections, false) then
    raise exception using
      errcode = '42501',
      message = 'Inspection capability is required to finalize the PDF.';
  end if;

  -- Resolve the parent without taking a child lock, then acquire the canonical
  -- Work Order -> inspection -> exact line order used by import. Revalidate the
  -- line under its lock before checking mechanic assignment.
  select line.work_order_id
    into v_work_order_id
  from public.work_order_lines line
  where line.id = p_work_order_line_id
    and line.shop_id = v_actor_shop_id;
  if v_work_order_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'Finalization repair line is not available in the actor shop.';
  end if;

  perform 1
  from public.work_orders work_order
  where work_order.id = v_work_order_id
    and work_order.shop_id = v_actor_shop_id
  for update;
  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'Finalization work order is not available in the actor shop.';
  end if;

  perform 1
  from public.inspections inspection
  where inspection.id = p_inspection_id
    and inspection.shop_id = v_actor_shop_id
    and inspection.work_order_id = v_work_order_id
    and inspection.work_order_line_id = p_work_order_line_id
    and coalesce(inspection.is_canonical, false)
  for update;
  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'Canonical inspection is not anchored to the exact repair line and work order.';
  end if;

  perform 1
  from public.work_order_lines line
  where line.id = p_work_order_line_id
    and line.shop_id = v_actor_shop_id
    and line.work_order_id = v_work_order_id
  for update;
  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'Finalization repair line changed before authorization completed.';
  end if;

  if v_actor_role = 'mechanic'
     and not exists (
       select 1
       from public.work_order_lines line
       where line.id = p_work_order_line_id
         and line.shop_id = v_actor_shop_id
         and line.work_order_id = v_work_order_id
         and (
           line.assigned_tech_id in (
             v_actor_profile_id,
             v_actor_linked_user_id,
             p_actor_user_id
           )
           or line.assigned_to in (
             v_actor_profile_id,
             v_actor_linked_user_id,
             p_actor_user_id
           )
           or exists (
             select 1
             from public.work_order_line_technicians assignment
             where assignment.work_order_line_id = line.id
               and assignment.technician_id in (
                 v_actor_profile_id,
                 v_actor_linked_user_id,
                 p_actor_user_id
               )
           )
         )
     ) then
    raise exception using
      errcode = '42501',
      message = 'Inspection PDF finalization is limited to the assigned technician.';
  end if;

  return private.finalize_inspection_pdf_core(
    p_inspection_id,
    p_work_order_line_id,
    v_core_actor_user_id,
    p_expected_sync_revision,
    p_pdf_storage_path,
    p_pdf_sha256,
    p_pdf_url
  );
end;
$$;

revoke all on function public.finalize_inspection_pdf_atomic(
  uuid, uuid, uuid, bigint, text, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.finalize_inspection_pdf_atomic(
  uuid, uuid, uuid, bigint, text, text, text
) to service_role;

comment on function public.finalize_inspection_pdf_atomic(
  uuid, uuid, uuid, bigint, text, text, text
) is
  'Service-only inspection PDF finalizer that rebinds the supplied actor, capability, work order, exact repair line, and mechanic assignment before the private core.';

-- The Assistant service RPC used to perform an idempotent action replay before
-- its role check. Move the complete writer behind a service-only wrapper so an
-- effective capability deny is enforced even when the action already succeeded.
alter function public.shop_assistant_reopen_inspection_atomic(
  uuid, uuid, uuid, uuid, text
) set schema private;

alter function private.shop_assistant_reopen_inspection_atomic(
  uuid, uuid, uuid, uuid, text
) rename to shop_assistant_reopen_inspection_core;

alter function private.shop_assistant_reopen_inspection_core(
  uuid, uuid, uuid, uuid, text
) set search_path to '';

revoke all on function private.shop_assistant_reopen_inspection_core(
  uuid, uuid, uuid, uuid, text
) from public, anon, authenticated, service_role;

create or replace function public.shop_assistant_reopen_inspection_atomic(
  p_action_id uuid,
  p_shop_id uuid,
  p_actor_user_id uuid,
  p_inspection_id uuid,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_service_role boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
  v_actor_profile_id uuid;
  v_actor_role text;
  v_actor_can_run_inspections boolean := false;
  v_action public.shop_assistant_actions%rowtype;
  v_work_order_id uuid;
begin
  if not v_is_service_role then
    raise exception using
      errcode = '42501',
      message = 'Assistant inspection reopen requires the trusted service route.';
  end if;

  select
    profile.id,
    private.workspace_canonical_role(profile.role::text)
    into v_actor_profile_id, v_actor_role
  from public.profiles profile
  where profile.shop_id = p_shop_id
    and (profile.id = p_actor_user_id or profile.user_id = p_actor_user_id)
  order by
    (profile.user_id = p_actor_user_id) desc,
    (profile.id = p_actor_user_id) desc,
    profile.updated_at desc nulls last,
    profile.id
  limit 1;
  if v_actor_profile_id is null then
    raise exception using
      errcode = '42501',
      message = 'Assistant reopen actor is not available for this shop.';
  end if;

  if coalesce(v_actor_role, '') not in ('owner', 'admin', 'manager', 'advisor') then
    raise exception using
      errcode = '42501',
      message = 'Your role cannot reopen inspections.';
  end if;

  select decision.granted
    into v_actor_can_run_inspections
  from private.resolve_workspace_profile_capability(
    v_actor_profile_id,
    p_shop_id,
    'work_order.inspection.run'
  ) decision;
  if not coalesce(v_actor_can_run_inspections, false) then
    raise exception using
      errcode = '42501',
      message = 'Inspection capability is required to reopen through the assistant.';
  end if;

  -- Every Assistant domain writer locks its durable action first. Preserve that
  -- global order, then add the same Work Order -> inspection domain order used
  -- by autosave. The private core reuses all three locks and retains its exact
  -- target-version, lifecycle, audit, and terminal replay behavior.
  v_action := public.shop_assistant_lock_action_for_tool(
    p_action_id,
    p_shop_id,
    p_actor_user_id,
    'reopen_inspection'
  );
  if v_action.status = 'succeeded' then
    return private.shop_assistant_reopen_inspection_core(
      p_action_id,
      p_shop_id,
      p_actor_user_id,
      p_inspection_id,
      p_reason
    );
  end if;

  select inspection.work_order_id
    into v_work_order_id
  from public.inspections inspection
  where inspection.id = p_inspection_id
    and inspection.shop_id = p_shop_id
    and coalesce(inspection.is_canonical, false);
  if not found then
    return private.shop_assistant_reopen_inspection_core(
      p_action_id,
      p_shop_id,
      p_actor_user_id,
      p_inspection_id,
      p_reason
    );
  end if;

  if v_work_order_id is not null then
    perform 1
    from public.work_orders work_order
    where work_order.id = v_work_order_id
      and work_order.shop_id = p_shop_id
    for update;
    if not found then
      raise exception using
        errcode = 'P0002',
        message = 'Canonical inspection work order was not found in this shop.';
    end if;
  end if;

  perform 1
  from public.inspections inspection
  where inspection.id = p_inspection_id
    and inspection.shop_id = p_shop_id
    and inspection.work_order_id is not distinct from v_work_order_id
    and coalesce(inspection.is_canonical, false)
  for update;
  if not found then
    raise exception using
      errcode = '40001',
      message = 'The inspection changed before the confirmed reopen executed.';
  end if;

  return private.shop_assistant_reopen_inspection_core(
    p_action_id,
    p_shop_id,
    p_actor_user_id,
    p_inspection_id,
    p_reason
  );
end;
$$;

revoke all on function public.shop_assistant_reopen_inspection_atomic(
  uuid, uuid, uuid, uuid, text
) from public, anon, authenticated, service_role;
grant execute on function public.shop_assistant_reopen_inspection_atomic(
  uuid, uuid, uuid, uuid, text
) to service_role;

comment on function public.shop_assistant_reopen_inspection_atomic(
  uuid, uuid, uuid, uuid, text
) is
  'Service-only Assistant reopen wrapper that binds the supplied actor to the shop and enforces effective inspection capability before action replay or mutation.';

notify pgrst, 'reload schema';

commit;
