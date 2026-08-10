\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email, raw_user_meta_data)
values (
  '9a200000-0000-4000-8000-000000000001',
  'mobile-v1-team-owner@example.com',
  '{"full_name":"Mobile V1 Team Owner"}'::jsonb
)
on conflict (id) do nothing;

insert into public.profiles (id, user_id, role, full_name, email, shop_id)
values (
  '9a200000-0000-4000-8000-000000000001',
  '9a200000-0000-4000-8000-000000000001',
  'owner',
  'Mobile V1 Team Owner',
  'mobile-v1-team-owner@example.com',
  null
)
on conflict (id) do update
set user_id = excluded.user_id,
    role = excluded.role,
    full_name = excluded.full_name,
    email = excluded.email;

insert into public.shops (
  id, owner_id, business_name, name, user_limit,
  accepts_online_booking, min_notice_minutes, max_lead_days,
  location_type
)
values (
  '9b200000-0000-4000-8000-000000000001',
  '9a200000-0000-4000-8000-000000000001',
  'Mobile V1 Team Runtime', 'Mobile V1 Team Runtime', 10,
  true, 0, 365, 'mobile_service_branch'
)
on conflict (id) do nothing;

update public.profiles
set shop_id = '9b200000-0000-4000-8000-000000000001'
where id = '9a200000-0000-4000-8000-000000000001';

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

do $$
declare
  v_intake jsonb;
  v_visit_id uuid;
begin
  perform public.mobile_configure_service_v1_atomic(
    '9b200000-0000-4000-8000-000000000001',
    'mobile', false, true, false, false, 60, 3, true,
    null, null,
    '9a200000-0000-4000-8000-000000000001'
  );

  v_intake := public.mobile_create_service_call_atomic(
    '9b200000-0000-4000-8000-000000000001',
    null, 'Team Dispatch Customer', '403-555-0299',
    null, 2022, 'Freightliner', 'Cascadia', 'TEAM0299',
    '456 Dispatch Road', 'Calgary', 'AB', 'T2P 2J9',
    'No-start in yard',
    '2099-08-10 19:00:00+00', 90, null, 'CAD',
    '9a200000-0000-4000-8000-000000000001',
    'mobile-v1:team-dispatch:intake:1'
  );

  v_visit_id := (v_intake ->> 'serviceVisitId')::uuid;
  if v_visit_id is null then
    raise exception 'Mobile V1 team assertion failed: intake did not create a Service Visit';
  end if;

  if coalesce((v_intake ->> 'assignedToCurrentActor')::boolean, false) then
    raise exception 'Mobile V1 team assertion failed: team-dispatch call auto-assigned to the call taker';
  end if;

  if exists (
    select 1 from public.service_visits sv
    where sv.id = v_visit_id and sv.assigned_user_id is not null
  ) then
    raise exception 'Mobile V1 team assertion failed: new call did not remain unassigned for Dispatch';
  end if;

  if not exists (
    select 1 from public.mobile_service_settings s
    where s.shop_id = '9b200000-0000-4000-8000-000000000001'
      and s.solo_mode = false
      and s.dispatch_enabled = true
      and s.field_operator_count_target = 3
  ) then
    raise exception 'Mobile V1 team assertion failed: dispatch configuration was not persisted';
  end if;
end;
$$;

rollback;

select 'mobile_v1_team_dispatch_ok' as result;
