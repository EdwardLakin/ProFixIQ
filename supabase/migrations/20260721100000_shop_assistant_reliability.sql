begin;

create table if not exists public.assistant_conversations (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  context jsonb not null default '{}'::jsonb,
  last_intent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists assistant_conversations_user_activity_idx
  on public.assistant_conversations(user_id, updated_at desc);
create index if not exists assistant_conversations_shop_activity_idx
  on public.assistant_conversations(shop_id, updated_at desc);

create table if not exists public.assistant_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.assistant_conversations(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (length(trim(content)) > 0),
  payload jsonb not null default '{}'::jsonb,
  message_key text not null,
  created_at timestamptz not null default now(),
  unique (conversation_id, message_key)
);

create index if not exists assistant_messages_conversation_activity_idx
  on public.assistant_messages(conversation_id, created_at asc);
create index if not exists assistant_messages_shop_activity_idx
  on public.assistant_messages(shop_id, created_at desc);

create table if not exists public.assistant_action_requests (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.assistant_conversations(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  confirmed_by uuid references auth.users(id) on delete set null,
  tool_name text not null check (length(trim(tool_name)) > 0),
  domain text not null check (length(trim(domain)) > 0),
  label text not null check (length(trim(label)) > 0),
  summary text not null check (length(trim(summary)) > 0),
  risk_level text not null default 'medium' check (risk_level in ('low', 'medium', 'high')),
  input jsonb not null default '{}'::jsonb,
  result jsonb,
  error_message text,
  status text not null default 'pending' check (
    status in ('pending', 'executing', 'succeeded', 'failed', 'cancelled', 'expired')
  ),
  idempotency_key text not null,
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  confirmed_at timestamptz,
  executed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, idempotency_key)
);

create index if not exists assistant_action_requests_pending_idx
  on public.assistant_action_requests(shop_id, requested_by, status, expires_at);
create index if not exists assistant_action_requests_conversation_idx
  on public.assistant_action_requests(conversation_id, created_at desc);

create or replace function public.touch_shop_assistant_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists assistant_conversations_touch_updated_at on public.assistant_conversations;
create trigger assistant_conversations_touch_updated_at
before update on public.assistant_conversations
for each row execute function public.touch_shop_assistant_updated_at();

drop trigger if exists assistant_action_requests_touch_updated_at on public.assistant_action_requests;
create trigger assistant_action_requests_touch_updated_at
before update on public.assistant_action_requests
for each row execute function public.touch_shop_assistant_updated_at();

alter table public.assistant_conversations enable row level security;
alter table public.assistant_messages enable row level security;
alter table public.assistant_action_requests enable row level security;

drop policy if exists assistant_conversations_owner_select on public.assistant_conversations;
create policy assistant_conversations_owner_select
  on public.assistant_conversations for select to authenticated
  using (user_id = auth.uid() and shop_id = public.current_shop_id());

drop policy if exists assistant_conversations_owner_insert on public.assistant_conversations;
create policy assistant_conversations_owner_insert
  on public.assistant_conversations for insert to authenticated
  with check (user_id = auth.uid() and shop_id = public.current_shop_id());

drop policy if exists assistant_conversations_owner_update on public.assistant_conversations;
create policy assistant_conversations_owner_update
  on public.assistant_conversations for update to authenticated
  using (user_id = auth.uid() and shop_id = public.current_shop_id())
  with check (user_id = auth.uid() and shop_id = public.current_shop_id());

drop policy if exists assistant_conversations_owner_delete on public.assistant_conversations;
create policy assistant_conversations_owner_delete
  on public.assistant_conversations for delete to authenticated
  using (user_id = auth.uid() and shop_id = public.current_shop_id());

drop policy if exists assistant_messages_owner_select on public.assistant_messages;
create policy assistant_messages_owner_select
  on public.assistant_messages for select to authenticated
  using (user_id = auth.uid() and shop_id = public.current_shop_id());

drop policy if exists assistant_messages_owner_insert on public.assistant_messages;
create policy assistant_messages_owner_insert
  on public.assistant_messages for insert to authenticated
  with check (
    user_id = auth.uid()
    and shop_id = public.current_shop_id()
    and exists (
      select 1
      from public.assistant_conversations conversation
      where conversation.id = conversation_id
        and conversation.user_id = auth.uid()
        and conversation.shop_id = assistant_messages.shop_id
    )
  );

drop policy if exists assistant_action_requests_owner_select on public.assistant_action_requests;
create policy assistant_action_requests_owner_select
  on public.assistant_action_requests for select to authenticated
  using (requested_by = auth.uid() and shop_id = public.current_shop_id());

drop policy if exists assistant_action_requests_owner_insert on public.assistant_action_requests;
create policy assistant_action_requests_owner_insert
  on public.assistant_action_requests for insert to authenticated
  with check (
    requested_by = auth.uid()
    and shop_id = public.current_shop_id()
    and exists (
      select 1
      from public.assistant_conversations conversation
      where conversation.id = conversation_id
        and conversation.user_id = auth.uid()
        and conversation.shop_id = assistant_action_requests.shop_id
    )
  );

drop policy if exists assistant_action_requests_owner_update on public.assistant_action_requests;
create policy assistant_action_requests_owner_update
  on public.assistant_action_requests for update to authenticated
  using (requested_by = auth.uid() and shop_id = public.current_shop_id())
  with check (requested_by = auth.uid() and shop_id = public.current_shop_id());

revoke all on table public.assistant_conversations from anon;
revoke all on table public.assistant_messages from anon;
revoke all on table public.assistant_action_requests from anon;

grant select, insert, update, delete on table public.assistant_conversations to authenticated;
grant select, insert on table public.assistant_messages to authenticated;
grant select, insert, update on table public.assistant_action_requests to authenticated;
grant all on table public.assistant_conversations to service_role;
grant all on table public.assistant_messages to service_role;
grant all on table public.assistant_action_requests to service_role;

create or replace function public.assistant_set_work_order_hold(
  p_shop_id uuid,
  p_actor_profile_id uuid,
  p_work_order_reference text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.profiles%rowtype;
  v_work_order public.work_orders%rowtype;
  v_reference text;
  v_reason text;
  v_line_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_actor
  from public.profiles profile
  where profile.id = p_actor_profile_id
    and profile.shop_id = p_shop_id
    and (profile.id = auth.uid() or profile.user_id = auth.uid());

  if not found then
    raise exception 'Profile is not authorized for this shop';
  end if;

  if coalesce(v_actor.role, '') not in (
    'owner', 'admin', 'manager', 'advisor', 'service', 'lead_hand', 'foreman'
  ) then
    raise exception 'Forbidden';
  end if;

  v_reference := upper(
    regexp_replace(trim(coalesce(p_work_order_reference, '')), '^(WO[[:space:]]*#?|#)[[:space:]]*', '', 'i')
  );
  v_reason := nullif(trim(coalesce(p_reason, '')), '');

  if v_reference = '' then
    raise exception 'Work order reference is required';
  end if;
  if v_reason is null then
    raise exception 'Hold reason is required';
  end if;

  select * into v_work_order
  from public.work_orders work_order
  where work_order.shop_id = p_shop_id
    and (
      work_order.id::text = trim(p_work_order_reference)
      or upper(coalesce(work_order.custom_id, '')) = v_reference
    )
  limit 1
  for update;

  if not found then
    raise exception 'Work order not found in this shop';
  end if;

  if lower(coalesce(v_work_order.status, '')) in (
    'completed', 'ready_to_invoice', 'invoiced', 'cancelled', 'canceled', 'void', 'closed'
  ) then
    raise exception 'Completed or closed work orders cannot be placed on hold';
  end if;

  if exists (
    select 1
    from public.work_order_line_labor_segments segment
    join public.work_order_lines line on line.id = segment.work_order_line_id
    where line.shop_id = p_shop_id
      and line.work_order_id = v_work_order.id
      and segment.ended_at is null
  ) then
    raise exception 'Stop active technician labor before placing this work order on hold';
  end if;

  update public.work_order_lines line
  set status = 'on_hold',
      hold_reason = v_reason,
      on_hold_since = coalesce(line.on_hold_since, now()),
      updated_at = now()
  where line.shop_id = p_shop_id
    and line.work_order_id = v_work_order.id
    and line.voided_at is null
    and lower(coalesce(line.status, '')) not in (
      'completed', 'ready_to_invoice', 'invoiced', 'cancelled', 'canceled', 'void', 'declined'
    );

  get diagnostics v_line_count = row_count;

  update public.work_orders
  set status = 'on_hold',
      updated_at = now()
  where id = v_work_order.id
    and shop_id = p_shop_id;

  insert into public.audit_logs (
    shop_id, actor_id, action, target_table, target_id, metadata
  ) values (
    p_shop_id,
    v_actor.id,
    'assistant.work_order.hold',
    'work_orders',
    v_work_order.id,
    jsonb_build_object(
      'work_order_reference', coalesce(v_work_order.custom_id, v_work_order.id::text),
      'reason', v_reason,
      'line_count', v_line_count,
      'source', 'shop_assistant'
    )
  );

  return jsonb_build_object(
    'ok', true,
    'work_order_id', v_work_order.id,
    'work_order_reference', coalesce(v_work_order.custom_id, v_work_order.id::text),
    'status', 'on_hold',
    'reason', v_reason,
    'affected_line_count', v_line_count
  );
end;
$$;

revoke all on function public.assistant_set_work_order_hold(uuid, uuid, text, text) from public, anon;
grant execute on function public.assistant_set_work_order_hold(uuid, uuid, text, text) to authenticated, service_role;

commit;
