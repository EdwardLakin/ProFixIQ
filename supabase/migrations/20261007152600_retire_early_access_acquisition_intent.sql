set local lock_timeout = '5s';
set local statement_timeout = '5min';

create or replace function public.retire_early_access_acquisition_intent(
  p_grant_id uuid,
  p_checkout_attempt_namespace text,
  p_intent_id uuid,
  p_checkout_session_id text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_grant public.billing_discount_grants%rowtype;
  v_intent private.stripe_acquisition_intents%rowtype;
begin
  if p_grant_id is null
     or p_checkout_attempt_namespace is null
     or p_checkout_attempt_namespace !~ '^[0-9a-f]{32}$'
     or p_intent_id is null
     or p_checkout_session_id is null
     or p_checkout_session_id !~ '^cs_[A-Za-z0-9_]+$' then
    return false;
  end if;

  select g.*
    into v_grant
    from public.early_access_discount_grant_bindings b
    join public.billing_discount_grants g on g.id = b.grant_id
   where g.id = p_grant_id
   for update of g;

  if not found
     or v_grant.status <> 'active'
     or v_grant.shop_id is not null
     or v_grant.metadata->>'purpose' is distinct from 'early_access'
     or v_grant.metadata->>'checkout_attempt_namespace' is distinct from p_checkout_attempt_namespace
     or v_grant.metadata->>'checkout_session_id' is distinct from p_checkout_session_id
     or v_grant.metadata->>'acquisition_intent_id' is distinct from p_intent_id::text then
    return false;
  end if;

  select *
    into v_intent
    from private.stripe_acquisition_intents i
   where i.id = p_intent_id
   for update;

  if not found
     or v_intent.stripe_checkout_session_id is distinct from p_checkout_session_id
     or v_intent.status in ('completed', 'claimed')
     or v_intent.claimed_user_id is not null
     or v_intent.claimed_shop_id is not null then
    return false;
  end if;

  if v_intent.status = 'expired' then
    return true;
  end if;

  update private.stripe_acquisition_intents i
     set status = 'expired',
         expires_at = least(i.expires_at, now()),
         updated_at = now()
   where i.id = p_intent_id
     and i.status in ('pending', 'checkout_created', 'failed')
     and i.claimed_user_id is null
     and i.claimed_shop_id is null;

  return found;
end;
$$;

revoke all on function public.retire_early_access_acquisition_intent(uuid, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.retire_early_access_acquisition_intent(uuid, text, uuid, text)
  to service_role;

comment on function public.retire_early_access_acquisition_intent(uuid, text, uuid, text) is
  'Retires the canonical acquisition intent only after Stripe reports the exact attached Early Access Checkout Session expired, allowing a fresh checkout attempt without mutating shared acquisition contracts.';
