begin;

create or replace function public.apply_shop_quote_decision_atomic(
  p_shop_id uuid,
  p_work_order_id uuid,
  p_quote_line_ids uuid[],
  p_decision text,
  p_actor_user_id uuid,
  p_contact_method text,
  p_note text,
  p_operation_key text,
  p_at timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_decision text := lower(trim(coalesce(p_decision, '')));
  v_contact text := lower(trim(coalesce(p_contact_method, '')));
  v_now timestamptz := coalesce(p_at, now());
  v_existing jsonb;
  v_result jsonb;
  v_line_id uuid;
begin
  if auth.uid() is null or auth.uid() <> p_actor_user_id then
    raise exception using errcode = 'P0001', message = 'Shop quote decision actor mismatch.';
  end if;
  if v_decision not in ('approve', 'decline', 'defer') then
    raise exception using errcode = 'P0001', message = 'Unsupported quote decision.';
  end if;
  if v_contact not in ('phone', 'in_person', 'email', 'other') then
    raise exception using errcode = 'P0001', message = 'Unsupported quote decision contact method.';
  end if;
  if nullif(trim(p_operation_key), '') is null then
    raise exception using errcode = 'P0001', message = 'A stable operation key is required.';
  end if;
  select result into v_existing
  from public.quote_lifecycle_operation_keys
  where shop_id = p_shop_id
    and operation_name = 'shop_quote_decision'
    and operation_key = p_operation_key;
  if found then
    return v_existing || jsonb_build_object('idempotent', true);
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = p_actor_user_id
      and p.shop_id = p_shop_id
      and lower(coalesce(p.role::text, '')) in ('owner', 'admin', 'manager', 'advisor', 'service', 'foreman')
  ) then
    raise exception using errcode = 'P0001', message = 'Shop quote decision actor is not authorized.';
  end if;
  if exists (
    select 1 from public.work_order_quote_lines q
    where q.shop_id = p_shop_id
      and q.work_order_id = p_work_order_id
      and q.id = any(coalesce(p_quote_line_ids, array[]::uuid[]))
      and (q.work_order_line_id is not null or lower(coalesce(q.status::text, '')) in ('approved', 'converted'))
      and v_decision <> 'approve'
  ) then
    raise exception using errcode = 'P0001', message = 'Approved work cannot be reversed from quote review.';
  end if;

  v_result := public.apply_customer_quote_decision_atomic(
    p_shop_id,
    p_work_order_id,
    p_quote_line_ids,
    v_decision,
    false,
    null,
    p_actor_user_id,
    p_operation_key || ':canonical',
    v_now
  );

  update public.work_order_quote_lines
  set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
        'decision_origin', 'shop_recorded',
        'shop_decision', v_decision,
        'shop_decision_at', v_now,
        'shop_decision_actor_user_id', p_actor_user_id,
        'shop_decision_contact_method', v_contact,
        'shop_decision_note', left(nullif(trim(coalesce(p_note, '')), ''), 1000)
      )),
      updated_at = v_now
  where shop_id = p_shop_id
    and work_order_id = p_work_order_id
    and id = any(coalesce(p_quote_line_ids, array[]::uuid[]));

  if v_decision = 'approve' then
    for v_line_id in
      select q.work_order_line_id
      from public.work_order_quote_lines q
      where q.shop_id = p_shop_id
        and q.work_order_id = p_work_order_id
        and q.id = any(coalesce(p_quote_line_ids, array[]::uuid[]))
        and q.work_order_line_id is not null
    loop
      update public.work_order_lines
      set intake_json = coalesce(intake_json, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
            'decision_origin', 'shop_recorded',
            'shop_decision_at', v_now,
            'shop_decision_actor_user_id', p_actor_user_id,
            'shop_decision_contact_method', v_contact,
            'shop_decision_note', left(nullif(trim(coalesce(p_note, '')), ''), 1000)
          )),
          updated_at = v_now
      where id = v_line_id and shop_id = p_shop_id and work_order_id = p_work_order_id;
    end loop;
  end if;

  v_result := v_result || jsonb_build_object('decision_origin', 'shop_recorded');
  insert into public.quote_lifecycle_operation_keys(
    shop_id, operation_name, operation_key, actor_user_id, work_order_id, result
  ) values (
    p_shop_id, 'shop_quote_decision', p_operation_key,
    p_actor_user_id, p_work_order_id, v_result
  );
  return v_result;
end;
$$;

revoke all on function public.apply_shop_quote_decision_atomic(uuid,uuid,uuid[],text,uuid,text,text,text,timestamptz) from public, anon;
grant execute on function public.apply_shop_quote_decision_atomic(uuid,uuid,uuid[],text,uuid,text,text,text,timestamptz) to authenticated;
notify pgrst, 'reload schema';

commit;
