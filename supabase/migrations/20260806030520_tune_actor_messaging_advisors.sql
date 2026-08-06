begin;

create index if not exists conversation_participants_customer_idx
  on public.conversation_participants (customer_id)
  where customer_id is not null;
create index if not exists conversation_participants_profile_idx
  on public.conversation_participants (profile_id)
  where profile_id is not null;
create index if not exists message_deliveries_conversation_idx
  on public.message_deliveries (conversation_id);
create index if not exists message_deliveries_recipient_conversation_idx
  on public.message_deliveries (recipient_participant_id, conversation_id);
create index if not exists portal_notifications_message_idx
  on public.portal_notifications (message_id)
  where message_id is not null;

drop policy if exists conversations_member_select on public.conversations;
create policy conversations_member_select
  on public.conversations for select to authenticated
  using (public.can_access_conversation(id, (select auth.uid())));

drop policy if exists conversation_participants_member_select
  on public.conversation_participants;
create policy conversation_participants_member_select
  on public.conversation_participants for select to authenticated
  using (
    public.can_access_conversation(conversation_id, (select auth.uid()))
  );

drop policy if exists messages_member_select on public.messages;
create policy messages_member_select
  on public.messages for select to authenticated
  using (
    conversation_id is not null
    and public.can_access_conversation(conversation_id, (select auth.uid()))
  );

drop policy if exists messages_member_insert on public.messages;
create policy messages_member_insert
  on public.messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and conversation_id is not null
    and public.can_access_conversation(conversation_id, (select auth.uid()))
  );

drop policy if exists message_reads_member_all on public.message_reads;
create policy message_reads_member_all
  on public.message_reads to authenticated
  using (
    user_id = (select auth.uid())
    and public.can_access_conversation(
      conversation_id,
      (select auth.uid())
    )
  )
  with check (
    user_id = (select auth.uid())
    and public.can_access_conversation(
      conversation_id,
      (select auth.uid())
    )
  );

drop policy if exists message_deliveries_recipient_select
  on public.message_deliveries;
create policy message_deliveries_recipient_select
  on public.message_deliveries for select to authenticated
  using (
    recipient_user_id = (select auth.uid())
    and public.can_access_conversation(
      conversation_id,
      (select auth.uid())
    )
  );

drop policy if exists message_deliveries_recipient_update
  on public.message_deliveries;
create policy message_deliveries_recipient_update
  on public.message_deliveries for update to authenticated
  using (
    recipient_user_id = (select auth.uid())
    and public.can_access_conversation(
      conversation_id,
      (select auth.uid())
    )
  )
  with check (
    recipient_user_id = (select auth.uid())
    and public.can_access_conversation(
      conversation_id,
      (select auth.uid())
    )
  );

drop policy if exists portal_notifications_user_select
  on public.portal_notifications;
create policy portal_notifications_user_select
  on public.portal_notifications for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists portal_notifications_user_update
  on public.portal_notifications;
create policy portal_notifications_user_update
  on public.portal_notifications for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists chat_realtime_select on realtime.messages;
create policy chat_realtime_select
  on realtime.messages for select to authenticated
  using (
    public.can_access_conversation(
      public.realtime_conversation_id(topic),
      (select auth.uid())
    )
  );

drop policy if exists chat_realtime_insert on realtime.messages;
create policy chat_realtime_insert
  on realtime.messages for insert to authenticated
  with check (
    public.can_access_conversation(
      public.realtime_conversation_id(topic),
      (select auth.uid())
    )
  );

alter function public.mark_portal_notification_read(uuid) security invoker;
alter function public.mark_all_portal_notifications_read() security invoker;
revoke all on function public.mark_portal_notification_read(uuid)
  from public, anon;
revoke all on function public.mark_all_portal_notifications_read()
  from public, anon;
grant execute on function public.mark_portal_notification_read(uuid)
  to authenticated;
grant execute on function public.mark_all_portal_notifications_read()
  to authenticated;

commit;
