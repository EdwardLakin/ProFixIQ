begin;

-- inspection_sessions was retained as immutable historical compatibility data
-- when inspections became canonical. Legacy triggers still created and
-- mirrored session rows, and one of them blocked canonical finalization unless
-- the abandoned session status happened to be completed. Retire that write
-- path completely without deleting historical evidence.
drop trigger if exists trg_enforce_inspection_session_consistency_on_inspections
  on public.inspections;
drop trigger if exists trg_enforce_inspection_session_consistency_on_sessions
  on public.inspection_sessions;
drop trigger if exists trg_sync_inspections_from_sessions
  on public.inspection_sessions;

drop trigger if exists trg_wol_autocreate_inspection_ins
  on public.work_order_lines;
drop trigger if exists trg_wol_autocreate_inspection_upd
  on public.work_order_lines;
drop trigger if exists trg_wol_create_inspection_session_before
  on public.work_order_lines;
drop trigger if exists trg_wol_link_inspection_session_after
  on public.work_order_lines;

-- New inspection lines are anchored by work_order_line_id on the canonical
-- inspections row. They must not require a legacy session foreign key.
alter table public.work_order_lines
  drop constraint if exists
    work_order_lines_inspection_or_template_requires_session_chk;

drop function if exists
  public.enforce_inspection_session_consistency_from_inspections();
drop function if exists
  public.enforce_inspection_session_consistency_from_sessions();
drop function if exists
  public.sync_inspections_from_inspection_sessions();
drop function if exists public.ensure_inspection_session_for_line();
drop function if exists public.wol_create_inspection_session_before();
drop function if exists public.wol_link_inspection_session_after();

-- No application role may recreate the retired mirror. SECURITY DEFINER draft
-- deletion can still remove historical children when their parent draft work
-- order is intentionally deleted.
revoke insert, update on public.inspection_sessions
  from anon, authenticated, service_role;

comment on table public.inspection_sessions is
  'Immutable legacy inspection history. Canonical mutable state lives only in public.inspections.';

-- PDF finalization now reads both the snapshot and revision exclusively from
-- the explicitly canonical inspection. The signature is unchanged so this is
-- safe for rolling application deployments.
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
    coalesce(i.sync_revision, 0),
    coalesce(i.locked, false),
    coalesce(i.completed, false),
    coalesce(i.is_draft, true),
    coalesce(i.status, 'draft'),
    i.finalized_at,
    i.finalized_by
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
  from public.inspections i
  where i.id = p_inspection_id
    and i.work_order_line_id = p_work_order_line_id
    and i.shop_id = v_actor_shop_id
    and i.is_canonical
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

revoke all on function public.finalize_inspection_pdf_atomic(
  uuid, uuid, uuid, bigint, text, text, text
) from public, authenticated;
grant execute on function public.finalize_inspection_pdf_atomic(
  uuid, uuid, uuid, bigint, text, text, text
) to service_role;

notify pgrst, 'reload schema';

commit;
