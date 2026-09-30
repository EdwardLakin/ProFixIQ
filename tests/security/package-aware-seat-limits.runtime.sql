\set ON_ERROR_STOP on

-- Regression for package-aware seat-limit enforcement: shops.user_limit /
-- max_users (and the profiles triggers that read them) must reflect the
-- shop's real product package (shop_operations/field_service/
-- fleet_maintenance/complete_operations under stripe_pricing_model =
-- 'product_packages_v1'), not fall through to the legacy plan-based
-- default of 10 for every package.
--
-- Every auth.users insert below fires the on_auth_user_created trigger,
-- which auto-creates a bare public.profiles row (shop_id/role null) before
-- this script's own profiles insert runs -- so every profiles write here
-- targets that pre-created row via "on conflict (id) do update", matching
-- the pattern this repo's other fixtures already use for the same reason.

begin;

-- Fixture shop A: 'field_service' package -- no seat concept at all
-- (PRODUCT_PACKAGE_PRICING.field_service.includedUsers = null; priced by
-- service trucks, not users). Must never hit a user cap.
insert into auth.users (id, email, raw_user_meta_data)
values (
  'a82e0000-0000-4000-8000-00000000a000',
  'package-seat-field-owner@example.test',
  '{"full_name":"Package Seat Field Owner"}'::jsonb
);
insert into public.profiles (id, user_id, role, full_name, email, shop_id)
values (
  'a82e0000-0000-4000-8000-00000000a000',
  'a82e0000-0000-4000-8000-00000000a000',
  'owner', 'Package Seat Field Owner', 'package-seat-field-owner@example.test', null
)
on conflict (id) do update
set user_id = excluded.user_id, role = excluded.role, full_name = excluded.full_name, email = excluded.email;

insert into public.shops (id, owner_id, business_name, name, plan, subscription_package, stripe_pricing_model)
values (
  'a82e1000-0000-4000-8000-00000000a000',
  'a82e0000-0000-4000-8000-00000000a000',
  'Package Seat Field Runtime', 'Package Seat Field Runtime',
  'starter', 'field_service', 'product_packages_v1'
);

update public.profiles
set shop_id = 'a82e1000-0000-4000-8000-00000000a000'
where id = 'a82e0000-0000-4000-8000-00000000a000';

-- Fixture shop B: 'complete_operations' package -- 10 included seats, same
-- as the legacy default, but must come from the package (not the stale
-- 'starter' legacy plan this fixture also happens to carry).
insert into auth.users (id, email, raw_user_meta_data)
values (
  'a82e0000-0000-4000-8000-00000000b000',
  'package-seat-complete-owner@example.test',
  '{"full_name":"Package Seat Complete Owner"}'::jsonb
);
insert into public.profiles (id, user_id, role, full_name, email, shop_id)
values (
  'a82e0000-0000-4000-8000-00000000b000',
  'a82e0000-0000-4000-8000-00000000b000',
  'owner', 'Package Seat Complete Owner', 'package-seat-complete-owner@example.test', null
)
on conflict (id) do update
set user_id = excluded.user_id, role = excluded.role, full_name = excluded.full_name, email = excluded.email;

insert into public.shops (id, owner_id, business_name, name, plan, subscription_package, stripe_pricing_model)
values (
  'a82e1000-0000-4000-8000-00000000b000',
  'a82e0000-0000-4000-8000-00000000b000',
  'Package Seat Complete Runtime', 'Package Seat Complete Runtime',
  'starter', 'complete_operations', 'product_packages_v1'
);

update public.profiles
set shop_id = 'a82e1000-0000-4000-8000-00000000b000'
where id = 'a82e0000-0000-4000-8000-00000000b000';

do $seat_check$
declare
  v_field_max integer;
  v_complete_max integer;
begin
  select max_users into v_field_max from public.shops where id = 'a82e1000-0000-4000-8000-00000000a000';
  select max_users into v_complete_max from public.shops where id = 'a82e1000-0000-4000-8000-00000000b000';

  if v_field_max <> 2147483647 then
    raise exception 'field_service shop max_users should be unlimited (2147483647), got %.', v_field_max;
  end if;
  if v_complete_max <> 10 then
    raise exception 'complete_operations shop max_users should be 10, got %.', v_complete_max;
  end if;
end;
$seat_check$;

-- Fill both shops to 10 profiles (the owner above plus 9 staff each).
do $seat_limit_fixture$
declare
  v_i integer;
  v_field_user uuid;
  v_complete_user uuid;
