begin;

-- work_order.financial.sell.view previously excluded the mechanic role, so
-- a technician's job card redacted the shop's labor sell rate
-- (projectRoleShapedWorkOrderDetail nulls shopLaborRate for any staff actor
-- without this capability), while work_order.parts.sell.view was already
-- granted to mechanics (see 20260904190000_parts_sell_pricing_visible_to_all_roles.sql).
-- That asymmetry made a job's labor total silently compute as $0 for
-- mechanics even though the shop's labor rate was configured, with no
-- indication the figure was redacted rather than genuinely zero. Per
-- explicit request, mechanics should see labor sell pricing the same way
-- they already see parts sell pricing. This only affects the mechanic
-- role's work_order.financial.sell.view grant -- cost, gross profit, and
-- invoice visibility are untouched.
insert into public.workspace_role_capability_presets (
  capability_key,
  role_key,
  effect
) values
  ('work_order.financial.sell.view', 'mechanic', 'allow')
on conflict (capability_key, role_key) do update
set effect = excluded.effect,
    updated_at = now();

commit;
