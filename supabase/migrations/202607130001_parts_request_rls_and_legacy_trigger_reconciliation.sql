-- Repair part_request_items RLS for same-shop Parts users and remove legacy automatic
-- inventory side effects that predate the canonical explicit parts lifecycle.

begin;

-- No existing DB helper mirrors the application canManageWorkOrders/canonical parts role set
-- without also admitting technician/advisor roles. Keep this predicate narrow to roles
-- that own parts request fulfillment operations in the product navigation.
create or replace function public.can_update_part_request_items(p_shop_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.shop_id = p_shop_id
      and lower(coalesce(p.role, '')) in ('owner', 'admin', 'manager', 'parts')
  );
$$;

comment on function public.can_update_part_request_items(uuid) is
  'Narrow database authorization predicate for direct part_request_items updates: same-shop owner/admin/manager/parts users only.';

-- Replace requester-only UPDATE policy with same-shop policy aligned to SELECT/DELETE.
-- Dynamic drop is intentional because the live requester-only policy name has drifted
-- between environments; the table should have exactly one UPDATE policy after this migration.
do $$
declare
  policy_record record;
begin
  for policy_record in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'part_request_items'
      and cmd = 'UPDATE'
  loop
    execute format('drop policy if exists %I on public.part_request_items', policy_record.policyname);
  end loop;
end $$;

create policy part_request_items_update_same_shop_parent_request
on public.part_request_items
for update
to authenticated
using (
  exists (
    select 1
    from public.part_requests pr
    join public.profiles p on p.id = auth.uid()
    where pr.id = part_request_items.request_id
      and pr.shop_id = p.shop_id
      and public.can_update_part_request_items(pr.shop_id)
      and (part_request_items.shop_id is null or part_request_items.shop_id = pr.shop_id)
  )
)
with check (
  exists (
    select 1
    from public.part_requests pr
    join public.profiles p on p.id = auth.uid()
    where pr.id = part_request_items.request_id
      and pr.shop_id = p.shop_id
      and public.can_update_part_request_items(pr.shop_id)
      and (part_request_items.shop_id is null or part_request_items.shop_id = pr.shop_id)
  )
);

comment on policy part_request_items_update_same_shop_parent_request on public.part_request_items is
  'Allows authenticated owner/admin/manager/parts users to update request items only when the parent part request belongs to their profile shop; prevents cross-shop request_id/shop_id changes.';


-- Block direct PostgREST/client UPDATE attempts from reassigning immutable tenant and
-- durable linkage anchors. Canonical lifecycle commands should create new durable
-- relationships rather than moving an existing request item across these boundaries.
create or replace function public.prevent_part_request_item_anchor_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.shop_id is distinct from old.shop_id then
    raise exception 'part_request_items.shop_id cannot be changed';
  end if;
  if new.request_id is distinct from old.request_id then
    raise exception 'part_request_items.request_id cannot be changed';
  end if;
  if new.work_order_id is distinct from old.work_order_id then
    raise exception 'part_request_items.work_order_id cannot be changed';
  end if;
  if new.work_order_line_id is distinct from old.work_order_line_id then
    raise exception 'part_request_items.work_order_line_id cannot be changed';
  end if;
  if new.quote_line_id is distinct from old.quote_line_id then
    raise exception 'part_request_items.quote_line_id cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_part_request_item_anchor_changes on public.part_request_items;
create trigger trg_prevent_part_request_item_anchor_changes
before update on public.part_request_items
for each row
execute function public.prevent_part_request_item_anchor_changes();

-- Legacy trigger reconciliation:
-- * trg_pri_approved_reserve_stock auto-allocated on approval and moved items to reserved.
--   Approval fulfillment is now explicit via parts_allocate_request_item.
-- * trg_pri_reserved_autopick physically decremented stock and marked picked/picking.
--   Physical issue is now explicit via parts_issue_work_order_part.
-- * trg_pri_picked_consume inserted another consume movement and marked consumed.
--   This could double-deduct with reserved autopick; explicit issue is the canonical single deduction.
-- * trg_pri_auto_unreserve inserted positive physical release movements on status changes.
--   Canonical release is zero-quantity allocation release; physical return is explicit return-to-stock.
-- * trg_pri_recheck_line_hold called legacy reservation/order functions after part_id updates.
--   Inventory selection must only persist part_id and must not reserve/order/pick/consume.
drop trigger if exists trg_pri_approved_reserve_stock on public.part_request_items;
drop trigger if exists trg_pri_reserved_autopick on public.part_request_items;
drop trigger if exists trg_pri_picked_consume on public.part_request_items;
drop trigger if exists trg_pri_auto_unreserve on public.part_request_items;
drop trigger if exists trg_pri_recheck_line_hold on public.part_request_items;

-- Preserve updated-at and request-item linkage triggers by not touching any other triggers on part_request_items.
-- Preserve canonical explicit lifecycle functions; this migration intentionally does not drop legacy functions
-- because historical RPC callers and manual reconciliation scripts may still reference them.

commit;
