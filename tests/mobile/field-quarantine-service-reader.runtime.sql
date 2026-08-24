\set ON_ERROR_STOP on

begin;

insert into private.field_service_vehicle_assignment_quarantine (
  shop_id,
  service_vehicle_id,
  profile_id,
  assigned_by_profile_id,
  assignment_created_at,
  assignment_updated_at,
  reason
) values (
  '8fd00000-0000-4000-8000-000000000001',
  '8fd00000-0000-4000-8000-000000000002',
  '8fd00000-0000-4000-8000-000000000003',
  null,
  now(),
  now(),
  'ambiguous_owner_vehicle_set'
);

set local role service_role;

do $$
begin
  if not exists (
    select 1
    from private.field_service_vehicle_assignment_quarantine quarantine
    where quarantine.shop_id = '8fd00000-0000-4000-8000-000000000001'
      and quarantine.reason = 'ambiguous_owner_vehicle_set'
  ) then
    raise exception 'Field quarantine reader failed: service role could not read the audit snapshot';
  end if;
end;
$$;

reset role;
set local role authenticated;

do $$
begin
  begin
    perform 1
    from private.field_service_vehicle_assignment_quarantine
    limit 1;
    raise exception 'Field quarantine reader failed: authenticated role read private audit snapshots';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

reset role;
rollback;
