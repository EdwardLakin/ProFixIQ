\set ON_ERROR_STOP on

-- @regression-flow quotes.shop-recorded-decision
-- Regression coverage for the "Classic Shop Approval" phone-call approval
-- bug: an advisor recording a customer decision obtained by phone (or other
-- out-of-band contact) must be able to approve a quote line that was never
-- sent to the customer digitally. The canonical customer-decision engine
-- must keep rejecting that same unsent state for an ordinary customer/portal
-- decision.
begin;

insert into auth.users (id, email, raw_user_meta_data)
values (
  'fee10000-0000-4000-8000-000000000001',
  'shop-recorded-decision-owner@example.com',
  '{"full_name":"Shop Recorded Decision Owner"}'::jsonb
)
on conflict (id) do nothing;

insert into public.profiles (id, user_id, role, full_name)
values (
  'fee10000-0000-4000-8000-000000000001',
  'fee10000-0000-4000-8000-000000000001',
  'owner',
  'Shop Recorded Decision Owner'
)
on conflict (id) do update
set user_id = excluded.user_id,
    role = excluded.role,
    full_name = excluded.full_name;

insert into public.shops (id, owner_id, business_name, name, labor_rate)
values (
  'fee20000-0000-4000-8000-000000000001',
  'fee10000-0000-4000-8000-000000000001',
  'Shop Recorded Decision Shop',
  'Shop Recorded Decision Shop',
  0
);

update public.profiles
set shop_id = 'fee20000-0000-4000-8000-000000000001'
where id = 'fee10000-0000-4000-8000-000000000001';

insert into public.work_orders (
  id, shop_id, customer_id, status, type, record_type,
  estimate_number, estimate_status
) values (
  'fee30000-0000-4000-8000-000000000001',
  'fee20000-0000-4000-8000-000000000001',
  null,
  'in_progress',
  'repair',
  'work_order',
  null,
  null
);

-- Neither quote line has ever been sent to the customer.
insert into public.work_order_quote_lines (
  id, shop_id, work_order_id, description, job_type, status, stage,
  sent_to_customer_at, parts_total, subtotal, grand_total, metadata
) values
  (
    'fee40000-0000-4000-8000-000000000001',
    'fee20000-0000-4000-8000-000000000001',
    'fee30000-0000-4000-8000-000000000001',
    'Never-sent line approved by phone',
    'repair',
    'pending_parts',
    'advisor_pending',
    null,
    0,
    0,
    0,
    '{}'::jsonb
  ),
  (
    'fee40000-0000-4000-8000-000000000002',
    'fee20000-0000-4000-8000-000000000001',
    'fee30000-0000-4000-8000-000000000001',
    'Never-sent line for a customer-path decision',
    'repair',
    'pending_parts',
    'advisor_pending',
    null,
    0,
    0,
    0,
    '{}'::jsonb
  );

-- The "Classic Shop Approval" wrapper must record a phone approval for a
-- quote line that was never sent to the customer. Before this migration,
-- this raised "Quote line has not been sent to the customer." because the
-- wrapper delegated to the customer-portal engine with no way to signal it
-- was a shop-recorded, out-of-band decision.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"fee10000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

do $$
declare
  v_result jsonb;
  v_line public.work_order_quote_lines%rowtype;
begin
  v_result := public.apply_shop_quote_decision_atomic(
    'fee20000-0000-4000-8000-000000000001',
    'fee30000-0000-4000-8000-000000000001',
    array['fee40000-0000-4000-8000-000000000001'::uuid],
    'approve',
    'fee10000-0000-4000-8000-000000000001',
    'phone',
    'Approved by phone with Jamie at 2:15 PM.',
    'shop-recorded-sent-check-phone-approval',
    now()
  );

  if coalesce((v_result ->> 'ok')::boolean, false) is not true then
    raise exception 'Shop-recorded phone approval of a never-sent quote line was rejected: %',
      v_result;
  end if;

  select * into strict v_line
  from public.work_order_quote_lines
  where id = 'fee40000-0000-4000-8000-000000000001';

  if v_line.status::text <> 'converted'
     or v_line.work_order_line_id is null
     or v_line.metadata ->> 'decision_origin' is distinct from 'shop_recorded'
     or v_line.metadata ->> 'shop_decision_contact_method' is distinct from 'phone' then
    raise exception 'Shop-recorded phone approval did not materialize the never-sent quote line: %',
      to_jsonb(v_line);
  end if;
end;
$$;

reset role;

-- The canonical customer/portal decision path must still reject the same
-- never-sent state for an ordinary (non shop-recorded) decision. This proves
-- the fix narrows the exemption to shop-recorded decisions instead of
-- weakening the customer-facing precondition.
do $$
declare
  v_blocked boolean := false;
begin
  begin
    perform public.apply_customer_quote_decision_engine_atomic(
      'fee20000-0000-4000-8000-000000000001',
      'fee30000-0000-4000-8000-000000000001',
      array['fee40000-0000-4000-8000-000000000002'::uuid],
      'approve',
      false,
      null,
      'fee10000-0000-4000-8000-000000000001',
      'shop-recorded-sent-check-customer-path',
      now()
    );
  exception when sqlstate 'P0001' then
    v_blocked := sqlerrm = 'Quote line has not been sent to the customer.';
  end;
  if not v_blocked then
    raise exception 'Customer/portal decision on a never-sent quote line was not blocked';
  end if;
end;
$$;

rollback;
