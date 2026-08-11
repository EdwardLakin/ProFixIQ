\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email, raw_user_meta_data)
values
  ('9a300000-0000-4000-8000-000000000001', 'mobile-hardening-owner@example.com', '{"full_name":"Hardening Owner"}'::jsonb),
  ('9a300000-0000-4000-8000-000000000002', 'mobile-hardening-tech@example.com', '{"full_name":"Hardening Tech"}'::jsonb)
on conflict (id) do nothing;

insert into public.profiles (id, user_id, role, full_name, email, shop_id)
values
  ('9a300000-0000-4000-8000-000000000001', '9a300000-0000-4000-8000-000000000001', 'owner', 'Hardening Owner', 'mobile-hardening-owner@example.com', null),
  ('9a300000-0000-4000-8000-000000000002', '9a300000-0000-4000-8000-000000000002', 'mechanic', 'Hardening Tech', 'mobile-hardening-tech@example.com', null)
on conflict (id) do update
set user_id = excluded.user_id,
    role = excluded.role,
    full_name = excluded.full_name,
    email = excluded.email;

insert into public.shops (
  id, owner_id, business_name, name, user_limit,
  accepts_online_booking, min_notice_minutes, max_lead_days,
  location_type, country
)
values (
  '9b300000-0000-4000-8000-000000000001',
  '9a300000-0000-4000-8000-000000000001',
  'Mobile Hardening Runtime', 'Mobile Hardening Runtime', 10,
  true, 0, 365, 'mobile_service_branch', 'CA'
)
on conflict (id) do update set country = 'CA';

update public.profiles
set shop_id = '9b300000-0000-4000-8000-000000000001'
where id in (
  '9a300000-0000-4000-8000-000000000001',
  '9a300000-0000-4000-8000-000000000002'
);

insert into public.customers(
  id, shop_id, name, phone, phone_number, created_at, updated_at
) values (
  '9c300000-0000-4000-8000-000000000001',
  '9b300000-0000-4000-8000-000000000001',
  'John Smith', '403-555-0001', '403-555-0001', now(), now()
);

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '9a300000-0000-4000-8000-000000000001', true);
set local role authenticated;

do $$
declare
  v_intake jsonb;
  v_visit_id uuid;
  v_customer_id uuid;
  v_work_order_id uuid;
  v_plate_conflict boolean := false;
begin
  perform public.mobile_configure_service_v1_atomic(
    '9b300000-0000-4000-8000-000000000001',
    'mobile', true, false, false, false, 60, 1, true,
    null, null,
    '9a300000-0000-4000-8000-000000000001'
  );

  -- Same name + different phone must create a distinct customer instead of
  -- overwriting the existing John Smith.
  v_intake := public.mobile_create_service_call_atomic(
    '9b300000-0000-4000-8000-000000000001',
    null, 'John Smith', '403-555-0002',
    null, 2020, 'Ford', 'F-150', 'DUPLATE',
    '1 Identity Way', 'Calgary', 'AB', 'T2P 1A1',
    'Flat tire', '2099-08-12 10:00:00+00', 60, null, 'USD',
    '9a300000-0000-4000-8000-000000000001',
    'mobile-v1:hardening:same-name'
  );
  v_customer_id := (v_intake ->> 'customerId')::uuid;
  v_visit_id := (v_intake ->> 'serviceVisitId')::uuid;

  if v_customer_id = '9c300000-0000-4000-8000-000000000001' then
    raise exception 'Mobile V1 hardening failed: same-name customer was silently merged';
  end if;
  if not exists (
    select 1 from public.customers c
    where c.id = '9c300000-0000-4000-8000-000000000001'
      and coalesce(c.phone_number, c.phone) = '403-555-0001'
  ) then
    raise exception 'Mobile V1 hardening failed: existing same-name customer was mutated';
  end if;

  -- A plate already owned by John #2 cannot be silently reused for John #3.
  begin
    perform public.mobile_create_service_call_atomic(
      '9b300000-0000-4000-8000-000000000001',
      null, 'Different Customer', '403-555-0003',
      null, 2020, 'Ford', 'F-150', 'DUPLATE',
      '2 Identity Way', 'Calgary', 'AB', 'T2P 1A2',
      'Battery issue', '2099-08-12 12:00:00+00', 60, null, 'CAD',
      '9a300000-0000-4000-8000-000000000001',
      'mobile-v1:hardening:plate-conflict'
    );
  exception when sqlstate '23503' then
    v_plate_conflict := true;
  end;
  if not v_plate_conflict then
    raise exception 'Mobile V1 hardening failed: plate owned by another customer was reused';
  end if;

  -- Build a canonical WO to use for the unassigned-field-operator authorization
  -- test below.
  v_work_order_id := (
    public.mobile_materialize_service_visit_work_order_atomic(
      '9b300000-0000-4000-8000-000000000001',
      v_visit_id,
      '9a300000-0000-4000-8000-000000000001',
      'mobile-v1:hardening:wo'
    ) ->> 'workOrderId'
  )::uuid;
  if v_work_order_id is null then
    raise exception 'Mobile V1 hardening failed: canonical WO handoff missing';
  end if;

  -- Persist IDs for the next authenticated actor without committing data.
  perform set_config('mobile_test.work_order_id', v_work_order_id::text, true);
end;
$$;

reset role;

-- Explicitly enable the second user as a field operator. This user is not
-- assigned to the owner's Service Visit.
insert into public.mobile_field_operators(shop_id, profile_id, enabled, created_by)
values (
  '9b300000-0000-4000-8000-000000000001',
  '9a300000-0000-4000-8000-000000000002',
  true,
  '9a300000-0000-4000-8000-000000000001'
)
on conflict (shop_id, profile_id) do update set enabled = true;

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '9a300000-0000-4000-8000-000000000002', true);
set local role authenticated;

do $$
declare
  v_denied boolean := false;
  v_work_order_id uuid := current_setting('mobile_test.work_order_id')::uuid;
begin
  begin
    perform public.mobile_create_service_followup_atomic(
      '9b300000-0000-4000-8000-000000000001',
      v_work_order_id, null,
      'Unauthorized future work', 'quote_later', null, null, null,
      '9a300000-0000-4000-8000-000000000002',
      'mobile-v1:hardening:unauthorized-followup'
    );
  exception when sqlstate '42501' then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'Mobile V1 hardening failed: unassigned field operator created a follow-up';
  end if;
end;
$$;

reset role;

-- Deleting a profile must be allowed to cascade through mobile_field_operators
-- without the child AFTER DELETE trigger trying to reload the already-deleted
-- parent profile.
do $$
begin
  delete from public.profiles
  where id = '9a300000-0000-4000-8000-000000000002';

  if exists (
    select 1 from public.profiles
    where id = '9a300000-0000-4000-8000-000000000002'
  ) then
    raise exception 'Mobile V1 hardening failed: profile cascade delete rolled back';
  end if;
end;
$$;

rollback;

select 'mobile_v1_codex_hardening_ok' as result;
