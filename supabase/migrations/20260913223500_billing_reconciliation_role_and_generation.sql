begin;

-- Staff-seat billing is now role-sensitive (see
-- features/stripe/lib/server/product-package-reconciliation.ts): a profile
-- that transitions between a paid workforce role and a non-billable role
-- (Fleet-portal, dispatcher, driver, ...) changes the shop's billable seat
-- count even though shop_id never changes. The existing trigger only fired
-- on insert, delete, and shop_id updates, so a plain role change never
-- marked the shop dirty for reconciliation and Stripe could keep billing a
-- stale seat quantity indefinitely.
drop trigger if exists profiles_mark_shop_billing_sync on public.profiles;
create trigger profiles_mark_shop_billing_sync
after insert or delete or update of shop_id, role
on public.profiles
for each row
execute function public.profixiq_mark_shop_billing_sync();

-- Product-package reconciliation's Stripe idempotency key used to embed the
-- raw computed seat/truck/asset quantities directly. Those quantities can
-- legitimately revisit a prior value within one billing period (for example
-- 11 -> 10 -> 11 active staff), which reproduces the exact same key as an
-- earlier, already-completed reconciliation. Stripe then replays the cached
-- response for that earlier call instead of executing the new update, so the
-- live subscription silently stops tracking the shop's actual capacity.
--
-- A durable per-shop generation that only advances when the target billing
-- signature actually changes gives each distinct transition its own
-- idempotency key, while still reusing the same key (and therefore Stripe's
-- safe replay) for genuine retries of one still-in-flight transition.
alter table public.shops
  add column if not exists stripe_billing_reconciliation_signature text,
  add column if not exists stripe_billing_reconciliation_generation integer not null default 0;

create or replace function public.advance_billing_reconciliation_generation(
  p_shop_id uuid,
  p_signature text
) returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_generation integer;
begin
  update public.shops
  set
    stripe_billing_reconciliation_generation =
      case
        when stripe_billing_reconciliation_signature is distinct from p_signature
          then stripe_billing_reconciliation_generation + 1
        else stripe_billing_reconciliation_generation
      end,
    stripe_billing_reconciliation_signature = p_signature
  where id = p_shop_id
  returning stripe_billing_reconciliation_generation into v_generation;

  if v_generation is null then
    raise exception 'Shop % not found for billing reconciliation', p_shop_id;
  end if;

  return v_generation;
end;
$$;

revoke all on function public.advance_billing_reconciliation_generation(uuid, text)
  from public, anon, authenticated;
grant execute on function public.advance_billing_reconciliation_generation(uuid, text)
  to service_role;

commit;
