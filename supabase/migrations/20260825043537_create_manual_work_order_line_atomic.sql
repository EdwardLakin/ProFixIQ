begin;

-- Keep the idempotency receipt independent of the mutable line row. A
-- partless line can be deliberately hard-deleted by the established void
-- command, but a delayed retry must never recreate that deleted job.
create table public.manual_work_order_line_creation_receipts (
  line_id uuid primary key,
  shop_id uuid not null,
  work_order_id uuid not null,
  request_sha256 text not null
    check (request_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);

comment on table public.manual_work_order_line_creation_receipts is
  'Service-command receipts that keep manual Add Job retries idempotent after the mutable line is deleted.';

alter table public.manual_work_order_line_creation_receipts enable row level security;
revoke all on table public.manual_work_order_line_creation_receipts
  from public, anon, authenticated, service_role;

-- Additive, trusted mutation boundary for the manual "Add Job" workspace flow.
-- The browser remains authenticated with the normal user session, while the
-- server route calls this command with service_role only after resolving both
-- the auth user and the canonical shop profile.
create function public.create_manual_work_order_line_atomic(
  p_shop_id uuid,
  p_work_order_id uuid,
  p_line_id uuid,
  p_authenticated_user_id uuid,
  p_actor_profile_id uuid,
  p_complaint text,
  p_correction text,
  p_labor_time numeric,
  p_parts_text text,
  p_urgency text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype;
  v_work_order public.work_orders%rowtype;
  v_existing public.work_order_lines%rowtype;
  v_receipt public.manual_work_order_line_creation_receipts%rowtype;
  v_complaint text := btrim(coalesce(p_complaint, ''));
  v_correction text := nullif(btrim(coalesce(p_correction, '')), '');
  v_labor_time numeric := case
    when coalesce(p_labor_time, 0) > 0 then p_labor_time
    else null
  end;
  v_parts_text text := nullif(p_parts_text, '');
  v_parent_status text;
  v_actor_role text;
  v_existing_matches boolean;
  v_receipt_inserted boolean;
  v_request jsonb;
  v_request_sha256 text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'MANUAL_WORK_ORDER_LINE_SERVICE_ROLE_REQUIRED';
  end if;

  if p_shop_id is null
     or p_work_order_id is null
     or p_line_id is null
     or p_authenticated_user_id is null
     or p_actor_profile_id is null
     or v_complaint = ''
     or p_labor_time < 0
     or p_labor_time > 1000
     or p_urgency is null
     or p_urgency not in ('low', 'medium', 'high') then
    raise exception using
      errcode = '22023',
      message = 'MANUAL_WORK_ORDER_LINE_INVALID_ARGUMENT';
  end if;

  -- Bind the canonical profile to both the tenant and the authenticated user.
  -- Imported profiles can use the auth UUID as either profiles.id or
  -- profiles.user_id, so both established identity shapes remain supported.
  select profile.*
    into v_actor
  from public.profiles profile
  where profile.id = p_actor_profile_id
    and profile.shop_id = p_shop_id
    and (
      profile.id = p_authenticated_user_id
      or profile.user_id = p_authenticated_user_id
    )
  for share;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'MANUAL_WORK_ORDER_LINE_ACTOR_FORBIDDEN';
  end if;

  v_actor_role := case lower(btrim(coalesce(v_actor.role::text, '')))
    when 'tech' then 'mechanic'
    when 'technician' then 'mechanic'
    when 'lead' then 'lead_hand'
    when 'leadhand' then 'lead_hand'
    when 'lead hand' then 'lead_hand'
    when 'service_advisor' then 'service'
    when 'service advisor' then 'service'
    else lower(btrim(coalesce(v_actor.role::text, '')))
  end;

  -- Defense in depth for the established Add Job role contract. Mechanics
  -- remain eligible only when the locked work order is assigned to them.
  if v_actor_role not in (
    'owner',
    'admin',
    'manager',
    'advisor',
    'service',
    'mechanic',
    'lead_hand',
    'foreman'
  ) then
    raise exception using
      errcode = '42501',
      message = 'MANUAL_WORK_ORDER_LINE_ACTOR_FORBIDDEN';
  end if;

  -- Serialize line creation with lifecycle/financial transitions on the
  -- tenant-scoped parent. Child tenant and vehicle identity are derived only
  -- from this locked row, never from browser input.
  select work_order.*
    into v_work_order
  from public.work_orders work_order
  where work_order.id = p_work_order_id
    and work_order.shop_id = p_shop_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'MANUAL_WORK_ORDER_LINE_NOT_FOUND';
  end if;

  if v_actor_role = 'mechanic'
     and not exists (
       select 1
       from public.work_order_lines assigned_line
       where assigned_line.work_order_id = v_work_order.id
         and assigned_line.shop_id = v_work_order.shop_id
         and (
           assigned_line.assigned_tech_id in (
             v_actor.id,
             p_authenticated_user_id
           )
           or assigned_line.assigned_to in (
             v_actor.id,
             p_authenticated_user_id
           )
           or exists (
             select 1
             from public.work_order_line_technicians assignment
             where assignment.work_order_line_id = assigned_line.id
               and assignment.technician_id = v_actor.id
           )
         )
     ) then
    raise exception using
      errcode = '42501',
      message = 'MANUAL_WORK_ORDER_LINE_ACTOR_FORBIDDEN';
  end if;

  v_request := jsonb_build_object(
    'shop_id', p_shop_id,
    'work_order_id', p_work_order_id,
    'line_id', p_line_id,
    'authenticated_user_id', p_authenticated_user_id,
    'actor_profile_id', p_actor_profile_id,
    'complaint', v_complaint,
    'correction', v_correction,
    'labor_time', v_labor_time,
    'parts_text', v_parts_text,
    'urgency', p_urgency
  );
  v_request_sha256 := encode(
    extensions.digest(convert_to(v_request::text, 'UTF8'), 'sha256'),
    'hex'
  );

  -- INSERT .. ON CONFLICT serializes concurrent uses of the same stable UUID.
  -- A pre-existing receipt wins even when the mutable line no longer exists.
  insert into public.manual_work_order_line_creation_receipts (
    line_id,
    shop_id,
    work_order_id,
    request_sha256
  ) values (
    p_line_id,
    v_work_order.shop_id,
    v_work_order.id,
    v_request_sha256
  )
  on conflict (line_id) do nothing;
  v_receipt_inserted := found;

  select receipt.*
    into v_receipt
  from public.manual_work_order_line_creation_receipts receipt
  where receipt.line_id = p_line_id
  for update;

  if not found
     or v_receipt.shop_id is distinct from v_work_order.shop_id
     or v_receipt.work_order_id is distinct from v_work_order.id
     or v_receipt.request_sha256 is distinct from v_request_sha256 then
    raise exception using
      errcode = '23505',
      message = 'MANUAL_WORK_ORDER_LINE_ID_CONFLICT';
  end if;

  select line.*
    into v_existing
  from public.work_order_lines line
  where line.id = p_line_id
  for update;

  if not v_receipt_inserted then
    if found
       and (
         v_existing.work_order_id is distinct from v_work_order.id
         or v_existing.shop_id is distinct from v_work_order.shop_id
       ) then
      raise exception using
        errcode = '23505',
        message = 'MANUAL_WORK_ORDER_LINE_ID_CONFLICT';
    end if;

    return jsonb_build_object(
      'ok', true,
      'line_id', p_line_id,
      'idempotent', true
    );
  end if;

  if found then
    v_existing_matches :=
      v_existing.work_order_id is not distinct from v_work_order.id
      and v_existing.vehicle_id is not distinct from v_work_order.vehicle_id
      and v_existing.complaint is not distinct from v_complaint
      and v_existing.cause is null
      and v_existing.correction is not distinct from v_correction
      and v_existing.labor_time is not distinct from v_labor_time
      and v_existing.parts is not distinct from v_parts_text
      and v_existing.status is not distinct from 'awaiting_approval'
      and v_existing.approval_state is not distinct from 'pending'
      and v_existing.job_type is not distinct from 'repair'
      and v_existing.shop_id is not distinct from v_work_order.shop_id
      and v_existing.user_id is not distinct from p_authenticated_user_id
      and v_existing.urgency is not distinct from p_urgency;

    if v_existing_matches then
      return jsonb_build_object(
        'ok', true,
        'line_id', p_line_id,
        'idempotent', true
      );
    end if;

    raise exception using
      errcode = '23505',
      message = 'MANUAL_WORK_ORDER_LINE_ID_CONFLICT';
  end if;

  v_parent_status := lower(
    replace(
      replace(btrim(coalesce(v_work_order.status::text, '')), ' ', '_'),
      '-',
      '_'
    )
  );
  if v_parent_status in (
    'archived',
    'cancelled',
    'canceled',
    'closed',
    'completed',
    'done',
    'invoiced',
    'paid',
    'void',
    'voided'
  ) then
    raise exception using
      errcode = '55000',
      message = 'MANUAL_WORK_ORDER_LINE_CLOSED';
  end if;

  if lower(btrim(coalesce(v_work_order.payment_status::text, ''))) = 'paid' then
    raise exception using
      errcode = '55000',
      message = 'MANUAL_WORK_ORDER_LINE_PAID';
  end if;

  if public.work_order_is_financially_locked(
    v_work_order.shop_id,
    v_work_order.id
  ) then
    raise exception using
      errcode = '55000',
      message = 'MANUAL_WORK_ORDER_LINE_FINANCIALLY_LOCKED';
  end if;

  begin
    insert into public.work_order_lines (
      id,
      work_order_id,
      vehicle_id,
      complaint,
      cause,
      correction,
      labor_time,
      parts,
      status,
      approval_state,
      job_type,
      shop_id,
      user_id,
      urgency
    ) values (
      p_line_id,
      v_work_order.id,
      v_work_order.vehicle_id,
      v_complaint,
      null,
      v_correction,
      v_labor_time,
      v_parts_text,
      'awaiting_approval',
      'pending',
      'repair',
      v_work_order.shop_id,
      p_authenticated_user_id,
      p_urgency
    );
  exception
    when unique_violation then
      -- A UUID collision against a different parent can race outside this
      -- parent's lock. Re-read it and accept only an exact creation intent.
      select line.*
        into v_existing
      from public.work_order_lines line
      where line.id = p_line_id
      for update;

      v_existing_matches := found
        and v_existing.work_order_id is not distinct from v_work_order.id
        and v_existing.vehicle_id is not distinct from v_work_order.vehicle_id
        and v_existing.complaint is not distinct from v_complaint
        and v_existing.cause is null
        and v_existing.correction is not distinct from v_correction
        and v_existing.labor_time is not distinct from v_labor_time
        and v_existing.parts is not distinct from v_parts_text
        and v_existing.status is not distinct from 'awaiting_approval'
        and v_existing.approval_state is not distinct from 'pending'
        and v_existing.job_type is not distinct from 'repair'
        and v_existing.shop_id is not distinct from v_work_order.shop_id
        and v_existing.user_id is not distinct from p_authenticated_user_id
        and v_existing.urgency is not distinct from p_urgency;

      if v_existing_matches then
        return jsonb_build_object(
          'ok', true,
          'line_id', p_line_id,
          'idempotent', true
        );
      end if;

      raise exception using
        errcode = '23505',
        message = 'MANUAL_WORK_ORDER_LINE_ID_CONFLICT';
  end;

  return jsonb_build_object(
    'ok', true,
    'line_id', p_line_id,
    'idempotent', false
  );
end;
$$;

comment on function public.create_manual_work_order_line_atomic(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  numeric,
  text,
  text
) is
  'Service-role-only atomic manual Work Order line creation with locked parent scope, canonical-profile authorization, assigned-mechanic compatibility, preserved auth-user actor identity, and durable hashed UUID idempotency.';

revoke all on function public.create_manual_work_order_line_atomic(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  numeric,
  text,
  text
) from public, anon, authenticated, service_role;

grant execute on function public.create_manual_work_order_line_atomic(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  numeric,
  text,
  text
) to service_role;

notify pgrst, 'reload schema';

commit;
