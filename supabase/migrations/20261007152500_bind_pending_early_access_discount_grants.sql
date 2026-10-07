set local lock_timeout = '5s';
set local statement_timeout = '5min';

create or replace function public.bind_pending_early_access_discount_grant()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_match_count integer;
begin
  if new.owner_id is null or new.stripe_subscription_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.owner_id is not distinct from old.owner_id
     and new.stripe_subscription_id is not distinct from old.stripe_subscription_id then
    return new;
  end if;

  select count(*)::integer
    into v_match_count
    from public.billing_discount_grants g
   where g.status = 'active'
     and g.discount_class = 'beta'
     and g.metadata->>'purpose' = 'early_access'
     and g.metadata->>'pending_user_id' = new.owner_id::text
     and g.metadata->>'subscription_id' = new.stripe_subscription_id
     and nullif(g.metadata->>'checkout_session_id', '') is not null;

  if v_match_count > 1 then
    raise exception using
      errcode = 'P0001',
      message = 'multiple pending Early Access grants match owner shop billing identity';
  end if;

  if v_match_count = 1 then
    update public.billing_discount_grants g
       set shop_id = new.id,
           status = 'redeemed',
           metadata = coalesce(g.metadata, '{}'::jsonb) || jsonb_build_object(
             'pending_user_id', null,
             'pending_shop_binding_completed_at', now(),
             'redeemed_at', now()
           )
     where g.status = 'active'
       and g.discount_class = 'beta'
       and g.metadata->>'purpose' = 'early_access'
       and g.metadata->>'pending_user_id' = new.owner_id::text
       and g.metadata->>'subscription_id' = new.stripe_subscription_id
       and nullif(g.metadata->>'checkout_session_id', '') is not null;
  end if;

  return new;
end;
$$;

revoke all on function public.bind_pending_early_access_discount_grant() from public;
revoke all on function public.bind_pending_early_access_discount_grant() from anon;
revoke all on function public.bind_pending_early_access_discount_grant() from authenticated;

drop trigger if exists shops_bind_pending_early_access_discount_grant on public.shops;
create trigger shops_bind_pending_early_access_discount_grant
after insert or update of owner_id, stripe_subscription_id on public.shops
for each row execute function public.bind_pending_early_access_discount_grant();

comment on function public.bind_pending_early_access_discount_grant() is
  'Binds one deferred Early Access billing grant to the canonical owner shop once the matching Stripe subscription is persisted.';
