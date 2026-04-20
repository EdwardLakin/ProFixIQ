-- Blocker E: chat/log RLS hardening
-- Tightens permissive chat/log policy posture and broad grants.
-- Manual apply required.

begin;

-- Ensure target tables are RLS-protected.
alter table if exists public.chats enable row level security;
alter table if exists public.chat_participants enable row level security;
alter table if exists public.conversations enable row level security;
alter table if exists public.conversation_participants enable row level security;
alter table if exists public.dtc_logs enable row level security;
alter table if exists public.email_logs enable row level security;

-- ---------------------------------------------------------------------------
-- chats: participant/creator scoped visibility, actor-scoped writes.
-- ---------------------------------------------------------------------------
drop policy if exists chats_insert_self on public.chats;
drop policy if exists chats_select_visible on public.chats;
drop policy if exists chats_member_select on public.chats;
drop policy if exists chats_actor_insert on public.chats;
drop policy if exists chats_creator_update on public.chats;
drop policy if exists chats_creator_delete on public.chats;

create policy chats_member_select
  on public.chats
  for select
  to authenticated
  using (
    created_by = auth.uid()
    or exists (
      select 1
      from public.chat_participants cp
      where cp.chat_id = chats.id
        and cp.profile_id = auth.uid()
    )
  );

create policy chats_actor_insert
  on public.chats
  for insert
  to authenticated
  with check (
    created_by = auth.uid()
    or created_by is null
  );

create policy chats_creator_update
  on public.chats
  for update
  to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

create policy chats_creator_delete
  on public.chats
  for delete
  to authenticated
  using (created_by = auth.uid());

-- ---------------------------------------------------------------------------
-- chat_participants: only conversation members can read; only chat creator writes.
-- ---------------------------------------------------------------------------
drop policy if exists chat_participants_member_select on public.chat_participants;
drop policy if exists chat_participants_creator_insert on public.chat_participants;
drop policy if exists chat_participants_creator_update on public.chat_participants;
drop policy if exists chat_participants_creator_delete on public.chat_participants;

create policy chat_participants_member_select
  on public.chat_participants
  for select
  to authenticated
  using (
    profile_id = auth.uid()
    or exists (
      select 1
      from public.chats c
      where c.id = chat_participants.chat_id
        and c.created_by = auth.uid()
    )
    or exists (
      select 1
      from public.chat_participants self_cp
      where self_cp.chat_id = chat_participants.chat_id
        and self_cp.profile_id = auth.uid()
    )
  );

create policy chat_participants_creator_insert
  on public.chat_participants
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.chats c
      where c.id = chat_participants.chat_id
        and c.created_by = auth.uid()
    )
  );

create policy chat_participants_creator_update
  on public.chat_participants
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.chats c
      where c.id = chat_participants.chat_id
        and c.created_by = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.chats c
      where c.id = chat_participants.chat_id
        and c.created_by = auth.uid()
    )
  );

create policy chat_participants_creator_delete
  on public.chat_participants
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.chats c
      where c.id = chat_participants.chat_id
        and c.created_by = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- conversations: participant/creator scoped visibility, creator-scoped writes.
-- ---------------------------------------------------------------------------
drop policy if exists conversations_member_select on public.conversations;
drop policy if exists conversations_actor_insert on public.conversations;
drop policy if exists conversations_creator_update on public.conversations;
drop policy if exists conversations_creator_delete on public.conversations;

create policy conversations_member_select
  on public.conversations
  for select
  to authenticated
  using (
    created_by = auth.uid()
    or exists (
      select 1
      from public.conversation_participants cp
      where cp.conversation_id = conversations.id
        and cp.user_id = auth.uid()
    )
  );

create policy conversations_actor_insert
  on public.conversations
  for insert
  to authenticated
  with check (created_by = auth.uid());

create policy conversations_creator_update
  on public.conversations
  for update
  to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

create policy conversations_creator_delete
  on public.conversations
  for delete
  to authenticated
  using (created_by = auth.uid());

