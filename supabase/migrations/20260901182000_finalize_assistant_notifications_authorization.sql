begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';

-- Apply only after the trusted notification writer from the compatibility
-- release is deployed to every application instance. Browser clients retain
-- read access plus the acknowledgement columns governed by recipient-bound RLS.
drop policy if exists assistant_notifications_insert_rollout_compat
  on public.assistant_notifications;
drop policy if exists assistant_notifications_update_rollout_compat
  on public.assistant_notifications;

revoke insert, update on table public.assistant_notifications
  from authenticated;
grant select on table public.assistant_notifications to authenticated;
grant update (status, acknowledged_at, acknowledged_by, updated_at)
  on table public.assistant_notifications to authenticated;

notify pgrst, 'reload schema';

commit;
