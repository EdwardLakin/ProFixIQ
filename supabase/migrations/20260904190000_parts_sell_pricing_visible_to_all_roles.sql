begin;

-- work_order.parts.sell.view previously excluded lead_hand, mechanic,
-- dispatcher, fleet_manager, driver, and viewer -- so a mechanic's job
-- Parts card redacted the customer-facing part price
-- (projectCanonicalLineContextFinancialFields nulls unit_price /
-- unit_sell_price_snapshot / total_price for any staff actor without this
-- capability). Per explicit request, this shop wants parts sell price
-- visible to every role, matching their prior system. This only affects
-- work_order.parts.sell.view -- labor sell pricing, cost, gross profit, and
-- invoice visibility are untouched.
insert into public.workspace_role_capability_presets (
  capability_key,
  role_key,
  effect
) values
  ('work_order.parts.sell.view', 'owner', 'allow'),
  ('work_order.parts.sell.view', 'admin', 'allow'),
  ('work_order.parts.sell.view', 'manager', 'allow'),
  ('work_order.parts.sell.view', 'advisor', 'allow'),
  ('work_order.parts.sell.view', 'service', 'allow'),
  ('work_order.parts.sell.view', 'foreman', 'allow'),
  ('work_order.parts.sell.view', 'parts', 'allow'),
  ('work_order.parts.sell.view', 'lead_hand', 'allow'),
  ('work_order.parts.sell.view', 'mechanic', 'allow'),
  ('work_order.parts.sell.view', 'dispatcher', 'allow'),
  ('work_order.parts.sell.view', 'fleet_manager', 'allow'),
  ('work_order.parts.sell.view', 'driver', 'allow'),
  ('work_order.parts.sell.view', 'viewer', 'allow')
on conflict (capability_key, role_key) do update
set effect = excluded.effect,
    updated_at = now();

commit;