-- ---------------------------------------------------------------------------
-- conversation_participants: participant-scoped reads, creator-scoped writes.
-- ---------------------------------------------------------------------------
drop policy if exists conversation_participants_member_select on public.conversation_participants;
drop policy if exists conversation_participants_creator_insert on public.conversation_participants;
drop policy if exists conversation_participants_creator_update on public.conversation_participants;
drop policy if exists conversation_participants_creator_delete on public.conversation_participants;

create policy conversation_participants_member_select
  on public.conversation_participants
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.conversations c
      where c.id = conversation_participants.conversation_id
        and c.created_by = auth.uid()
    )
    or exists (
      select 1
      from public.conversation_participants self_cp
      where self_cp.conversation_id = conversation_participants.conversation_id
        and self_cp.user_id = auth.uid()
    )
  );

create policy conversation_participants_creator_insert
  on public.conversation_participants
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.conversations c
      where c.id = conversation_participants.conversation_id
        and c.created_by = auth.uid()
    )
  );

create policy conversation_participants_creator_update
  on public.conversation_participants
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.conversations c
      where c.id = conversation_participants.conversation_id
        and c.created_by = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.conversations c
      where c.id = conversation_participants.conversation_id
        and c.created_by = auth.uid()
    )
  );

create policy conversation_participants_creator_delete
  on public.conversation_participants
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.conversations c
      where c.id = conversation_participants.conversation_id
        and c.created_by = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- dtc_logs: actor-owned rows only.
-- ---------------------------------------------------------------------------
drop policy if exists dtc_logs_self_select on public.dtc_logs;
drop policy if exists dtc_logs_self_insert on public.dtc_logs;
drop policy if exists dtc_logs_self_update on public.dtc_logs;
drop policy if exists dtc_logs_self_delete on public.dtc_logs;

create policy dtc_logs_self_select
  on public.dtc_logs
  for select
  to authenticated
  using (user_id = auth.uid());

create policy dtc_logs_self_insert
  on public.dtc_logs
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy dtc_logs_self_update
  on public.dtc_logs
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy dtc_logs_self_delete
  on public.dtc_logs
  for delete
  to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- email_logs: shop-scoped read-only for authorized staff; service-role manages writes.
-- ---------------------------------------------------------------------------
drop policy if exists email_logs_shop_staff_select on public.email_logs;

create policy email_logs_shop_staff_select
  on public.email_logs
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.shop_id = email_logs.shop_id
        and lower(coalesce(p.role, '')) in ('owner', 'admin', 'manager', 'advisor')
    )
  );

-- ---------------------------------------------------------------------------
-- Grant hardening: remove broad anon access and keep least-privilege grants.
-- ---------------------------------------------------------------------------
revoke all on table public.chats from anon;
revoke all on table public.chat_participants from anon;
revoke all on table public.conversations from anon;
revoke all on table public.conversation_participants from anon;
revoke all on table public.dtc_logs from anon;
revoke all on table public.email_logs from anon;

revoke all on table public.chats from authenticated;
revoke all on table public.chat_participants from authenticated;
revoke all on table public.conversations from authenticated;
revoke all on table public.conversation_participants from authenticated;
revoke all on table public.dtc_logs from authenticated;
revoke all on table public.email_logs from authenticated;

grant select, insert, update, delete on table public.chats to authenticated;
grant select, insert, update, delete on table public.chat_participants to authenticated;
grant select, insert, update, delete on table public.conversations to authenticated;
grant select, insert, update, delete on table public.conversation_participants to authenticated;
grant select, insert, update, delete on table public.dtc_logs to authenticated;
grant select on table public.email_logs to authenticated;

grant all on table public.chats to service_role;
grant all on table public.chat_participants to service_role;
grant all on table public.conversations to service_role;
grant all on table public.conversation_participants to service_role;
grant all on table public.dtc_logs to service_role;
grant all on table public.email_logs to service_role;

commit;
