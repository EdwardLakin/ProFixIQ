-- Preserve offline punch replay for imported staff whose Supabase auth subject
-- differs from the canonical profiles.id stored by Workforce.
--
-- Receipt ownership remains the auth user id because the receipt table
-- references auth.users. Shift, punch, labor, and audit ownership use the
-- canonical profile id.

create or replace function public.apply_canonical_offline_shift_punch_atomic(
  p_shop_id uuid,
  p_actor_profile_id uuid,
  p_actor_auth_user_id uuid,
  p_operation_key text,
  p_shift_id uuid,
  p_event_type text,
  p_timestamp timestamptz,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype;
  v_shift public.tech_shifts%rowtype;
  v_event text := lower(trim(coalesce(p_event_type, '')));
  v_payload jsonb;
  v_payload_hash text;
  v_existing public.offline_mutation_receipts%rowtype;
  v_receipt_id uuid;
  v_punch_id uuid;
  v_result jsonb;
begin
  if p_shop_id is null
     or p_actor_profile_id is null
     or p_actor_auth_user_id is null
     or p_shift_id is null
     or p_timestamp is null then
    raise exception using
      errcode = 'P0001',
      message = 'Shop, actor, shift, and punch time are required.';
  end if;

  if auth.uid() is not null and auth.uid() <> p_actor_auth_user_id then
    raise exception using
      errcode = 'P0001',
      message = 'Authenticated actor does not match the mutation actor.';
  end if;

  select *
  into v_actor
  from public.profiles profile
  where profile.id = p_actor_profile_id
    and profile.shop_id = p_shop_id
    and (
      profile.id = p_actor_auth_user_id
      or profile.user_id = p_actor_auth_user_id
    );

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'Actor is not available for this shop.';
  end if;

  if nullif(trim(p_operation_key), '') is null
     or length(p_operation_key) > 240 then
    raise exception using
      errcode = 'P0001',
      message = 'A stable operation key is required.';
  end if;

  if v_event not in (
    'start_shift',
    'end_shift',
    'break_start',
    'break_end',
    'lunch_start',
    'lunch_end'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'Invalid shift punch event type.';
  end if;

  if length(coalesce(p_note, '')) > 2000 then
    raise exception using
      errcode = 'P0001',
      message = 'Punch note is too long.';
  end if;

  v_payload := jsonb_build_object(
    'shift_id', p_shift_id,
    'event_type', v_event,
    'timestamp', p_timestamp,
    'note', nullif(trim(coalesce(p_note, '')), '')
  );
  v_payload_hash := encode(
    extensions.digest(v_payload::text, 'sha256'),
    'hex'
  );

  select *
  into v_existing
  from public.offline_mutation_receipts receipt
  where receipt.shop_id = p_shop_id
    and receipt.operation_key = p_operation_key;

  if found then
    if v_existing.actor_user_id <> p_actor_auth_user_id
       or v_existing.action_type <> 'shift:punch-event'
       or v_existing.payload_hash <> v_payload_hash then
      raise exception using
        errcode = 'P0001',
        message =
          'IDEMPOTENCY_KEY_REUSE: operation key belongs to different mutation data.';
    end if;
    return v_existing.result || jsonb_build_object(
      'idempotent', true,
      'receipt_id', v_existing.id
    );
  end if;

  select *
  into v_shift
  from public.tech_shifts shift_row
  where shift_row.id = p_shift_id
    and shift_row.shop_id = p_shop_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'Shift not found for shop.';
  end if;

  if v_shift.user_id <> p_actor_profile_id
     and lower(coalesce(v_actor.role::text, '')) not in (
       'owner',
       'admin',
       'manager',
       'advisor',
       'lead_hand',
       'lead hand',
       'leadhand',
       'foreman'
     ) then
    raise exception using
      errcode = 'P0001',
      message = 'Actor cannot add a punch for this shift.';
  end if;

  if v_event = 'end_shift' and v_shift.user_id is not null then
    perform public.pause_all_active_technician_labor_atomic(
      p_shop_id,
      v_shift.user_id,
      p_actor_profile_id,
      p_shop_id::text || ':offline-shift:' || p_operation_key,
      p_timestamp,
      'shift_end',
      'job_stopped_at_end_day',
      null,
      jsonb_build_object('source', 'offline_shift_punch')
    );
  end if;

  insert into public.punch_events (
    shift_id,
    user_id,
    profile_id,
    event_type,
    timestamp,
    note
  ) values (
    p_shift_id,
    coalesce(v_shift.user_id, p_actor_profile_id),
    coalesce(v_shift.user_id, p_actor_profile_id),
    v_event,
    p_timestamp,
    nullif(trim(coalesce(p_note, '')), '')
  )
  returning id into v_punch_id;

  v_result := jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'action_type', 'shift:punch-event',
    'shift_id', p_shift_id,
    'punch_event_id', v_punch_id,
    'completed_at', now()
  );

  insert into public.offline_mutation_receipts (
    shop_id,
    actor_user_id,
    operation_key,
    action_type,
    payload_hash,
    entity_type,
    entity_id,
    result
  ) values (
    p_shop_id,
    p_actor_auth_user_id,
    p_operation_key,
    'shift:punch-event',
    v_payload_hash,
    'shift',
    p_shift_id,
    v_result
  )
  returning id into v_receipt_id;

  return v_result || jsonb_build_object('receipt_id', v_receipt_id);
exception
  when unique_violation then
    select *
    into v_existing
    from public.offline_mutation_receipts receipt
    where receipt.shop_id = p_shop_id
      and receipt.operation_key = p_operation_key;

    if found
       and v_existing.actor_user_id = p_actor_auth_user_id
       and v_existing.action_type = 'shift:punch-event'
       and v_existing.payload_hash = v_payload_hash then
      return v_existing.result || jsonb_build_object(
        'idempotent', true,
        'receipt_id', v_existing.id
      );
    end if;

    raise exception using
      errcode = 'P0001',
      message =
        'IDEMPOTENCY_KEY_REUSE: operation key belongs to different mutation data.';
end;
$$;

revoke all on function public.apply_canonical_offline_shift_punch_atomic(
  uuid,
  uuid,
  uuid,
  text,
  uuid,
  text,
  timestamptz,
  text
) from public, anon;

grant execute on function public.apply_canonical_offline_shift_punch_atomic(
  uuid,
  uuid,
  uuid,
  text,
  uuid,
  text,
  timestamptz,
  text
) to authenticated, service_role;

comment on function public.apply_canonical_offline_shift_punch_atomic(
  uuid,
  uuid,
  uuid,
  text,
  uuid,
  text,
  timestamptz,
  text
) is
  'Atomically replays a shift punch while separating the auth receipt owner from the canonical Workforce profile.';
