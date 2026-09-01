begin;

-- Reconcile a production-originated relation that is already depended on by
-- notification writers throughout the application but was never represented in
-- canonical clean replay. This is intentionally forward-only and is a no-op for
-- production's existing table contract.
create table if not exists public.assistant_notifications (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  role text,
  source text not null default 'ops'::text,
  fingerprint text not null,
  code text not null,
  level text not null,
  title text not null,
  message text not null,
  href text,
  entity_type text,
  entity_id uuid,
  status text not null default 'active'::text,
  metadata jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assistant_notifications_shop_id_fingerprint_key unique (shop_id, fingerprint),
  constraint assistant_notifications_acknowledged_requires_timestamp_chk check (status <> 'acknowledged'::text or acknowledged_at is not null),
  constraint assistant_notifications_anchor_chk check (user_id is not null or entity_id is not null),
  constraint assistant_notifications_code_required_chk check (coalesce(trim(code), ''::text) <> ''::text),
  constraint assistant_notifications_level_chk check (level = any (array['info'::text, 'warning'::text, 'critical'::text])),
  constraint assistant_notifications_message_required_chk check (coalesce(trim(message), ''::text) <> ''::text),
  constraint assistant_notifications_resolved_requires_timestamp_chk check (status <> 'resolved'::text or resolved_at is not null),
  constraint assistant_notifications_shop_required_chk check (shop_id is not null),
  constraint assistant_notifications_status_chk check (lower(replace(status, ' '::text, '_'::text)) = any (array['active'::text, 'open'::text, 'acknowledged'::text, 'resolved'::text])),
  constraint assistant_notifications_title_required_chk check (coalesce(trim(title), ''::text) <> ''::text)
);

create index if not exists assistant_notifications_role_status_idx
  on public.assistant_notifications (shop_id, role, status, last_seen_at desc);
create index if not exists assistant_notifications_shop_status_idx
  on public.assistant_notifications (shop_id, status, level, last_seen_at desc);
create index if not exists assistant_notifications_user_status_idx
  on public.assistant_notifications (user_id, status, last_seen_at desc);
create index if not exists idx_assistant_notifications_entity
  on public.assistant_notifications (entity_type, entity_id);
create index if not exists idx_assistant_notifications_shop_created
  on public.assistant_notifications (shop_id, created_at desc);
create index if not exists idx_assistant_notifications_shop_status
  on public.assistant_notifications (shop_id, status);
create index if not exists idx_assistant_notifications_user_created_at
  on public.assistant_notifications (user_id, created_at desc);

create or replace function public.enforce_assistant_notification_consistency()
returns trigger
language plpgsql
as $function$
declare
  shop_exists uuid;
begin
  select id into shop_exists
  from public.shops
  where id = new.shop_id;

  if shop_exists is null then
    raise exception
      'assistant_notification % references missing shop %',
      new.id,
      new.shop_id;
  end if;

  return new;
end;
$function$;

do $do$
begin
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.assistant_notifications'::regclass
      and tgname = 'trg_enforce_assistant_notification_consistency'
      and not tgisinternal
  ) then
    create trigger trg_enforce_assistant_notification_consistency
      before insert or update of shop_id on public.assistant_notifications
      for each row execute function public.enforce_assistant_notification_consistency();
  end if;
end
$do$;

alter table public.assistant_notifications enable row level security;

do $do$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'assistant_notifications'
      and policyname = 'assistant_notifications_select_same_shop'
  ) then
    create policy assistant_notifications_select_same_shop
      on public.assistant_notifications
      for select
      to authenticated
      using (exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.shop_id = assistant_notifications.shop_id
      ));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'assistant_notifications'
      and policyname = 'assistant_notifications_insert_same_shop'
  ) then
    create policy assistant_notifications_insert_same_shop
      on public.assistant_notifications
      for insert
      to authenticated
      with check (exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.shop_id = assistant_notifications.shop_id
      ));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'assistant_notifications'
      and policyname = 'assistant_notifications_update_same_shop'
  ) then
    create policy assistant_notifications_update_same_shop
      on public.assistant_notifications
      for update
      to authenticated
      using (exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.shop_id = assistant_notifications.shop_id
      ))
      with check (exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.shop_id = assistant_notifications.shop_id
      ));
  end if;
end
$do$;

grant all on table public.assistant_notifications to anon;
grant all on table public.assistant_notifications to authenticated;
grant all on table public.assistant_notifications to service_role;

commit;
