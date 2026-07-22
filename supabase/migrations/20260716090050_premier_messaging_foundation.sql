begin;

-- Retire the legacy chats/chat_id write path. Historical rows stay intact, but
-- all new product traffic uses conversations/conversation_id.
do $$
begin
  if to_regprocedure('public.chat_post_message(uuid[],text,uuid)') is not null then
    execute 'revoke all on function public.chat_post_message(uuid[], text, uuid) from public, anon, authenticated';
  end if;
end;
$$;

-- Give every conversation a durable tenant and business-context anchor. Existing
-- rows remain readable while shop_id is backfilled from their creator.
alter table public.conversations
  add column if not exists shop_id uuid references public.shops(id) on delete cascade,
  add column if not exists channel text not null default 'internal',
  add column if not exists customer_id uuid references public.customers(id) on delete set null,
  add column if not exists work_order_id uuid references public.work_orders(id) on delete set null,
  add column if not exists vehicle_id uuid references public.vehicles(id) on delete set null,
  add column if not exists booking_id uuid references public.bookings(id) on delete set null,
  add column if not exists last_message_at timestamptz,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists archived_at timestamptz;

update public.conversations c
set shop_id = (
  select p.shop_id
  from public.profiles p
  where p.shop_id is not null
    and (p.user_id = c.created_by or p.id = c.created_by)
  order by case when p.user_id = c.created_by then 0 else 1 end
  limit 1
)
where c.shop_id is null
  and exists (
    select 1
    from public.profiles p
    where p.shop_id is not null
      and (p.user_id = c.created_by or p.id = c.created_by)
  );

alter table public.conversations
  drop constraint if exists conversations_channel_check;

alter table public.conversations
  add constraint conversations_channel_check
  check (channel in ('internal', 'customer')) not valid;

alter table public.conversation_participants
  add column if not exists participant_kind text not null default 'staff';

alter table public.conversation_participants
  drop constraint if exists conversation_participants_kind_check;

alter table public.conversation_participants
  add constraint conversation_participants_kind_check
  check (participant_kind in ('staff', 'customer')) not valid;

-- Client message IDs make retries safe without changing historical message IDs.
alter table public.messages
  add column if not exists client_message_id uuid;

create unique index if not exists messages_client_idempotency_idx
  on public.messages (conversation_id, sender_id, client_message_id)
  where client_message_id is not null;

create index if not exists conversations_shop_channel_activity_idx
  on public.conversations (shop_id, channel, last_message_at desc nulls last, created_at desc);

create index if not exists conversations_work_order_idx
  on public.conversations (work_order_id)
  where work_order_id is not null;

create index if not exists conversations_customer_idx
  on public.conversations (customer_id)
  where customer_id is not null;

create index if not exists conversation_participants_user_conversation_idx
  on public.conversation_participants (user_id, conversation_id);

create index if not exists messages_conversation_activity_idx
  on public.messages (conversation_id, sent_at, created_at);

-- sender_id is an authenticated-user identity in the canonical messaging API.
-- Keep the new FK NOT VALID so historical profile-id rows do not block rollout;
-- all new writes are still checked by Postgres.
alter table public.messages
  drop constraint if exists messages_sender_id_fkey;

alter table public.messages
  add constraint messages_sender_id_fkey
  foreign key (sender_id) references auth.users(id) on delete set null not valid;

create or replace function public.touch_conversation_from_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations
  set last_message_at = coalesce(new.sent_at, new.created_at, now()),
      updated_at = now()
  where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists messages_touch_conversation on public.messages;
create trigger messages_touch_conversation
after insert on public.messages
for each row
when (new.conversation_id is not null)
execute function public.touch_conversation_from_message();

