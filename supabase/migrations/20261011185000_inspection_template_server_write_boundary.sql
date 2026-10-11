-- Make inspection-template content mutations server-authoritative.
--
-- Existing SELECT access and RLS visibility remain unchanged. Existing RLS
-- mutation policies also remain in place as a rollback safety net, but the
-- authenticated Data API role can no longer INSERT or UPDATE rows directly.
-- Authorized application flows authenticate and tenant-scope the actor first,
-- then perform these mutations through server routes using service_role.
--
-- Rollback boundary:
--   grant insert, update on table public.inspection_templates to authenticated;

revoke insert, update
  on table public.inspection_templates
  from authenticated;

grant select, delete
  on table public.inspection_templates
  to authenticated;
