-- Read the same PostgreSQL clock that assigns shop_assistant_actions.created_at.
-- The caller still passes through requireShopAssistantActor before invoking this RPC.
create or replace function public.shop_assistant_notification_clock()
returns timestamptz
language sql
volatile
security invoker
set search_path = public
as $$
  select clock_timestamp();
$$;

revoke all on function public.shop_assistant_notification_clock() from public, anon;
grant execute on function public.shop_assistant_notification_clock() to authenticated;
