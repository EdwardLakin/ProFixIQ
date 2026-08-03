begin;

create or replace function public.parts_dismiss_empty_request_atomic(
  p_shop_id uuid,
  p_request_id uuid,
  p_actor_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_authenticated_user_id uuid := auth.uid();
  v_actor_role text;
  v_request public.part_requests%rowtype;
  v_previous_status text;
begin
  if p_shop_id is null or p_request_id is null then
    raise exception using
      errcode = '22023',
      message = 'PARTS_DISMISS_SCOPE_REQUIRED';
  end if;

  if coalesce(auth.role(), '') <> 'service_role' then
    if v_authenticated_user_id is null then
      raise exception using
        errcode = '42501',
        message = 'PARTS_AUTHENTICATION_REQUIRED';
    end if;

    if p_actor_user_id is null
       or v_authenticated_user_id is distinct from p_actor_user_id then
      raise exception using
        errcode = '42501',
        message = 'PARTS_ACTOR_MISMATCH';
    end if;

    select lower(trim(coalesce(profile.role::text, '')))
      into v_actor_role
    from public.profiles profile
    where profile.shop_id = p_shop_id
      and (
        profile.id = v_authenticated_user_id
        or profile.user_id = v_authenticated_user_id
      )
    order by (profile.id = v_authenticated_user_id) desc
    limit 1;

    if v_actor_role is null then
      raise exception using
        errcode = '42501',
        message = 'PARTS_SHOP_ACCESS_DENIED';
    end if;

    if v_actor_role not in (
      'owner',
      'admin',
      'manager',
      'advisor',
      'parts'
    ) then
      raise exception using
        errcode = '42501',
        message = 'PARTS_ROLE_ACCESS_DENIED';
    end if;
  end if;

  select request_row.*
    into v_request
  from public.part_requests request_row
  where request_row.id = p_request_id
    and request_row.shop_id = p_shop_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'PARTS_REQUEST_NOT_FOUND_FOR_SHOP';
  end if;

  if v_request.status::text = 'cancelled' then
    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'request_id', v_request.id,
      'work_order_id', v_request.work_order_id,
      'previous_status', 'cancelled',
      'status', 'cancelled'
    );
  end if;

  if v_request.status::text not in ('requested', 'quoted', 'approved') then
    raise exception using
      errcode = 'P0001',
      message = 'PARTS_REQUEST_NOT_DISMISSIBLE';
  end if;

  if exists (
    select 1
    from public.part_request_items item
    where item.request_id = p_request_id
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'PARTS_REQUEST_NOT_EMPTY';
  end if;

  v_previous_status := v_request.status::text;

  update public.part_requests
  set status = 'cancelled'::public.part_request_status
  where id = p_request_id
    and shop_id = p_shop_id;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'PARTS_REQUEST_DISMISS_FAILED';
  end if;

  return jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'request_id', v_request.id,
    'work_order_id', v_request.work_order_id,
    'previous_status', v_previous_status,
    'status', 'cancelled'
  );
end;
$$;

revoke all on function public.parts_dismiss_empty_request_atomic(
  uuid,
  uuid,
  uuid
) from public, anon;

grant execute on function public.parts_dismiss_empty_request_atomic(
  uuid,
  uuid,
  uuid
) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
