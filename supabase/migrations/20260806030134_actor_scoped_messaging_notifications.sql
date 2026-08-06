begin;

-- A user can act as both a portal customer and a shop team member. Keep the
-- authenticated user for delivery, but make the participant row the canonical
-- actor identity for messages and reads.
alter table public.conversation_participants
  add column if not exists profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists customer_id uuid references public.customers(id) on delete set null;

update public.conversation_participants cp
set profile_id = (
  select p.id
  from public.profiles p
  join public.conversations c on c.id = cp.conversation_id
  where cp.participant_kind = 'staff'
    and (p.user_id = cp.user_id or p.id = cp.user_id)
    and (c.shop_id is null or p.shop_id = c.shop_id)
  order by case when p.user_id = cp.user_id then 0 else 1 end
  limit 1
)
where cp.participant_kind = 'staff'
  and cp.profile_id is null;

update public.conversation_participants cp
set customer_id = (
  select customer.id
  from public.customers customer
  join public.conversations c on c.id = cp.conversation_id
  where cp.participant_kind = 'customer'
    and customer.user_id = cp.user_id
    and (c.shop_id is null or customer.shop_id = c.shop_id)
    and (c.customer_id is null or customer.id = c.customer_id)
  order by case when customer.id = c.customer_id then 0 else 1 end
  limit 1
)
where cp.participant_kind = 'customer'
  and cp.customer_id is null;

drop index if exists public.uq_conversation_participants_conversation_user;
alter table public.conversation_participants
  drop constraint if exists conversation_participants_conversation_id_user_id_key;

create unique index if not exists conversation_participants_actor_identity_uidx
  on public.conversation_participants (conversation_id, user_id, participant_kind);

create unique index if not exists conversation_participants_id_conversation_uidx
  on public.conversation_participants (id, conversation_id);

-- Preserve the shop identity in historical customer threads when the customer
-- login was also the advisor assigned to that work order.
insert into public.conversation_participants (
  conversation_id,
  user_id,
  role,
  participant_kind,
  profile_id
)
select distinct
  c.id,
  coalesce(advisor.user_id, advisor.id),
  advisor.role,
  'staff',
  advisor.id
from public.conversations c
join public.work_orders wo on wo.id = c.work_order_id
join public.profiles advisor on advisor.id = wo.advisor_id
join public.conversation_participants customer_actor
  on customer_actor.conversation_id = c.id
 and customer_actor.participant_kind = 'customer'
 and customer_actor.user_id = coalesce(advisor.user_id, advisor.id)
where c.channel = 'customer'
on conflict (conversation_id, user_id, participant_kind) do update
set profile_id = excluded.profile_id,
    role = coalesce(excluded.role, public.conversation_participants.role);

alter table public.messages
  add column if not exists sender_participant_id uuid,
  add column if not exists sender_kind text;

alter table public.messages
  drop constraint if exists messages_sender_kind_check;
alter table public.messages
  add constraint messages_sender_kind_check
  check (sender_kind is null or sender_kind in ('staff', 'customer')) not valid;

with ranked_actor as (
  select
    m.id as message_id,
    cp.id as participant_id,
    cp.participant_kind,
    row_number() over (
      partition by m.id
      order by
        case
          when m.metadata ->> 'actor_kind' = cp.participant_kind then 0
          when coalesce(m.metadata ->> 'deep_link', '') <> ''
            and m.metadata ->> 'deep_link' not like '/portal/%'
            and cp.participant_kind = 'staff' then 1
          when c.channel = 'customer'
            and coalesce(m.metadata ->> 'deep_link', '') = ''
            and cp.participant_kind = 'customer' then 2
          when cp.participant_kind = 'staff' then 3
          else 4
        end,
        cp.added_at,
        cp.id
    ) as rank
  from public.messages m
  join public.conversations c on c.id = m.conversation_id
  join public.conversation_participants cp
    on cp.conversation_id = m.conversation_id
   and cp.user_id = m.sender_id
  where m.conversation_id is not null
    and m.sender_id is not null
)
update public.messages m
set sender_participant_id = ranked_actor.participant_id,
    sender_kind = ranked_actor.participant_kind,
    metadata = coalesce(m.metadata, '{}'::jsonb)
      || jsonb_build_object('actor_kind', ranked_actor.participant_kind)
