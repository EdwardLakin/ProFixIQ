-- Align assistant_notifications.status check constraint with app canonical writes.
-- Canonical app statuses: active | acknowledged | resolved.
-- Backward compatibility: keep accepting legacy "open" rows/queries.

alter table public.assistant_notifications
  drop constraint if exists assistant_notifications_status_chk;

alter table public.assistant_notifications
  drop constraint if exists assistant_notifications_status_check;

alter table public.assistant_notifications
  add constraint assistant_notifications_status_chk
  check (
    lower(replace(status, ' ', '_')) = any (
      array['active'::text, 'open'::text, 'acknowledged'::text, 'resolved'::text]
    )
  );
