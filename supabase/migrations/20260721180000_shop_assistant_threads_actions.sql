-- Durable, shop-scoped conversation and action records for the shop-wide assistant.
-- The existing technician assistant remains separate and does not use these tables.

create table if not exists public.shop_assistant_threads (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null,
  user_id uuid not null,
  title text not null default 'Shop Assistant',
  context jsonb not null default '{}'::jsonb,
  last_message_at timestamptz not null default now(),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shop_assistant_threads_title_not_blank_chk
    check (length(btrim(title)) > 0)
);

create index if not exists shop_assistant_threads_owner_recent_idx
  on public.shop_assistant_threads (shop_id, user_id, last_message_at desc);

create index if not exists shop_assistant_threads_active_idx
  on public.shop_assistant_threads (shop_id, user_id, last_message_at desc)
  where archived_at is null;

create table if not exists public.shop_assistant_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.shop_assistant_threads(id) on delete cascade,
  shop_id uuid not null,
  user_id uuid,
  role text not null,
  kind text not null default 'text',
  content text not null default '',
  payload jsonb not null default '{}'::jsonb,
  client_message_id text,
  created_at timestamptz not null default now(),
  constraint shop_assistant_messages_role_chk
    check (role = any (array['user'::text, 'assistant'::text, 'system'::text, 'tool'::text])),
  constraint shop_assistant_messages_kind_chk
    check (kind = any (array['text'::text, 'confirmation'::text, 'action_result'::text, 'error'::text, 'state_update'::text])),
  constraint shop_assistant_messages_content_size_chk
    check (length(content) <= 16000)
);

create unique index if not exists shop_assistant_messages_client_id_uidx
  on public.shop_assistant_messages (thread_id, client_message_id)
  where client_message_id is not null;

create index if not exists shop_assistant_messages_thread_created_idx
  on public.shop_assistant_messages (thread_id, created_at, id);

create table if not exists public.shop_assistant_actions (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.shop_assistant_threads(id) on delete cascade,
  shop_id uuid not null,
  requested_by uuid not null,
  confirmed_by uuid,
  tool_name text not null,
  domain text not null,
  risk text not null,
  status text not null default 'pending_confirmation',
  input jsonb not null default '{}'::jsonb,
  preview jsonb not null default '{}'::jsonb,
  result jsonb,
  error jsonb,
  idempotency_key text not null,
  target_versions jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null,
  confirmed_at timestamptz,
  execution_started_at timestamptz,
  execution_finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shop_assistant_actions_tool_not_blank_chk
    check (length(btrim(tool_name)) > 0),
  constraint shop_assistant_actions_domain_not_blank_chk
    check (length(btrim(domain)) > 0),
  constraint shop_assistant_actions_risk_chk
    check (risk = any (array['low'::text, 'medium'::text, 'high'::text])),
  constraint shop_assistant_actions_status_chk
    check (status = any (array[
      'pending_confirmation'::text,
      'confirmed'::text,
      'executing'::text,
      'succeeded'::text,
      'failed'::text,
      'cancelled'::text,
      'expired'::text
    ])),
  constraint shop_assistant_actions_idempotency_not_blank_chk
    check (length(btrim(idempotency_key)) > 0)
);

create unique index if not exists shop_assistant_actions_idempotency_uidx
  on public.shop_assistant_actions (shop_id, idempotency_key);

create index if not exists shop_assistant_actions_status_recent_idx
  on public.shop_assistant_actions (shop_id, status, created_at desc);

create or replace function public.shop_assistant_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.shop_assistant_validate_message_thread()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_shop_id uuid;
  v_user_id uuid;
begin
  select t.shop_id, t.user_id
    into v_shop_id, v_user_id
  from public.shop_assistant_threads t
  where t.id = new.thread_id;

  if v_shop_id is null then
    raise exception 'Shop assistant thread not found';
  end if;

  if new.shop_id is distinct from v_shop_id then
    raise exception 'Message shop does not match thread shop';
  end if;

  if new.role = 'user' and new.user_id is distinct from v_user_id then
    raise exception 'User message actor does not match thread owner';
  end if;

  return new;
end;
$$;

create or replace function public.shop_assistant_validate_action_thread()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_shop_id uuid;
  v_user_id uuid;
begin
  select t.shop_id, t.user_id
    into v_shop_id, v_user_id
  from public.shop_assistant_threads t
  where t.id = new.thread_id;

  if v_shop_id is null then
    raise exception 'Shop assistant thread not found';
  end if;

  if new.shop_id is distinct from v_shop_id then
    raise exception 'Action shop does not match thread shop';
  end if;

  if new.requested_by is distinct from v_user_id then
    raise exception 'Action requester does not match thread owner';
  end if;

  return new;
end;
$$;

create or replace function public.shop_assistant_guard_terminal_action()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = any (array['succeeded'::text, 'failed'::text, 'cancelled'::text, 'expired'::text])
     and new.status is distinct from old.status then
    raise exception 'Terminal shop assistant actions cannot transition';
  end if;
  return new;
end;
$$;

create or replace function public.shop_assistant_touch_thread_after_message()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.shop_assistant_threads
  set last_message_at = greatest(last_message_at, new.created_at),
      updated_at = now()
  where id = new.thread_id;
  return new;