from ranked_actor
where ranked_actor.message_id = m.id
  and ranked_actor.rank = 1
  and m.sender_participant_id is null;

alter table public.messages
  drop constraint if exists messages_sender_participant_conversation_fkey;
alter table public.messages
  add constraint messages_sender_participant_conversation_fkey
  foreign key (sender_participant_id, conversation_id)
  references public.conversation_participants(id, conversation_id)
  on delete restrict not valid;

drop index if exists public.messages_client_idempotency_idx;
create unique index messages_actor_client_idempotency_idx
  on public.messages (conversation_id, sender_participant_id, client_message_id)
  where client_message_id is not null;

create or replace function public.resolve_message_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_participant public.conversation_participants%rowtype;
  v_requested_kind text;
begin
  if new.conversation_id is null then
    return new;
  end if;

  v_requested_kind := nullif(coalesce(new.metadata, '{}'::jsonb) ->> 'actor_kind', '');

  if new.sender_participant_id is not null then
    select * into v_participant
    from public.conversation_participants cp
    where cp.id = new.sender_participant_id
      and cp.conversation_id = new.conversation_id;
  else
    select * into v_participant
    from public.conversation_participants cp
    where cp.conversation_id = new.conversation_id
      and cp.user_id = new.sender_id
      and (v_requested_kind is null or cp.participant_kind = v_requested_kind)
    order by
      case when cp.participant_kind = v_requested_kind then 0 else 1 end,
      case when cp.participant_kind = 'staff' then 0 else 1 end,
      cp.added_at,
      cp.id
    limit 1;
  end if;

  if v_participant.id is null then
    raise exception using errcode = '42501',
      message = 'Message sender is not an actor in this conversation';
  end if;

  if new.sender_id is not null and new.sender_id <> v_participant.user_id then
    raise exception using errcode = '42501',
      message = 'Message sender does not match the selected actor';
  end if;

  new.sender_id := v_participant.user_id;
  new.sender_participant_id := v_participant.id;
  new.sender_kind := v_participant.participant_kind;
  new.metadata := coalesce(new.metadata, '{}'::jsonb)
    || jsonb_build_object('actor_kind', v_participant.participant_kind);
  return new;
end;
$$;

revoke all on function public.resolve_message_actor() from public, anon, authenticated;

drop trigger if exists messages_resolve_actor on public.messages;
create trigger messages_resolve_actor
before insert or update of sender_id, sender_participant_id, conversation_id, metadata
on public.messages
for each row execute function public.resolve_message_actor();

alter table public.message_reads
  add column if not exists participant_id uuid;

update public.message_reads mr
set participant_id = (
  select cp.id
  from public.conversation_participants cp
  join public.conversations c on c.id = cp.conversation_id
  where cp.conversation_id = mr.conversation_id
    and cp.user_id = mr.user_id
  order by
    case when c.channel = 'customer' and cp.participant_kind = 'customer' then 0 else 1 end,
    cp.added_at,
    cp.id
  limit 1
)
where mr.participant_id is null;

alter table public.message_reads
  drop constraint if exists message_reads_user_id_conversation_id_key;
alter table public.message_reads
  drop constraint if exists message_reads_participant_conversation_fkey;
alter table public.message_reads
  add constraint message_reads_participant_conversation_fkey
  foreign key (participant_id, conversation_id)
  references public.conversation_participants(id, conversation_id)
  on delete cascade not valid;

create unique index if not exists message_reads_actor_uidx
  on public.message_reads (conversation_id, participant_id);
