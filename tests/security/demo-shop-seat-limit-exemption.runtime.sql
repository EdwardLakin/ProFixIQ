\set ON_ERROR_STOP on

-- Regression for the demo-shop seat-limit exemption: approving a demo access
-- request into a fully-seeded internal demo shop (billing_entitlement_override
-- = 'internal_demo') must never be blocked by the plan-based seat-limit
-- triggers on public.profiles, while those same triggers must keep protecting
-- a real (non-demo) shop on the same plan.
--
-- Every auth.users insert below fires the on_auth_user_created trigger,
-- which auto-creates a bare public.profiles row (shop_id/role null) before
-- this script's own profiles insert runs -- so every profiles write here
-- targets that pre-created row via "on conflict (id) do update", matching
-- the pattern this repo's other fixtures already use for the same reason.

begin;

-- Fixture shop A: the internal demo shop this exemption targets.
insert into auth.users (id, email, raw_user_meta_data)
values (
  'a82f0000-0000-4000-8000-00000000a000',
  'seat-limit-demo-owner@example.test',
  '{"full_name":"Seat Limit Demo Owner"}'::jsonb
);

insert into public.profiles (id, user_id, role, full_name, email, shop_id)
values (
  'a82f0000-0000-4000-8000-00000000a000',
  'a82f0000-0000-4000-8000-00000000a000',
  'owner',
  'Seat Limit Demo Owner',
  'seat-limit-demo-owner@example.test',
  null
)
on conflict (id) do update
set user_id = excluded.user_id,
    role = excluded.role,
    full_name = excluded.full_name,
    email = excluded.email;

insert into public.shops (
  id, owner_id, business_name, name, plan,
  billing_entitlement_override
)
values (
  'a82f1000-0000-4000-8000-00000000a000',
  'a82f0000-0000-4000-8000-00000000a000',
  'Seat Limit Demo Shop Runtime',
  'Seat Limit Demo Shop Runtime',
  'starter',
  'internal_demo'
);

update public.profiles
set shop_id = 'a82f1000-0000-4000-8000-00000000a000'
where id = 'a82f0000-0000-4000-8000-00000000a000';

-- Fixture shop B: a real (non-demo) shop on the identical 'starter' plan --
-- the control group proving this exemption did not loosen seat enforcement
-- for a paying tenant.
insert into auth.users (id, email, raw_user_meta_data)
values (
  'a82f0000-0000-4000-8000-00000000b000',
  'seat-limit-real-owner@example.test',
  '{"full_name":"Seat Limit Real Owner"}'::jsonb
);

insert into public.profiles (id, user_id, role, full_name, email, shop_id)
values (
  'a82f0000-0000-4000-8000-00000000b000',
  'a82f0000-0000-4000-8000-00000000b000',
  'owner',
  'Seat Limit Real Owner',
  'seat-limit-real-owner@example.test',
  null
)
on conflict (id) do update
set user_id = excluded.user_id,
    role = excluded.role,
    full_name = excluded.full_name,
    email = excluded.email;

insert into public.shops (
  id, owner_id, business_name, name, plan,
  billing_entitlement_override
)
values (
  'a82f1000-0000-4000-8000-00000000b000',
  'a82f0000-0000-4000-8000-00000000b000',
  'Seat Limit Real Shop Runtime',
  'Seat Limit Real Shop Runtime',
  'starter',
  null
);

update public.profiles
set shop_id = 'a82f1000-0000-4000-8000-00000000b000'
where id = 'a82f0000-0000-4000-8000-00000000b000';

-- Fill both shops to exactly their plan's included seat count (10: the owner
-- above plus 9 more staff profiles each) so the next insert is the one that
-- the seat-limit triggers must evaluate.
do $seat_limit_fixture$
declare
  v_i integer;
  v_demo_user uuid;
  v_real_user uuid;
