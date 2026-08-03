-- Supply the customer portal notification table before the financial
-- notification migration extends it with durable event deduplication.

do $$
declare
  v_mode text;
begin
  select mode into v_mode
  from public.profixiq_schema_baselines
  where version = '20260705000000';

  if v_mode is null then
    raise exception using errcode = 'P0001',
      message = 'PROFIXIQ_BASELINE_MISSING: 20260705000000 must run first.';
  end if;

  if v_mode = 'existing' then
    if to_regclass('public.portal_notifications') is null then
      raise exception using errcode = 'P0001',
        message = 'PARTIAL_PROFIXIQ_SCHEMA: required table public.portal_notifications is missing.';
    end if;
    return;
  end if;

  if v_mode <> 'bootstrap' then
    raise exception using errcode = 'P0001',
      message = 'PROFIXIQ_BASELINE_MODE_INVALID: ' || coalesce(v_mode, '<null>');
  end if;
end
$$;

create table if not exists public.portal_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete cascade,
  work_order_id uuid references public.work_orders(id) on delete cascade,
  kind text not null default 'update',
  title text,
  body text,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists portal_notifications_user_created_idx
  on public.portal_notifications(user_id, created_at desc);

create index if not exists portal_notifications_work_order_idx
  on public.portal_notifications(work_order_id, created_at desc)
  where work_order_id is not null;

alter table public.portal_notifications enable row level security;

drop policy if exists portal_notifications_user_select
  on public.portal_notifications;
create policy portal_notifications_user_select
  on public.portal_notifications
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists portal_notifications_user_update
  on public.portal_notifications;
create policy portal_notifications_user_update
  on public.portal_notifications
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Notification creation is performed by trusted server/service-role flows.
revoke insert, delete on public.portal_notifications from authenticated;
grant select, update on public.portal_notifications to authenticated;
