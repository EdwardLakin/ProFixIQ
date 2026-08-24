begin;

-- Expand the existing Workspace authorization catalog for Work Order pricing,
-- cost, gross-profit, Parts, and invoice access. This migration only adds
-- catalog rows and role presets; the direct-table contract migration lands
-- after every authenticated consumer has moved to the role-shaped projection.
insert into public.workspace_capabilities (
  capability_key,
  workspace_key,
  module_key,
  action_key,
  access_level,
  is_protected,
  description
) values
  (
    'work_order.financial.sell.view',
    'work_order',
    'financial',
    'sell_view',
    'view',
    false,
    'View customer-facing Work Order sell pricing and totals.'
  ),
  (
    'work_order.financial.cost.view',
    'work_order',
    'financial',
    'cost_view',
    'view',
    false,
    'View internal Work Order labor and Parts cost.'
  ),
  (
    'work_order.financial.gp.view',
    'work_order',
    'financial',
    'gross_profit_view',
    'view',
    false,
    'View Work Order gross profit and margin.'
  ),
  (
    'work_order.invoice.view',
    'work_order',
    'invoice',
    'view',
    'view',
    false,
    'View the canonical Work Order invoice snapshot and issued invoice.'
  ),
  (
    'work_order.invoice.manage',
    'work_order',
    'invoice',
    'manage',
    'manage',
    false,
    'Review, issue, send, collect, and otherwise manage a Work Order invoice.'
  ),
  (
    'work_order.pricing.edit',
    'work_order',
    'pricing',
    'edit',
    'manage',
    false,
    'Edit customer-facing Work Order and estimate pricing.'
  ),
  (
    'work_order.parts.sell.view',
    'work_order',
    'parts',
    'sell_view',
    'view',
    false,
    'View customer-facing Parts sell pricing on a Work Order.'
  ),
  (
    'work_order.parts.cost.view',
    'work_order',
    'parts',
    'cost_view',
    'view',
    false,
    'View Parts acquisition cost required for purchasing and reconciliation.'
  )
on conflict (capability_key) do update
set workspace_key = excluded.workspace_key,
    module_key = excluded.module_key,
    action_key = excluded.action_key,
    access_level = excluded.access_level,
    is_protected = excluded.is_protected,
    description = excluded.description,
    updated_at = now();

insert into public.workspace_role_capability_presets (
  capability_key,
  role_key,
  effect
) values
  ('work_order.financial.sell.view', 'owner', 'allow'),
  ('work_order.financial.sell.view', 'admin', 'allow'),
  ('work_order.financial.sell.view', 'manager', 'allow'),
  ('work_order.financial.sell.view', 'advisor', 'allow'),
  ('work_order.financial.sell.view', 'service', 'allow'),
  ('work_order.financial.sell.view', 'foreman', 'allow'),

  ('work_order.financial.cost.view', 'owner', 'allow'),
  ('work_order.financial.cost.view', 'admin', 'allow'),
  ('work_order.financial.cost.view', 'manager', 'allow'),

  ('work_order.financial.gp.view', 'owner', 'allow'),
  ('work_order.financial.gp.view', 'admin', 'allow'),
  ('work_order.financial.gp.view', 'manager', 'allow'),

  ('work_order.invoice.view', 'owner', 'allow'),
  ('work_order.invoice.view', 'admin', 'allow'),
  ('work_order.invoice.view', 'manager', 'allow'),
  ('work_order.invoice.view', 'advisor', 'allow'),
  ('work_order.invoice.view', 'service', 'allow'),

  ('work_order.invoice.manage', 'owner', 'allow'),
  ('work_order.invoice.manage', 'admin', 'allow'),
  ('work_order.invoice.manage', 'manager', 'allow'),
  ('work_order.invoice.manage', 'advisor', 'allow'),
  ('work_order.invoice.manage', 'service', 'allow'),

  ('work_order.pricing.edit', 'owner', 'allow'),
  ('work_order.pricing.edit', 'admin', 'allow'),
  ('work_order.pricing.edit', 'manager', 'allow'),
  ('work_order.pricing.edit', 'advisor', 'allow'),
  ('work_order.pricing.edit', 'service', 'allow'),

  ('work_order.parts.sell.view', 'owner', 'allow'),
  ('work_order.parts.sell.view', 'admin', 'allow'),
  ('work_order.parts.sell.view', 'manager', 'allow'),
  ('work_order.parts.sell.view', 'advisor', 'allow'),
  ('work_order.parts.sell.view', 'service', 'allow'),
  ('work_order.parts.sell.view', 'foreman', 'allow'),
  ('work_order.parts.sell.view', 'parts', 'allow'),

  ('work_order.parts.cost.view', 'owner', 'allow'),
  ('work_order.parts.cost.view', 'admin', 'allow'),
  ('work_order.parts.cost.view', 'manager', 'allow'),
  ('work_order.parts.cost.view', 'parts', 'allow')
on conflict (capability_key, role_key) do update
set effect = excluded.effect,
    updated_at = now();

commit;
