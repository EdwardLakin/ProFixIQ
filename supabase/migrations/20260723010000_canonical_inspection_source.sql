begin;

-- Inspections are the only mutable server authority for inspection progress.
-- inspection_sessions remains temporarily as historical compatibility data,
-- but no application or RPC may write new progress to it after this migration.
alter table public.inspections
  add column if not exists is_canonical boolean not null default false,
  add column if not exists sync_revision bigint not null default 0;

-- Select one deterministic canonical row for every anchored inspection. Older
-- duplicate rows remain available for evidence recovery and audit history.
with ranked as (
  select
    i.id,
    row_number() over (
      partition by i.shop_id, i.work_order_line_id
      order by i.updated_at desc nulls last, i.created_at desc nulls last, i.id desc
    ) as canonical_rank
  from public.inspections i
  where i.shop_id is not null
    and i.work_order_line_id is not null
)
update public.inspections i
set is_canonical = ranked.canonical_rank = 1
from ranked
where i.id = ranked.id;

-- Preserve the revision already acknowledged by deployed clients.
update public.inspections
set sync_revision = (summary->>'syncRevision')::bigint
where jsonb_typeof(summary) = 'object'
  and coalesce(summary->>'syncRevision', '') ~ '^[0-9]+$'
  and sync_revision = 0;

create unique index if not exists inspections_one_canonical_per_line_idx
  on public.inspections(shop_id, work_order_line_id)
  where is_canonical
    and shop_id is not null
    and work_order_line_id is not null;

create index if not exists inspections_canonical_work_order_idx
  on public.inspections(shop_id, work_order_id, updated_at desc)
  where is_canonical;

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
set search_path = public
as $$
declare
  v_line record;
  v_existing_result jsonb;
  v_canonical_session jsonb;
  v_inspection_id uuid;
  v_now timestamptz := clock_timestamp();
  v_result jsonb;
  v_server_revision bigint := 0;
  v_client_revision bigint := 0;
  v_next_revision bigint;
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

  select wol.id, wol.work_order_id
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

  select
    i.id,
    i.sync_revision,
    coalesce(i.locked, false),
    coalesce(i.completed, false),
    coalesce(i.is_draft, true),
    coalesce(i.status, 'draft'),
    i.finalized_at,
    i.finalized_by
  into
    v_inspection_id,
    v_server_revision,
    v_inspection_locked,
    v_inspection_completed,
    v_inspection_is_draft,
    v_inspection_status,
    v_inspection_finalized_at,
    v_inspection_finalized_by
  from public.inspections i
  where i.work_order_line_id = p_work_order_line_id
    and i.shop_id = p_shop_id
    and i.is_canonical
  for update;

  if found then
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
  else
    insert into public.inspections (
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
      status,
      updated_at
    ) values (
      v_line.work_order_id,
      p_work_order_line_id,
      p_shop_id,
      p_actor_user_id,
      p_session,
      true,
      0,
      true,
      false,
      false,
      'draft',
      v_now
    )
    returning id into v_inspection_id;
  end if;

  if coalesce(p_session->>'syncRevision', '') ~ '^[0-9]+$' then
    v_client_revision := (p_session->>'syncRevision')::bigint;
  end if;

  if v_client_revision <> v_server_revision then
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
  set summary = v_canonical_session,
      user_id = p_actor_user_id,
      sync_revision = v_next_revision,
      updated_at = v_now
  where id = v_inspection_id
    and shop_id = p_shop_id
    and is_canonical
    and sync_revision = v_server_revision
    and not coalesce(locked, false)
    and not coalesce(completed, false)
    and coalesce(is_draft, true);

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'Inspection changed or was finalized while autosave was in progress.';
  end if;

  v_result := jsonb_build_object(
    'ok', true,
    'inspection_id', v_inspection_id,
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

revoke all on function public.save_inspection_progress_v3_atomic(
  uuid, uuid, uuid, jsonb, text, timestamptz
) from public;
grant execute on function public.save_inspection_progress_v3_atomic(
  uuid, uuid, uuid, jsonb, text, timestamptz
) to authenticated, service_role;

-- Existing installed clients keep their RPC names, but both now delegate to
-- the one canonical writer and can no longer recreate the mirrored truth.
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
set search_path = public
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
set search_path = public
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

revoke insert, update, delete on public.inspection_sessions
  from anon, authenticated;

do $$
begin
  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'inspection_sessions'
  ) then
    alter publication supabase_realtime drop table public.inspection_sessions;
  end if;
end;
$$;

comment on table public.inspection_sessions is
  'Legacy inspection progress mirror. Read-only for historical compatibility; do not use for new inspection state.';

notify pgrst, 'reload schema';
commit;