begin
  for v_i in 1..9 loop
    v_demo_user := ('a82f2000-0000-4000-8000-0000' || lpad(v_i::text, 8, '0'))::uuid;
    v_real_user := ('a82f3000-0000-4000-8000-0000' || lpad(v_i::text, 8, '0'))::uuid;

    insert into auth.users (id, email, raw_user_meta_data)
    values (v_demo_user, 'seat-limit-demo-staff-' || v_i || '@example.test', '{}'::jsonb);
    insert into public.profiles (id, user_id, role, full_name, email, shop_id)
    values (
      v_demo_user, v_demo_user, 'mechanic', 'Demo Staff ' || v_i,
      'seat-limit-demo-staff-' || v_i || '@example.test',
      'a82f1000-0000-4000-8000-00000000a000'
    )
    on conflict (id) do update
    set user_id = excluded.user_id,
        role = excluded.role,
        full_name = excluded.full_name,
        email = excluded.email,
        shop_id = excluded.shop_id;

    insert into auth.users (id, email, raw_user_meta_data)
    values (v_real_user, 'seat-limit-real-staff-' || v_i || '@example.test', '{}'::jsonb);
    insert into public.profiles (id, user_id, role, full_name, email, shop_id)
    values (
      v_real_user, v_real_user, 'mechanic', 'Real Staff ' || v_i,
      'seat-limit-real-staff-' || v_i || '@example.test',
      'a82f1000-0000-4000-8000-00000000b000'
    )
    on conflict (id) do update
    set user_id = excluded.user_id,
        role = excluded.role,
        full_name = excluded.full_name,
        email = excluded.email,
        shop_id = excluded.shop_id;
  end loop;
end;
$seat_limit_fixture$;

do $seat_limit_precondition$
declare
  v_demo_count integer;
  v_real_count integer;
begin
  select count(*) into v_demo_count from public.profiles
  where shop_id = 'a82f1000-0000-4000-8000-00000000a000';
  select count(*) into v_real_count from public.profiles
  where shop_id = 'a82f1000-0000-4000-8000-00000000b000';

  if v_demo_count <> 10 or v_real_count <> 10 then
    raise exception
      'Seat-limit fixture setup did not reach exactly 10 profiles per shop (demo=%, real=%).',
      v_demo_count, v_real_count;
  end if;
end;
$seat_limit_precondition$;

-- The 11th profile into the internal demo shop must succeed: this is the
-- exact "PLAN_USER_LIMIT_REACHED" / "Shop user limit reached" failure this
-- migration fixes (approving a demo access request once the demo shop is
-- fully seeded).
insert into auth.users (id, email, raw_user_meta_data)
values (
  'a82f0000-0000-4000-8000-00000000a999',
  'seat-limit-demo-overflow@example.test',
  '{}'::jsonb
);
insert into public.profiles (id, user_id, role, full_name, email, shop_id)
values (
  'a82f0000-0000-4000-8000-00000000a999',
  'a82f0000-0000-4000-8000-00000000a999',
  'mechanic',
  'Demo Overflow Staff',
  'seat-limit-demo-overflow@example.test',
  'a82f1000-0000-4000-8000-00000000a000'
)
on conflict (id) do update
set user_id = excluded.user_id,
    role = excluded.role,
    full_name = excluded.full_name,
    email = excluded.email,
    shop_id = excluded.shop_id;

-- The identical 11th-profile insert into the real (non-demo) shop on the
-- same 'starter' plan must still be rejected -- this exemption must not
-- loosen enforcement for a paying tenant.
do $seat_limit_real_shop_still_enforced$
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values (
    'a82f0000-0000-4000-8000-00000000b999',
    'seat-limit-real-overflow@example.test',
    '{}'::jsonb
  );
  insert into public.profiles (id, user_id, role, full_name, email, shop_id)
  values (
    'a82f0000-0000-4000-8000-00000000b999',
    'a82f0000-0000-4000-8000-00000000b999',
    'mechanic',
    'Real Overflow Staff',
    'seat-limit-real-overflow@example.test',
    'a82f1000-0000-4000-8000-00000000b000'
  )
  on conflict (id) do update
  set user_id = excluded.user_id,
      role = excluded.role,
      full_name = excluded.full_name,
      email = excluded.email,
      shop_id = excluded.shop_id;

  -- Distinct errcode so this deliberate test-failure signal is never
  -- swallowed by the "expected" handler below, which only catches the two
  -- codes the seat-limit triggers themselves raise.
  raise exception
    'Regression: an 11th profile insert into a real (non-demo) starter-plan shop succeeded -- seat-limit enforcement was loosened for a paying tenant.'
    using errcode = 'PXQ01';
exception
  when sqlstate 'P0001' or sqlstate '23514' then
    -- Expected: PLAN_USER_LIMIT_REACHED (P0001) or "Shop user limit reached" (23514).
    null;
end;
$seat_limit_real_shop_still_enforced$;

rollback;
