begin;

-- The canonical private Broadcast trigger installed by the actor migration supersedes
-- this unreferenced legacy SECURITY DEFINER function. Dropping it removes an
-- unnecessary PostgREST RPC surface flagged by the security advisor.
drop function if exists public.conversation_messages_broadcast_trigger();

-- Cover composite foreign keys in their declared column order so deletes and
-- actor-integrity checks do not require table scans.
create index if not exists message_reads_participant_conversation_idx
  on public.message_reads (participant_id, conversation_id)
  where participant_id is not null;

create index if not exists messages_sender_participant_conversation_idx
  on public.messages (sender_participant_id, conversation_id)
  where sender_participant_id is not null;

commit;