create or replace function public.create_messaging_conversation(
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
  _participant_user_ids uuid[],
  _participant_kinds text[]
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
begin
  if coalesce(array_length(_participant_user_ids, 1), 0) < 2 then
    raise exception 'A conversation requires at least two participants';
  end if;
  if array_length(_participant_user_ids, 1) is distinct from array_length(_participant_kinds, 1) then
    raise exception 'Participant identity and kind arrays must match';
  end if;

  insert into public.conversations (
    id, created_by, shop_id, channel, customer_id, work_order_id,
    vehicle_id, booking_id, context_type, context_id, title, is_group
  ) values (
    _conversation_id, _created_by, _shop_id, _channel, _customer_id,
    _work_order_id, _vehicle_id, _booking_id, _context_type, _context_id,
    nullif(trim(_title), ''), array_length(_participant_user_ids, 1) > 2
  );

  insert into public.conversation_participants (
    conversation_id, user_id, participant_kind
  )
  select _conversation_id, participant.user_id, participant.kind
  from unnest(_participant_user_ids, _participant_kinds)
    as participant(user_id, kind);

  return _conversation_id;
end;
$$;

revoke all on function public.create_messaging_conversation(
  uuid, uuid, uuid, text, uuid, uuid, uuid, uuid, text, uuid, text, uuid[], text[]
) from public, anon, authenticated;
grant execute on function public.create_messaging_conversation(
  uuid, uuid, uuid, text, uuid, uuid, uuid, uuid, text, uuid, text, uuid[], text[]
) to service_role;

-- SECURITY DEFINER avoids recursive participant-policy checks while still
-- exposing only a boolean membership decision.
create or replace function public.can_access_conversation(
  target_conversation_id uuid,
  actor_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.conversations c
    join public.conversation_participants cp
      on cp.conversation_id = c.id
     and cp.user_id = actor_user_id
    where c.id = target_conversation_id
      and (
        exists (
          select 1
          from public.profiles p
          where (p.user_id = actor_user_id or p.id = actor_user_id)
            and (c.shop_id is null or p.shop_id = c.shop_id)
        )
        or (
          c.channel = 'customer'
          and exists (
            select 1
            from public.customers customer
            where customer.user_id = actor_user_id
              and customer.shop_id = c.shop_id
              and customer.id = c.customer_id
          )
        )
      )
  );
$$;

revoke all on function public.can_access_conversation(uuid, uuid) from public;
grant execute on function public.can_access_conversation(uuid, uuid) to authenticated, service_role;

alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;
alter table public.message_reads enable row level security;

drop policy if exists conversations_member_select on public.conversations;
create policy conversations_member_select
  on public.conversations for select to authenticated
  using (public.can_access_conversation(id, auth.uid()));

drop policy if exists conversation_participants_member_select on public.conversation_participants;
create policy conversation_participants_member_select
  on public.conversation_participants for select to authenticated
  using (public.can_access_conversation(conversation_id, auth.uid()));

drop policy if exists messages_select on public.messages;
drop policy if exists messages_member_select on public.messages;
create policy messages_member_select
  on public.messages for select to authenticated
  using (
    conversation_id is not null
    and public.can_access_conversation(conversation_id, auth.uid())
  );

drop policy if exists messages_insert on public.messages;
drop policy if exists messages_member_insert on public.messages;
create policy messages_member_insert
  on public.messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and conversation_id is not null
    and public.can_access_conversation(conversation_id, auth.uid())
  );

drop policy if exists "own msg reads" on public.message_reads;
drop policy if exists message_reads_member_all on public.message_reads;
create policy message_reads_member_all
  on public.message_reads to authenticated
  using (
    user_id = auth.uid()
    and public.can_access_conversation(conversation_id, auth.uid())
  )
  with check (
    user_id = auth.uid()
    and public.can_access_conversation(conversation_id, auth.uid())
  );

revoke all on table public.conversations from anon;
revoke all on table public.conversation_participants from anon;
revoke all on table public.messages from anon;
revoke all on table public.message_reads from anon;

revoke all on table public.conversations from authenticated;
revoke all on table public.conversation_participants from authenticated;
revoke all on table public.messages from authenticated;
revoke all on table public.message_reads from authenticated;

grant select on table public.conversations to authenticated;
grant select on table public.conversation_participants to authenticated;
grant select, insert on table public.messages to authenticated;
grant select, insert, update on table public.message_reads to authenticated;

grant all on table public.conversations to service_role;
grant all on table public.conversation_participants to service_role;
grant all on table public.messages to service_role;
grant all on table public.message_reads to service_role;

commit;