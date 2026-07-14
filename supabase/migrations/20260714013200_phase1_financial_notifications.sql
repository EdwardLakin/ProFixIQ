begin;

alter table public.portal_notifications
  add column if not exists event_key text;

create unique index if not exists portal_notifications_user_event_uidx
  on public.portal_notifications(user_id, event_key)
  where event_key is not null;

alter table public.financial_domain_outbox
  add column if not exists processing_at timestamptz,
  add column if not exists next_attempt_at timestamptz not null default now();

create index if not exists financial_domain_outbox_delivery_idx
  on public.financial_domain_outbox(delivered_at, next_attempt_at, occurred_at)
  where delivered_at is null;

create or replace function public.mark_portal_notification_read(p_notification_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.portal_notifications
  set read_at = coalesce(read_at, now())
  where id = p_notification_id
    and user_id = auth.uid();
end;
$$;

create or replace function public.mark_all_portal_notifications_read()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.portal_notifications
  set read_at = now()
  where user_id = auth.uid()
    and read_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.mark_portal_notification_read(uuid) to authenticated;
grant execute on function public.mark_all_portal_notifications_read() to authenticated;

commit;