begin
  for v_i in 1..9 loop
    v_field_user := ('a82e2000-0000-4000-8000-0000' || lpad(v_i::text, 8, '0'))::uuid;
    v_complete_user := ('a82e3000-0000-4000-8000-0000' || lpad(v_i::text, 8, '0'))::uuid;

    insert into auth.users (id, email, raw_user_meta_data)
    values (v_field_user, 'package-seat-field-staff-' || v_i || '@example.test', '{}'::jsonb);
    insert into public.profiles (id, user_id, role, full_name, email, shop_id)
    values (
      v_field_user, v_field_user, 'mechanic', 'Field Staff ' || v_i,
      'package-seat-field-staff-' || v_i || '@example.test',
      'a82e1000-0000-4000-8000-00000000a000'
    )
    on conflict (id) do update
    set user_id = excluded.user_id, role = excluded.role, full_name = excluded.full_name,
        email = excluded.email, shop_id = excluded.shop_id;

    insert into auth.users (id, email, raw_user_meta_data)
    values (v_complete_user, 'package-seat-complete-staff-' || v_i || '@example.test', '{}'::jsonb);
    insert into public.profiles (id, user_id, role, full_name, email, shop_id)
    values (
      v_complete_user, v_complete_user, 'mechanic', 'Complete Staff ' || v_i,
      'package-seat-complete-staff-' || v_i || '@example.test',
      'a82e1000-0000-4000-8000-00000000b000'
    )
    on conflict (id) do update
    set user_id = excluded.user_id, role = excluded.role, full_name = excluded.full_name,
        email = excluded.email, shop_id = excluded.shop_id;
  end loop;
end;
$seat_limit_fixture$;

do $seat_limit_precondition$
declare
  v_field_count integer;
  v_complete_count integer;
begin
  select count(*) into v_field_count from public.profiles where shop_id = 'a82e1000-0000-4000-8000-00000000a000';
  select count(*) into v_complete_count from public.profiles where shop_id = 'a82e1000-0000-4000-8000-00000000b000';
  if v_field_count <> 10 or v_complete_count <> 10 then
    raise exception
      'Seat-limit fixture setup did not reach exactly 10 profiles per shop (field=%, complete=%).',
      v_field_count, v_complete_count;
  end if;
end;
$seat_limit_precondition$;

-- The 11th profile into the field_service shop must succeed: this package
-- has no seat cap at all.
insert into auth.users (id, email, raw_user_meta_data)
values ('a82e0000-0000-4000-8000-00000000a999', 'package-seat-field-overflow@example.test', '{}'::jsonb);
insert into public.profiles (id, user_id, role, full_name, email, shop_id)
values (
  'a82e0000-0000-4000-8000-00000000a999',
  'a82e0000-0000-4000-8000-00000000a999',
  'mechanic', 'Field Overflow Staff', 'package-seat-field-overflow@example.test',
  'a82e1000-0000-4000-8000-00000000a000'
)
on conflict (id) do update
set user_id = excluded.user_id, role = excluded.role, full_name = excluded.full_name,
    email = excluded.email, shop_id = excluded.shop_id;

-- The identical 11th-profile insert into the complete_operations shop must
-- still be rejected -- that package includes exactly 10 seats.
do $seat_limit_complete_still_enforced$
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values ('a82e0000-0000-4000-8000-00000000b999', 'package-seat-complete-overflow@example.test', '{}'::jsonb);
  insert into public.profiles (id, user_id, role, full_name, email, shop_id)
  values (
    'a82e0000-0000-4000-8000-00000000b999',
    'a82e0000-0000-4000-8000-00000000b999',
    'mechanic', 'Complete Overflow Staff', 'package-seat-complete-overflow@example.test',
    'a82e1000-0000-4000-8000-00000000b000'
  )
  on conflict (id) do update
  set user_id = excluded.user_id, role = excluded.role, full_name = excluded.full_name,
      email = excluded.email, shop_id = excluded.shop_id;

  -- Distinct errcode so this deliberate test-failure signal is never
  -- swallowed by the "expected" handler below.
  raise exception
    'Regression: an 11th profile insert into a complete_operations shop succeeded -- its 10-seat package limit was not enforced.'
    using errcode = 'PXQ02';
exception
  when sqlstate 'P0001' or sqlstate '23514' then
    null;
end;
$seat_limit_complete_still_enforced$;

rollback;
