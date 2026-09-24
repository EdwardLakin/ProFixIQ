\set ON_ERROR_STOP on

begin;

-- Local-only fixture, rolled back after exercising the migrated functions.
insert into auth.users (id, email, raw_user_meta_data)
values (
  '92510000-0000-4000-8000-000000000001',
  'fleet-invite-runtime-owner@example.test',
  '{"full_name":"Fleet Invite Runtime Owner"}'::jsonb
);

insert into public.profiles (id, user_id, role, full_name, email)
values (
  '92510000-0000-4000-8000-000000000001',
  '92510000-0000-4000-8000-000000000001',
  'owner',
  'Fleet Invite Runtime Owner',
  'fleet-invite-runtime-owner@example.test'
);

insert into public.shops (id, owner_id, business_name, name, user_limit)
values (
  '92520000-0000-4000-8000-000000000001',
  '92510000-0000-4000-8000-000000000001',
  'Fleet Invite Runtime Shop',
  'Fleet Invite Runtime Shop',
  5
);

update public.profiles
set shop_id = '92520000-0000-4000-8000-000000000001'
where id = '92510000-0000-4000-8000-000000000001';

insert into public.customers (id, shop_id, user_id, name, business_name, is_fleet)
values (
  '92530000-0000-4000-8000-000000000001',
  '92520000-0000-4000-8000-000000000001',
  '92510000-0000-4000-8000-000000000001',
  'Fleet Invite Runtime Customer',
  'Fleet Invite Runtime Customer',
  true
);

insert into public.fleets (id, shop_id, customer_id, name, active, created_by)
values (
  '92550000-0000-4000-8000-000000000001',
  '92520000-0000-4000-8000-000000000001',
  '92530000-0000-4000-8000-000000000001',
  'Fleet Invite Runtime Fleet',
  true,
  '92510000-0000-4000-8000-000000000001'
);

do $fleet_invitation_atomic$
declare
  v_shop uuid := '92520000-0000-4000-8000-000000000001';
  v_fleet uuid := '92550000-0000-4000-8000-000000000001';
  v_actor uuid := '92510000-0000-4000-8000-000000000001';
  v_first uuid;
  v_second uuid;
  v_resend record;
begin
  if has_function_privilege('authenticated',
      'public.issue_fleet_portal_invitation_atomic(uuid,uuid,text,text,text,timestamptz,uuid)',
      'EXECUTE') then
    raise exception 'Fleet issuance must not be executable by authenticated';
  end if;

  -- Ordinary dotted email is valid and normalized to a literal address.
  select invite_id into v_first
  from public.issue_fleet_portal_invitation_atomic(
    v_shop, v_fleet, '  Driver.Name@Example.com  ', 'viewer',
    repeat('a', 64), now() + interval '14 days', v_actor
  );
  if v_first is null or not exists (
    select 1 from public.fleet_portal_invites
    where id = v_first and email = 'driver.name@example.com' and revoked_at is null
  ) then
    raise exception 'First dotted-address invite was not created correctly';
  end if;

  begin
    perform public.issue_fleet_portal_invitation_atomic(
      v_shop, v_fleet, 'driver.name@example.com', 'manager',
      repeat('b', 64), now() + interval '14 days', v_actor
    );
    raise exception 'In-flight invitation must not be replaced';
  exception when sqlstate '55P03' then
    null;
  end;

  update public.fleet_portal_invites
  set delivery_status = 'delivered', delivery_reserved_until = null
  where id = v_first;

  select invite_id into v_second
  from public.issue_fleet_portal_invitation_atomic(
    v_shop, v_fleet, 'driver.name@example.com', 'viewer',
    repeat('b', 64), now() + interval '14 days', v_actor
  );
  if v_second = v_first or not exists (
    select 1 from public.fleet_portal_invites
    where id = v_first and revoked_at is not null
  ) then
    raise exception 'Replacement must revoke prior token in one transaction';
  end if;

  -- A duplicate token fails at INSERT after UPDATE, which must roll back
  -- the revocation of the prior valid invitation.
  begin
    perform public.issue_fleet_portal_invitation_atomic(
      v_shop, v_fleet, 'driver.name@example.com', 'viewer',
      repeat('b', 64), now() + interval '14 days', v_actor
    );
    raise exception 'Duplicate token hash should fail';
  exception when unique_violation then
    null;
  end;
  if not exists (
    select 1 from public.fleet_portal_invites
    where id = v_second and revoked_at is null
  ) then
    raise exception 'Failed insertion revoked a valid invitation';
  end if;

  update public.fleet_portal_invites
  set delivery_status = 'delivered', delivery_reserved_until = null
  where id = v_second;

  select * into v_resend
  from public.replace_fleet_portal_invitation_atomic(
    v_shop, v_second, repeat('c', 64),
    now() + interval '14 days', v_actor
  );
  if v_resend.invite_role <> 'viewer' or v_resend.invite_email <> 'driver.name@example.com'
     or not exists (select 1 from public.fleet_portal_invites
                    where id = v_second and revoked_at is not null) then
    raise exception 'Resend did not preserve the recipient and Fleet role';
  end if;
end;
$fleet_invitation_atomic$;

rollback;