end;
$$;

drop trigger if exists shop_assistant_threads_set_updated_at on public.shop_assistant_threads;
create trigger shop_assistant_threads_set_updated_at
before update on public.shop_assistant_threads
for each row execute function public.shop_assistant_set_updated_at();

drop trigger if exists shop_assistant_actions_set_updated_at on public.shop_assistant_actions;
create trigger shop_assistant_actions_set_updated_at
before update on public.shop_assistant_actions
for each row execute function public.shop_assistant_set_updated_at();

drop trigger if exists shop_assistant_messages_validate_thread on public.shop_assistant_messages;
create trigger shop_assistant_messages_validate_thread
before insert or update on public.shop_assistant_messages
for each row execute function public.shop_assistant_validate_message_thread();

drop trigger if exists shop_assistant_actions_validate_thread on public.shop_assistant_actions;
create trigger shop_assistant_actions_validate_thread
before insert or update on public.shop_assistant_actions
for each row execute function public.shop_assistant_validate_action_thread();

drop trigger if exists shop_assistant_actions_guard_terminal on public.shop_assistant_actions;
create trigger shop_assistant_actions_guard_terminal
before update on public.shop_assistant_actions
for each row execute function public.shop_assistant_guard_terminal_action();

drop trigger if exists shop_assistant_messages_touch_thread on public.shop_assistant_messages;
create trigger shop_assistant_messages_touch_thread
after insert on public.shop_assistant_messages
for each row execute function public.shop_assistant_touch_thread_after_message();

alter table public.shop_assistant_threads enable row level security;
alter table public.shop_assistant_messages enable row level security;
alter table public.shop_assistant_actions enable row level security;

drop policy if exists shop_assistant_threads_owner_select on public.shop_assistant_threads;
create policy shop_assistant_threads_owner_select
on public.shop_assistant_threads
for select
to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.shop_id = shop_assistant_threads.shop_id
      and lower(coalesce(p.role, '')) not in ('customer', 'driver', 'mechanic')
  )
);

drop policy if exists shop_assistant_threads_owner_insert on public.shop_assistant_threads;
create policy shop_assistant_threads_owner_insert
on public.shop_assistant_threads
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.shop_id = shop_assistant_threads.shop_id
      and lower(coalesce(p.role, '')) not in ('customer', 'driver', 'mechanic')
  )
);

drop policy if exists shop_assistant_threads_owner_update on public.shop_assistant_threads;
create policy shop_assistant_threads_owner_update
on public.shop_assistant_threads
for update
to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.shop_id = shop_assistant_threads.shop_id
  )
);

drop policy if exists shop_assistant_messages_thread_owner_select on public.shop_assistant_messages;
create policy shop_assistant_messages_thread_owner_select
on public.shop_assistant_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.shop_assistant_threads t
    where t.id = shop_assistant_messages.thread_id
      and t.shop_id = shop_assistant_messages.shop_id
      and t.user_id = auth.uid()
  )
);

drop policy if exists shop_assistant_messages_thread_owner_insert on public.shop_assistant_messages;
create policy shop_assistant_messages_thread_owner_insert
on public.shop_assistant_messages
for insert
to authenticated
with check (
  (user_id is null or user_id = auth.uid())
  and exists (
    select 1
    from public.shop_assistant_threads t
    where t.id = shop_assistant_messages.thread_id
      and t.shop_id = shop_assistant_messages.shop_id
      and t.user_id = auth.uid()
  )
);

drop policy if exists shop_assistant_actions_actor_select on public.shop_assistant_actions;
create policy shop_assistant_actions_actor_select
on public.shop_assistant_actions
for select
to authenticated
using (
  requested_by = auth.uid()
  or exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.shop_id = shop_assistant_actions.shop_id
      and lower(coalesce(p.role, '')) = any (array['owner'::text, 'admin'::text, 'manager'::text])
  )
);

drop policy if exists shop_assistant_actions_actor_insert on public.shop_assistant_actions;
create policy shop_assistant_actions_actor_insert
on public.shop_assistant_actions
for insert
to authenticated
with check (
  requested_by = auth.uid()
  and exists (
    select 1
    from public.shop_assistant_threads t
    where t.id = shop_assistant_actions.thread_id
      and t.shop_id = shop_assistant_actions.shop_id
      and t.user_id = auth.uid()
  )
);

drop policy if exists shop_assistant_actions_actor_update on public.shop_assistant_actions;
create policy shop_assistant_actions_actor_update
on public.shop_assistant_actions
for update
to authenticated
using (
  requested_by = auth.uid()
  or exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.shop_id = shop_assistant_actions.shop_id
      and lower(coalesce(p.role, '')) = any (array['owner'::text, 'admin'::text, 'manager'::text])
  )
)
with check (
  requested_by = auth.uid()
  or exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.shop_id = shop_assistant_actions.shop_id
      and lower(coalesce(p.role, '')) = any (array['owner'::text, 'admin'::text, 'manager'::text])
  )
);

grant select, insert, update on public.shop_assistant_threads to authenticated;
grant select, insert on public.shop_assistant_messages to authenticated;
grant select, insert, update on public.shop_assistant_actions to authenticated;
