begin;

-- PostgreSQL requires schema USAGE in addition to the table-level SELECT
-- already granted by the preceding repair. Keep every object in private
-- explicitly ACL-gated; this grant only makes the intended service-role
-- quarantine reader operational and does not restore EXECUTE on private RPCs.
grant usage on schema private to service_role;

revoke all on table private.field_service_vehicle_assignment_quarantine
  from public, anon, authenticated;
grant select on table private.field_service_vehicle_assignment_quarantine
  to service_role;

comment on table private.field_service_vehicle_assignment_quarantine is
  'Service-role-readable audit snapshots of standalone Field truck assignments quarantined by the canonical repair.';

commit;
