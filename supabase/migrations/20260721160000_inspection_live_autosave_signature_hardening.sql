begin;

-- Track the inspection signing contract in migrations. Existing production
-- databases already have this table; fresh environments must get the same shape.
create table if not exists public.inspection_signatures (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections(id) on delete restrict,
  role text not null,
  signed_by uuid references auth.users(id) on delete set null,
  signed_name text,
  signature_image_path text,
  signature_hash text,
  signing_cycle bigint not null default 0,
  signed_sync_revision bigint,
  signed_summary_hash text,
  signed_summary jsonb,
  signed_at timestamptz not null default now(),
  ip_address text,
  user_agent text
);

alter table public.inspection_signatures
  add column if not exists signing_cycle bigint not null default 0,
  add column if not exists signed_sync_revision bigint,
  add column if not exists signed_summary_hash text,
  add column if not exists signed_summary jsonb;

alter table public.inspections
  add column if not exists signing_cycle bigint not null default 0,
  add column if not exists reopened_at timestamptz,
  add column if not exists reopened_by uuid references auth.users(id)
    on delete set null,
  add column if not exists reopen_reason text;

-- A rerun performs its controlled repairs inside this transaction, then
-- reinstalls both guards before commit.
drop trigger if exists prevent_inspection_signature_evidence_mutation
  on public.inspection_signatures;
drop trigger if exists prevent_finalized_inspection_mutation
  on public.inspections;

-- Historical installs used ON DELETE CASCADE, which allowed deleting the
-- inspection to erase its signature evidence. Replace any inspection foreign
-- key on this table with an explicit restrictive constraint.
do $$
declare
  v_constraint record;
begin
  for v_constraint in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.inspection_signatures'::regclass
      and c.confrelid = 'public.inspections'::regclass
      and c.contype = 'f'
  loop
    execute format(
      'alter table public.inspection_signatures drop constraint %I',
      v_constraint.conname
    );
  end loop;
end;
$$;

alter table public.inspection_signatures
  add constraint inspection_signatures_inspection_id_fkey
  foreign key (inspection_id)
  references public.inspections(id)
  on delete restrict
  not valid;

alter table public.inspection_signatures
  validate constraint inspection_signatures_inspection_id_fkey;

create index if not exists inspection_signatures_inspection_role_latest_idx
  on public.inspection_signatures (inspection_id, role, signed_at desc, id desc);

alter table public.inspection_signatures enable row level security;

drop policy if exists inspection_signatures_shop_select
  on public.inspection_signatures;
create policy inspection_signatures_shop_select
  on public.inspection_signatures
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.inspections i
      join public.profiles p
        on p.id = auth.uid()
       and p.shop_id = i.shop_id
      where i.id = inspection_signatures.inspection_id
    )
  );

-- `profiles.self.update` intentionally supports ordinary account settings, but
-- role and tenant membership must never be self-assignable. Keep service-role
-- and administrative writes intact while defaulting authenticated updates to
-- an explicit set of self-service columns.
revoke update on table public.profiles from authenticated;
grant update (
  avatar_url,
  business_name,
  city,
  completed_onboarding,
  email,
  full_name,
  last_active_at,
  must_change_password,
  phone,
  postal_code,
  province,
  shop_name,
  street,
  tech_signature_hash,
  tech_signature_path,
  tech_signature_updated_at,
  updated_at,
  username
) on table public.profiles to authenticated;

create or replace function public.prevent_profile_authorization_self_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $profile_authorization_guard$
declare
  v_actor_user_id uuid := auth.uid();
begin
  -- Service-role and trusted database administration have no end-user JWT and
  -- remain able to provision or move memberships.
  if v_actor_user_id is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.id = v_actor_user_id and (
      new.role is not null
      or new.shop_id is not null
      or new.organization_id is not null
      or new.agent_role is not null
      or (
        new.user_id is not null
        and new.user_id is distinct from v_actor_user_id
      )
    ) then
      raise exception using
        errcode = '42501',
        message = 'Profile role and shop membership are server-managed.';
    end if;
    return new;
  end if;

  if old.id = v_actor_user_id and (
    new.id is distinct from old.id
    or new.user_id is distinct from old.user_id
    or new.role is distinct from old.role
    or new.shop_id is distinct from old.shop_id
    or new.organization_id is distinct from old.organization_id
    or new.agent_role is distinct from old.agent_role
    or new.plan is distinct from old.plan
    or new.created_by is distinct from old.created_by
  ) then
    raise exception using
      errcode = '42501',
      message = 'Profile role and shop membership are server-managed.';
  end if;

  return new;
