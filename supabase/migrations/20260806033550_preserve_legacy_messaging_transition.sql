begin;

-- Keep the deployed mark-read route operational while actor-aware
-- clients roll out. Actor-specific unread state lives in message_deliveries;
-- message_reads remains the backward-compatible per-user watermark.
drop index if exists public.message_reads_legacy_user_uidx;
create unique index if not exists message_reads_conversation_user_uidx
  on public.message_reads (conversation_id, user_id);

-- Legacy portal clients do not send actor_kind. Prefer the customer actor for
-- customer-channel requests without a staff deep link; the new clients always
-- send actor_kind explicitly and bypass this compatibility heuristic.
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
    select cp.* into v_participant
    from public.conversation_participants cp
    join public.conversations c on c.id = cp.conversation_id
    where cp.conversation_id = new.conversation_id
      and cp.user_id = new.sender_id
      and (v_requested_kind is null or cp.participant_kind = v_requested_kind)
    order by
      case when cp.participant_kind = v_requested_kind then 0 else 1 end,
      case
        when v_requested_kind is null
          and c.channel = 'customer'
          and coalesce(new.metadata ->> 'deep_link', '') = ''
          and cp.participant_kind = 'customer' then 0
        when cp.participant_kind = 'staff' then 1
        else 2
      end,
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

revoke all on function public.resolve_message_actor()
  from public, anon, authenticated;

commit;
