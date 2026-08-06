begin;

-- Cover the existing self-reference used for message reply threads.
create index if not exists messages_reply_to_idx
  on public.messages (reply_to)
  where reply_to is not null;

commit;