end;
$profile_authorization_guard$;

drop trigger if exists prevent_profile_authorization_self_write
  on public.profiles;
create trigger prevent_profile_authorization_self_write
before insert or update on public.profiles
for each row
execute function public.prevent_profile_authorization_self_write();

-- Drop the drifted production expression before repairing rows it may reject.
-- The replacement is added in this same transaction before commit.
alter table public.inspections
  drop constraint if exists inspections_draft_not_finalized_chk;

-- Normalize drifted lifecycle rows, then install the explicit invariant used by
-- save/reopen/sign.
update public.inspections
set is_draft = false
where coalesce(is_draft, false)
  and (
    coalesce(completed, false)
    or coalesce(locked, false)
    or lower(coalesce(status, '')) in ('completed', 'finalized', 'signed')
  );

update public.inspections
set finalized_at = null,
    finalized_by = null,
    status = case
      when lower(coalesce(status, '')) in ('completed', 'finalized', 'signed')
        then 'draft'
      else coalesce(status, 'draft')
    end
where coalesce(is_draft, false)
  and not coalesce(completed, false)
  and not coalesce(locked, false)
  and (finalized_at is not null or finalized_by is not null);

alter table public.inspections
  add constraint inspections_draft_not_finalized_chk
  check (
    not coalesce(is_draft, false)
    or (
      not coalesce(completed, false)
      and not coalesce(locked, false)
      and finalized_at is null
      and finalized_by is null
      and lower(coalesce(status, 'draft')) not in (
        'completed',
        'finalized',
        'signed'
      )
    )
  ) not valid;

-- Repair drifted installs where the idempotency table exists without its
-- original uniqueness contract. Keep the newest result for duplicate keys.
with ranked_operation_keys as (
  select
    id,
    row_number() over (
      partition by shop_id, operation_name, operation_key
      order by created_at desc, id desc
    ) as row_number
  from public.mobile_operation_keys
)
delete from public.mobile_operation_keys mok
using ranked_operation_keys ranked
where mok.id = ranked.id
  and ranked.row_number > 1;

create unique index if not exists
  mobile_operation_keys_shop_operation_key_uidx
on public.mobile_operation_keys (shop_id, operation_name, operation_key);

-- Persist one canonical server snapshot without relying on work-order-line
-- uniqueness, which is not consistent in existing production data.
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
    where p.id = p_actor_user_id
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

-- Finalization is a compare-and-swap on the persisted summary revision. PDF
-- generation and immutable upload happen before this call; only the transaction
-- that still owns the expected revision is allowed to publish that object path.
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
set search_path = public
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

  select p.shop_id
    into v_actor_shop_id
  from public.profiles p
  where p.id = p_actor_user_id;

  if not found or v_actor_shop_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'Finalization actor is not assigned to a shop.';
  end if;

  select
    i.work_order_id,
    i.summary,
    coalesce(i.locked, false),
    coalesce(i.completed, false),
    coalesce(i.is_draft, true),
    coalesce(i.status, 'draft'),
    i.finalized_at,
    i.finalized_by
  into
    v_work_order_id,
    v_summary,
    v_locked,
    v_completed,
    v_is_draft,
    v_status,
    v_finalized_at,
    v_finalized_by
  from public.inspections i
  where i.id = p_inspection_id
    and i.work_order_line_id = p_work_order_line_id
    and i.shop_id = v_actor_shop_id
  for update;

  if not found or v_work_order_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'Inspection was not found for this shop and work-order line.';
  end if;

  -- Preserve the legacy fallback used by the route, while normalizing the
  -- winning snapshot back onto the canonical inspection row at finalization.
  if v_summary is null then
    select s.state
      into v_summary
    from public.inspection_sessions s
    where s.work_order_line_id = p_work_order_line_id
    order by s.updated_at desc nulls last, s.id desc
    limit 1
    for update;
  end if;

  if v_summary is null or jsonb_typeof(v_summary) <> 'object' then
    raise exception using
      errcode = 'P0001',
      message = 'Inspection summary is missing or invalid.';
  end if;

  if coalesce(v_summary->>'syncRevision', '') ~ '^[0-9]+$' then
    v_revision := (v_summary->>'syncRevision')::bigint;
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
  where id = p_inspection_id;

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