create unique index if not exists message_reads_legacy_user_uidx
  on public.message_reads (conversation_id, user_id)
  where participant_id is null;

create table if not exists public.message_deliveries (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  recipient_participant_id uuid not null,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  delivered_at timestamptz not null default now(),
  read_at timestamptz,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  constraint message_deliveries_recipient_conversation_fkey
    foreign key (recipient_participant_id, conversation_id)
    references public.conversation_participants(id, conversation_id)
    on delete cascade,
  constraint message_deliveries_message_actor_uidx
    unique (message_id, recipient_participant_id)
);

create index if not exists message_deliveries_actor_unread_idx
  on public.message_deliveries (recipient_participant_id, delivered_at desc)
  where read_at is null;
create index if not exists message_deliveries_user_conversation_idx
  on public.message_deliveries (recipient_user_id, conversation_id, delivered_at desc);

insert into public.message_deliveries (
  message_id,
  conversation_id,
  recipient_participant_id,
  recipient_user_id,
  delivered_at,
  read_at
)
select
  m.id,
  m.conversation_id,
  cp.id,
  cp.user_id,
  coalesce(m.sent_at, m.created_at, now()),
  case
    when exists (
      select 1
      from public.message_reads mr
      where mr.conversation_id = m.conversation_id
        and (mr.participant_id = cp.id or (mr.participant_id is null and mr.user_id = cp.user_id))
        and mr.last_read_at >= coalesce(m.sent_at, m.created_at, now())
    ) then coalesce(m.sent_at, m.created_at, now())
    else null
  end
from public.messages m
join public.conversation_participants cp
  on cp.conversation_id = m.conversation_id
 and cp.id is distinct from m.sender_participant_id
join auth.users recipient_user on recipient_user.id = cp.user_id
where m.conversation_id is not null
on conflict (message_id, recipient_participant_id) do nothing;

alter table public.portal_notifications
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists conversation_id uuid references public.conversations(id) on delete set null,
  add column if not exists message_id uuid references public.messages(id) on delete set null;

update public.portal_notifications
set metadata = '{}'
where metadata is null;

alter table public.portal_notifications
  drop constraint if exists portal_notifications_kind_check;
drop index if exists public.portal_notifications_user_wo_kind_uniq;

create index if not exists portal_notifications_conversation_created_idx
  on public.portal_notifications (conversation_id, created_at desc)
  where conversation_id is not null;

create or replace function public.deliver_chat_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.conversation_id is null or new.sender_participant_id is null then
    return new;
  end if;

  insert into public.message_deliveries (
    message_id,
    conversation_id,
    recipient_participant_id,
    recipient_user_id
  )
  select new.id, new.conversation_id, cp.id, cp.user_id
  from public.conversation_participants cp
  join auth.users recipient_user on recipient_user.id = cp.user_id
  where cp.conversation_id = new.conversation_id
    and cp.id <> new.sender_participant_id
  on conflict (message_id, recipient_participant_id) do nothing;

  insert into public.portal_notifications (
    user_id,
    customer_id,
    work_order_id,
    kind,
    title,
    body,
    metadata,
    event_key,
    conversation_id,
    message_id
  )
  select
    recipient.user_id,
    coalesce(recipient.customer_id, c.customer_id),
    c.work_order_id,
    'message_received',
    'New message from your shop',
    left(new.content, 240),
    jsonb_build_object(
      'href', '/portal/messages?conversationId=' || new.conversation_id::text,
      'conversation_id', new.conversation_id,
      'message_id', new.id
    ),
    'message_received:' || new.id::text || ':' || recipient.id::text,
    new.conversation_id,
    new.id
  from public.conversation_participants recipient
  join public.conversations c on c.id = recipient.conversation_id
  where recipient.conversation_id = new.conversation_id
    and recipient.id <> new.sender_participant_id
    and recipient.participant_kind = 'customer'
    and (coalesce(recipient.customer_id, c.customer_id) is not null or c.work_order_id is not null)
  on conflict (user_id, event_key) do nothing;

  update public.message_deliveries delivery
  set notified_at = coalesce(delivery.notified_at, now())
  from public.conversation_participants recipient
  where delivery.message_id = new.id
    and delivery.recipient_participant_id = recipient.id
    and recipient.participant_kind = 'customer';

  return new;
