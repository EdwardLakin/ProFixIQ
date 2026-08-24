begin;

-- Compatibility cleanup for development branches that recorded the earlier
-- quarantine-reader ACL before the production-safe controlled reader replaced
-- it. Production receives the same final least-privilege state.
revoke usage on schema private from service_role;
revoke all on table private.field_service_vehicle_assignment_quarantine
  from public, anon, authenticated, service_role;

create or replace function public.field_service_vehicle_assignment_quarantine_report(
  p_shop_id uuid default null,
  p_limit integer default 100
) returns table (
  quarantine_id bigint,
  shop_id uuid,
  service_vehicle_id uuid,
  profile_id uuid,
  assigned_by_profile_id uuid,
  assignment_created_at timestamptz,
  assignment_updated_at timestamptz,
  reason text,
  source_migration text,
  quarantined_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    quarantine.id,
    quarantine.shop_id,
    quarantine.service_vehicle_id,
    quarantine.profile_id,
    quarantine.assigned_by_profile_id,
    quarantine.assignment_created_at,
    quarantine.assignment_updated_at,
    quarantine.reason,
    quarantine.source_migration,
    quarantine.quarantined_at
  from private.field_service_vehicle_assignment_quarantine quarantine
  where p_shop_id is null or quarantine.shop_id = p_shop_id
  order by quarantine.id desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
$$;

revoke all on function public.field_service_vehicle_assignment_quarantine_report(
  uuid,
  integer
) from public, anon, authenticated;
grant execute on function public.field_service_vehicle_assignment_quarantine_report(
  uuid,
  integer
) to service_role;

comment on function public.field_service_vehicle_assignment_quarantine_report(
  uuid,
  integer
) is
  'Bounded service-role-only reader for standalone Field truck-assignment quarantine diagnostics.';

notify pgrst, 'reload schema';

commit;