revoke all on function public.finalize_inspection_pdf_atomic(
  uuid, uuid, uuid, bigint, text, text, text
) from public, authenticated;
grant execute on function public.finalize_inspection_pdf_atomic(
  uuid, uuid, uuid, bigint, text, text, text
) to service_role;

-- Reopen is a server-clock, row-locked lifecycle transition. Incrementing a
-- durable cycle separates idempotency from timestamp ordering and guarantees
-- that evidence from an earlier finalized snapshot never suppresses signing
-- after reopen.
drop function if exists public.reopen_inspection(uuid, text);
create or replace function public.reopen_inspection(
  p_inspection_id uuid,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_actor_shop_id uuid;
  v_actor_role text;
  v_inspection_shop_id uuid;
  v_locked boolean := false;
  v_completed boolean := false;
  v_is_draft boolean := true;
  v_status text := 'draft';
  v_finalized_at timestamptz;
  v_finalized_by uuid;
  v_signing_cycle bigint := 0;
  v_next_cycle bigint;
  v_now timestamptz := clock_timestamp();
  v_reason text := nullif(trim(p_reason), '');
begin
  if v_actor_user_id is null then
    raise exception using errcode = 'P0001', message = 'Authentication is required.';
  end if;
  if v_reason is null then
    raise exception using errcode = 'P0001', message = 'Reopen reason is required.';
  end if;

  select p.shop_id, lower(trim(coalesce(p.role::text, '')))
    into v_actor_shop_id, v_actor_role
  from public.profiles p
  where p.id = v_actor_user_id;

  if not found or v_actor_shop_id is null then
    raise exception using errcode = 'P0001', message = 'Missing profile or shop membership.';
  end if;
  if v_actor_role not in ('admin', 'advisor', 'owner', 'manager') then
    raise exception using
      errcode = '42501',
      message = 'Only an admin, advisor, owner, or manager can reopen inspections.';
  end if;

  select
    i.shop_id,
    coalesce(i.locked, false),
    coalesce(i.completed, false),
    coalesce(i.is_draft, true),
    coalesce(i.status, 'draft'),
    i.finalized_at,
    i.finalized_by,
    coalesce(i.signing_cycle, 0)
  into
    v_inspection_shop_id,
    v_locked,
    v_completed,
    v_is_draft,
    v_status,
    v_finalized_at,
    v_finalized_by,
    v_signing_cycle
  from public.inspections i
  where i.id = p_inspection_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'Inspection was not found.';
  end if;
  if v_inspection_shop_id is distinct from v_actor_shop_id then
    raise exception using errcode = '42501', message = 'Inspection does not belong to your shop.';
  end if;

  if not v_locked
     and not v_completed
     and v_is_draft
     and v_finalized_at is null
     and v_finalized_by is null
     and lower(v_status) not in ('completed', 'finalized', 'signed') then
    return jsonb_build_object(
      'ok', true,
      'already_open', true,
      'inspection_id', p_inspection_id,
      'signing_cycle', v_signing_cycle
    );
  end if;

  v_next_cycle := v_signing_cycle + 1;
  perform set_config('profixiq.inspection_reopen', 'on', true);

  update public.inspections
  set locked = false,
      completed = false,
      is_draft = true,
      status = 'in_progress',
      finalized_at = null,
      finalized_by = null,
      reopened_at = v_now,
      reopened_by = v_actor_user_id,
      reopen_reason = v_reason,
      signing_cycle = v_next_cycle,
      updated_at = v_now
  where id = p_inspection_id;

  return jsonb_build_object(
    'ok', true,
    'already_open', false,
    'inspection_id', p_inspection_id,
    'reopened_at', v_now,
    'signing_cycle', v_next_cycle
  );
end;
$$;

revoke all on function public.reopen_inspection(uuid, text) from public;
grant execute on function public.reopen_inspection(uuid, text) to authenticated;

-- Replace the drifted signing RPC without assuming or deleting duplicate
-- historical signature rows. The inspection row serializes concurrent signing.
drop function if exists public.sign_inspection(uuid, text, text, text, text);
drop function if exists public.sign_inspection(
  uuid, text, text, text, text, bigint
);
drop function if exists public.sign_inspection(
  uuid, text, text, bigint, text, text
);

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
    p.shop_id,
    p.role,
    p.full_name,
    p.tech_signature_path,
    p.tech_signature_hash
  into v_profile
  from public.profiles p
  where p.id = v_actor_user_id;

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
           'tech-signatures/' || v_actor_user_id::text || '.png'
         or v_effective_path =
           'tech-signatures/' || v_actor_user_id::text || '/' ||
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

-- Signature rows are append-only evidence. RLS already denies ordinary
-- mutation; this trigger also stops indirect cascades and privileged accidental
-- rewrites. Deliberate database-owner maintenance requires disabling the
-- trigger explicitly and therefore remains auditable.
create or replace function public.prevent_inspection_signature_evidence_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $signature_evidence_guard$
begin
  raise exception using
    errcode = 'P0001',
    message = 'Inspection signature evidence is immutable.';
end;
$signature_evidence_guard$;

drop trigger if exists prevent_inspection_signature_evidence_mutation
  on public.inspection_signatures;
create trigger prevent_inspection_signature_evidence_mutation
before update or delete on public.inspection_signatures
for each row
execute function public.prevent_inspection_signature_evidence_mutation();

-- Once finalized or signed, an inspection can only change through the signing
-- transition itself or the row-locked reopen RPC above. This closes the broad
-- legacy shop UPDATE/DELETE policies without disrupting edits to open drafts.
create or replace function public.prevent_finalized_inspection_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $inspection_evidence_guard$
declare
  v_has_signature boolean := false;
  v_internal_transition boolean :=
    current_setting('profixiq.inspection_sign', true) = 'on'
    or current_setting('profixiq.inspection_reopen', true) = 'on';
begin
  if v_internal_transition then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  select exists (
    select 1
    from public.inspection_signatures s
    where s.inspection_id = old.id
  ) into v_has_signature;

  if coalesce(old.locked, false)
     or coalesce(old.completed, false)
     or not coalesce(old.is_draft, true)
     or old.finalized_at is not null
     or old.finalized_by is not null
     or lower(coalesce(old.status, 'draft')) in ('completed', 'finalized', 'signed')
     or v_has_signature then
    raise exception using
      errcode = 'P0001',
      message = 'Finalized inspection evidence is immutable; use the authorized reopen operation.';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$inspection_evidence_guard$;

drop trigger if exists prevent_finalized_inspection_mutation
  on public.inspections;
create trigger prevent_finalized_inspection_mutation
before update or delete on public.inspections
for each row
execute function public.prevent_finalized_inspection_mutation();

-- Saved technician signatures are immutable evidence. Updating a signature
-- creates a new content-addressed object and only moves the profile pointer.
create or replace function public.prevent_technician_signature_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, storage
as $signature_guard$
begin
  if old.bucket_id = 'signatures'
     and old.name like 'tech-signatures/%' then
    raise exception using
      errcode = 'P0001',
      message = 'Saved technician signature evidence is immutable.';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$signature_guard$;

drop trigger if exists prevent_technician_signature_mutation
  on storage.objects;
create trigger prevent_technician_signature_mutation
before update or delete on storage.objects
for each row
execute function public.prevent_technician_signature_mutation();

-- Realtime drives open inspections on every signed-in device. Guard publication
-- membership so this migration is safe to rerun.
do $$
declare
  v_table_name text;
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    foreach v_table_name in array array[
      'inspections',
      'inspection_sessions',
      'inspection_signatures'
    ]
    loop
      if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = v_table_name
      ) then
        execute format(
          'alter publication supabase_realtime add table public.%I',
          v_table_name
        );
      end if;
    end loop;
  end if;
end;
$$;

alter table public.inspections replica identity full;
alter table public.inspection_sessions replica identity full;
alter table public.inspection_signatures replica identity full;

notify pgrst, 'reload schema';
commit;