end;
$$;

revoke all on function public.deliver_chat_message() from public, anon, authenticated;

drop trigger if exists messages_deliver_actor_notifications on public.messages;
create trigger messages_deliver_actor_notifications
after insert on public.messages
for each row execute function public.deliver_chat_message();

create or replace function public.create_actor_messaging_conversation(
  _conversation_id uuid,
  _created_by uuid,
  _shop_id uuid,
  _channel text,
  _customer_id uuid,
  _work_order_id uuid,
  _vehicle_id uuid,
  _booking_id uuid,
  _context_type text,
  _context_id uuid,
  _title text,
  _participants jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_participant_count integer;
begin
  if jsonb_typeof(_participants) <> 'array' then
    raise exception 'Participants must be a JSON array';
  end if;

  v_participant_count := jsonb_array_length(_participants);
  if v_participant_count < 2 then
    raise exception 'A conversation requires at least two actor identities';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(_participants)
      as participant(user_id uuid, participant_kind text, profile_id uuid, customer_id uuid, role text)
    where participant.user_id is null
      or participant.participant_kind not in ('staff', 'customer')
      or (participant.participant_kind = 'staff' and participant.profile_id is null)
      or (participant.participant_kind = 'customer' and participant.customer_id is null)
  ) then
    raise exception 'Each participant requires a user, kind, and matching actor anchor';
  end if;

  insert into public.conversations (
    id, created_by, shop_id, channel, customer_id, work_order_id,
    vehicle_id, booking_id, context_type, context_id, title, is_group
  ) values (
    _conversation_id, _created_by, _shop_id, _channel, _customer_id,
    _work_order_id, _vehicle_id, _booking_id, _context_type, _context_id,
    nullif(trim(_title), ''), v_participant_count > 2
  );

  insert into public.conversation_participants (
    conversation_id, user_id, role, participant_kind, profile_id, customer_id
  )
  select
    _conversation_id,
    participant.user_id,
    participant.role,
    participant.participant_kind,
    participant.profile_id,
    participant.customer_id
  from jsonb_to_recordset(_participants)
    as participant(user_id uuid, participant_kind text, profile_id uuid, customer_id uuid, role text);

  return _conversation_id;
end;
$$;

revoke all on function public.create_actor_messaging_conversation(
  uuid, uuid, uuid, text, uuid, uuid, uuid, uuid, text, uuid, text, jsonb
) from public, anon, authenticated;
grant execute on function public.create_actor_messaging_conversation(
  uuid, uuid, uuid, text, uuid, uuid, uuid, uuid, text, uuid, text, jsonb
) to service_role;

revoke all on function public.create_messaging_conversation(
  uuid, uuid, uuid, text, uuid, uuid, uuid, uuid, text, uuid, text, uuid[], text[]
) from public, anon, authenticated;

-- Canonical private Broadcast topic for message INSERT/UPDATE/DELETE events.
create or replace function public.broadcast_chat_messages()
returns trigger
language plpgsql
security definer
set search_path = public, realtime
as $$
declare
  v_conversation_id uuid := coalesce(new.conversation_id, old.conversation_id);
begin
  if v_conversation_id is null then
    return coalesce(new, old);
  end if;

  perform realtime.broadcast_changes(
    'room:' || v_conversation_id::text || ':messages',
    tg_op,
    tg_op,
    tg_table_name,
    tg_table_schema,
    new,
    old
  );
  return coalesce(new, old);
end;
$$;

