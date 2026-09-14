begin;

-- profixiq_mark_shop_billing_sync recomputes shops.billable_user_count /
-- active_user_count on every relevant profiles change, but it counted every
-- profiles row scoped to the shop with no role filter. That denormalized
-- column is now read directly by resolveShopAIFairUseBudgetUsd (see
-- features/shared/lib/server/ai-fair-use.ts) to size the shop's AI fair-use
-- ceiling at 20% of monthly recurring revenue, and by the legacy seat-billing
-- path (features/stripe/lib/server/subscription-seat-reconciliation.ts,
-- features/shared/lib/server/shop-seat-limit.ts). All three treated a
-- Fleet-portal invitee (role "fleet_manager", see
-- accept_fleet_portal_invite_atomic) or a shop-provisioned dispatcher/driver
-- as a real seat, inflating both the Stripe seat count and, more importantly
-- here, the shop's revenue estimate and therefore its AI spend ceiling.
--
-- The staff-seat product-package reconciliation was already corrected to use
-- the canonical workforce-role allowlist in application code
-- (isDefaultWorkforceRole / WORKFORCE_STAFF_ROLES,
-- features/workforce/lib/roster.ts). This migration applies the same
-- allowlist inside the trigger function itself so every consumer of
-- billable_user_count / active_user_count — not only the path that happens to
-- run a fresh reconciliation afterward — sees the correct count immediately.
create or replace function public.profixiq_mark_shop_billing_sync()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_shop_id uuid;
begin
  for v_shop_id in
    select distinct candidate_shop_id
    from (
      select case when tg_op <> 'DELETE' then new.shop_id else null end as candidate_shop_id
      union all
      select case when tg_op <> 'INSERT' then old.shop_id else null end as candidate_shop_id
    ) candidates
    where candidate_shop_id is not null
  loop
    update public.shops s
    set
      active_user_count = counts.user_count,
      billable_user_count = counts.user_count,
      stripe_billing_sync_required = true,
      stripe_billing_synced_at = null,
      billing_entitlement_updated_at = now()
    from (
      select count(*)::integer as user_count
      from public.profiles p
      where p.shop_id = v_shop_id
        -- Mirrors DEFAULT_WORKFORCE_ROLES in
        -- features/workforce/lib/roster.ts. Keep both lists in sync.
        and lower(btrim(coalesce(p.role, ''))) in (
          'owner', 'admin', 'manager', 'advisor', 'service', 'parts',
          'mechanic', 'lead_hand', 'foreman', 'tech', 'technician',
          'leadhand', 'lead hand'
        )
    ) counts
    where s.id = v_shop_id;
  end loop;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- profiles_refresh_shop_billable_user_count (see
-- 20260802170000_stripe_billing_model_connect_correction.sql) is an older,
-- fully-superseded duplicate: it recomputes the same two columns from the
-- same unfiltered profiles count, on the same insert/delete/update-of-shop_id
-- events. Postgres fires same-event triggers on one table in trigger-name
-- alphabetical order, so "profiles_refresh_..." (r) ran after
-- "profiles_mark_shop_billing_sync" (m) and silently overwrote the
-- role-filtered count above with the old unfiltered one on every single
-- profiles change — the fix above did nothing observable until this trigger
-- is removed. profixiq_mark_shop_billing_sync already covers every case this
-- one handled (insert, delete, and both the old and new shop_id sides of a
-- shop-to-shop move) plus the sync bookkeeping columns this one does not.
drop trigger if exists profiles_refresh_shop_billable_user_count on public.profiles;
drop function if exists public.refresh_shop_billable_user_count();

-- profiles_recalc_shop_user_count (see
-- 20260804052000_narrow_profile_user_count_trigger.sql) is a second,
-- conditionally-created duplicate that only materializes where a
-- pre-migration "production drift" function
-- (tg_profiles_recalc_shop_user_count) already exists — which a clean replay
-- never has, so it did not reproduce the failure above locally, but it is
-- the exact same clobbering risk (same columns, same events, alphabetically
-- after "profiles_mark_shop_billing_sync") wherever that drift function is
-- actually present. Retire both defensively; this migration is what that
-- drift was always meant to be promoted into.
drop trigger if exists profiles_recalc_shop_user_count on public.profiles;
drop function if exists public.tg_profiles_recalc_shop_user_count();

commit;
