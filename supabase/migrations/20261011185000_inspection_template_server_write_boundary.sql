-- Stage 2 of the inspection-template server-write rollout.
--
-- The replacement Shop, Field, imported-template, and optimization mutation
-- paths must be deployed before this migration is applied. They authenticate
-- and tenant/owner-scope the actor first, then use a privileged server writer.
--
-- Existing SELECT access and RLS visibility remain unchanged. Existing RLS
-- mutation policies also remain in place as a rollback safety net, but the
-- authenticated Data API role can no longer INSERT or UPDATE rows directly.
--
-- Rollback boundary:
--   grant insert, update on table public.inspection_templates to authenticated;

revoke insert, update
  on table public.inspection_templates
  from authenticated;

grant select, delete
  on table public.inspection_templates
  to authenticated;