revoke all on function public.broadcast_chat_messages() from public, anon, authenticated;
drop trigger if exists messages_broadcast_trigger on public.messages;
drop trigger if exists broadcast_chat_messages_trigger on public.messages;
create trigger broadcast_chat_messages_trigger
after insert or update or delete on public.messages
for each row execute function public.broadcast_chat_messages();

create or replace function public.realtime_conversation_id(topic text)
returns uuid
language sql
immutable
set search_path = public
as $$
  select case
    when topic ~ '^room:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}:messages$'
      then split_part(topic, ':', 2)::uuid
    else null
  end
$$;

revoke all on function public.realtime_conversation_id(text) from public, anon;
grant execute on function public.realtime_conversation_id(text) to authenticated, service_role;

alter table public.message_deliveries enable row level security;

drop policy if exists message_deliveries_recipient_select on public.message_deliveries;
create policy message_deliveries_recipient_select
  on public.message_deliveries for select to authenticated
  using (
    recipient_user_id = auth.uid()
    and public.can_access_conversation(conversation_id, auth.uid())
  );

drop policy if exists message_deliveries_recipient_update on public.message_deliveries;
create policy message_deliveries_recipient_update
  on public.message_deliveries for update to authenticated
  using (
    recipient_user_id = auth.uid()
    and public.can_access_conversation(conversation_id, auth.uid())
  )
  with check (
    recipient_user_id = auth.uid()
    and public.can_access_conversation(conversation_id, auth.uid())
  );

drop policy if exists messages_delete_for_conversation on public.messages;
drop policy if exists messages_insert_for_conversation on public.messages;
drop policy if exists messages_update_for_conversation on public.messages;
drop policy if exists messages_select_for_conversation on public.messages;

drop policy if exists conversations_actor_insert on public.conversations;
drop policy if exists conversations_insert_self on public.conversations;
drop policy if exists conversations_select_mine_or_participant on public.conversations;

drop policy if exists conversation_participants_creator_delete on public.conversation_participants;
drop policy if exists conversation_participants_creator_insert on public.conversation_participants;
drop policy if exists conversation_participants_creator_update on public.conversation_participants;
drop policy if exists cp_select_for_my_conversations on public.conversation_participants;
drop policy if exists cp_select_own on public.conversation_participants;

drop policy if exists "portal user can mark own notifications read" on public.portal_notifications;
drop policy if exists "portal user can view own notifications" on public.portal_notifications;
drop policy if exists "service_role can manage portal_notifications" on public.portal_notifications;
drop policy if exists portal_notifications_user_select on public.portal_notifications;
drop policy if exists portal_notifications_user_update on public.portal_notifications;

create policy portal_notifications_user_select
  on public.portal_notifications for select to authenticated
  using (user_id = auth.uid());
create policy portal_notifications_user_update
  on public.portal_notifications for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists chat_realtime_insert on realtime.messages;
drop policy if exists chat_realtime_select on realtime.messages;
drop policy if exists conversation_members_can_read on realtime.messages;
drop policy if exists conversation_members_can_write on realtime.messages;

create policy chat_realtime_select
  on realtime.messages for select to authenticated
  using (
    public.can_access_conversation(
      public.realtime_conversation_id(topic),
      auth.uid()
    )
  );
create policy chat_realtime_insert
  on realtime.messages for insert to authenticated
  with check (
    public.can_access_conversation(
      public.realtime_conversation_id(topic),
      auth.uid()
    )
  );

revoke all on table public.message_deliveries from anon, authenticated;
grant select, update on table public.message_deliveries to authenticated;
grant all on table public.message_deliveries to service_role;

revoke insert, delete on table public.portal_notifications from authenticated;
grant select, update on table public.portal_notifications to authenticated;
grant all on table public.portal_notifications to service_role;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'portal_notifications'
  ) then
    alter publication supabase_realtime add table public.portal_notifications;
  end if;
end;
$$;

commit;
