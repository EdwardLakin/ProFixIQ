begin;

set local lock_timeout = '5s';
set local statement_timeout = '10min';

-- Staff line decisions share UI with portal decisions, but the established
-- compatibility bundle can rewrite an in-progress line. Add a staff-specific
-- adapter that preserves the existing bundle while enforcing a pre-labor
-- boundary under the same row locks used by technician punch transitions.
create or replace function public.apply_staff_line_decision_atomic(
  p_shop_id uuid,
  p_work_order_id uuid,
  p_line_id uuid,
  p_actor_user_id uuid,
  p_decision text,
  p_operation_key text,
  p_at timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_decision text := lower(trim(coalesce(p_decision, '')));
  v_profile_id uuid;
  v_role text;
  v_line public.work_order_lines%rowtype;
  v_result jsonb;
begin
  if v_decision not in ('approve', 'decline') then
    raise exception using
      errcode = '22023',
      message = 'STAFF_LINE_DECISION_INVALID: staff decisions support approve or decline only.';
  end if;

  if nullif(trim(coalesce(p_operation_key, '')), '') is null then
    raise exception using
      errcode = '22023',
      message = 'STAFF_LINE_DECISION_OPERATION_KEY_REQUIRED';
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
     and not public.scheduler_actor_matches(p_actor_user_id) then
    raise exception using
      errcode = '42501',
      message = 'STAFF_LINE_DECISION_FORBIDDEN: authenticated actor mismatch.';
  end if;

  select p.id, lower(trim(coalesce(p.role, '')))
    into v_profile_id, v_role
  from public.profiles p
  where p.shop_id = p_shop_id
    and (p.id = p_actor_user_id or p.user_id = p_actor_user_id)
  order by case when p.id = p_actor_user_id then 0 else 1 end
  limit 1;

  if not found or v_role not in ('owner', 'admin', 'manager', 'advisor') then
    raise exception using
      errcode = '42501',
      message = 'STAFF_LINE_DECISION_FORBIDDEN: actor cannot record staff approval decisions.';
  end if;

  -- Punch transitions lock line -> work order -> labor state. Match that order
  -- so a decision racing a technician start serializes rather than deadlocks.
  select *
    into v_line
  from public.work_order_lines wol
  where wol.id = p_line_id
    and wol.shop_id = p_shop_id
    and wol.work_order_id = p_work_order_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'STAFF_LINE_DECISION_NOT_FOUND: work-order line not found for shop.';
  end if;

  perform 1
  from public.work_orders wo
  where wo.id = p_work_order_id
    and wo.shop_id = p_shop_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'STAFF_LINE_DECISION_NOT_FOUND: work order not found for shop.';
  end if;

  if v_line.voided_at is not null
     or lower(coalesce(v_line.status::text, '')) in (
       'in_progress', 'completed', 'ready_to_invoice', 'invoiced',
       'voided', 'cancelled', 'canceled'
     )
  then
    raise exception using
      errcode = 'P0001',
      message = 'STAFF_LINE_DECISION_INELIGIBLE: line has already entered labor or a terminal state.';
  end if;

  perform 1
  from public.work_order_line_labor_segments seg
  where seg.shop_id = p_shop_id
    and seg.work_order_line_id = p_line_id
    and seg.ended_at is null
  for update;

  if found then
    raise exception using
      errcode = 'P0001',
      message = 'STAFF_LINE_DECISION_ACTIVE_LABOR: end active labor before changing the line decision.';
  end if;

  v_result := public.apply_approval_compatibility_bundle_atomic(
    p_shop_id,
    p_work_order_id,
    null,
    v_profile_id,
    case when v_decision = 'approve' then array[p_line_id]::uuid[] else array[]::uuid[] end,
    case when v_decision = 'decline' then array[p_line_id]::uuid[] else array[]::uuid[] end,
    array[]::uuid[],
    array[]::uuid[],
    null,
    p_operation_key,
    coalesce(p_at, now())
  );

  return v_result;
end;
$function$;

revoke all on function public.apply_staff_line_decision_atomic(
  uuid, uuid, uuid, uuid, text, text, timestamptz
) from public, anon;
grant execute on function public.apply_staff_line_decision_atomic(
  uuid, uuid, uuid, uuid, text, text, timestamptz
) to authenticated, service_role;

comment on function public.apply_staff_line_decision_atomic(
  uuid, uuid, uuid, uuid, text, text, timestamptz
) is
  'Applies an owner/admin/manager/advisor line approval or decline only before labor begins, then delegates to the established approval compatibility bundle.';

notify pgrst, 'reload schema';

commit;
