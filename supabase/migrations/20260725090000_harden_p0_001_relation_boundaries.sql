-- P0-001: remove broad client access from relations that were created without
-- complete row-level security boundaries.
--
-- This migration deliberately derives shop membership from the authenticated
-- profile instead of app.current_shop_id. The latter is hardened separately by
-- P0-002 and must not be trusted as an authorization boundary here.

alter table public.apps enable row level security;
alter table public.apps force row level security;

alter table public.parts_barcodes enable row level security;
alter table public.parts_barcodes force row level security;

alter table public.shop_profiles enable row level security;
alter table public.shop_profiles force row level security;

alter table public.warranties enable row level security;
alter table public.warranties force row level security;

alter table public.warranty_claims enable row level security;
alter table public.warranty_claims force row level security;

alter table public.widgets enable row level security;
alter table public.widgets force row level security;

-- Clean installs currently materialize this relation as a table. Some deployed
-- schemas and generated application types model it as a view. Harden both
-- supported shapes without destroying or replacing either relation.
do $$
declare
  v_relkind "char";
begin
  select c.relkind
    into v_relkind
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n
    on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'part_stock_summary';

  if v_relkind in ('r', 'p') then
    execute 'alter table public.part_stock_summary enable row level security';
    execute 'alter table public.part_stock_summary force row level security';
    execute 'drop policy if exists part_stock_summary_authenticated_read on public.part_stock_summary';
    execute $policy$
      create policy part_stock_summary_authenticated_read
      on public.part_stock_summary
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.profiles actor
          where actor.id = (select auth.uid())
            and actor.shop_id = part_stock_summary.shop_id
        )
      )
    $policy$;
  elsif v_relkind = 'v' then
    execute 'alter view public.part_stock_summary set (security_invoker = true)';
  elsif v_relkind is null then
    raise exception
      'P0-001 cannot harden missing relation public.part_stock_summary';
  else
    raise exception
      'P0-001 cannot safely harden public.part_stock_summary relkind %',
      v_relkind;
  end if;
end
$$;

drop policy if exists apps_authenticated_read on public.apps;
create policy apps_authenticated_read
on public.apps
for select
to authenticated
using (true);

drop policy if exists widgets_authenticated_read on public.widgets;
create policy widgets_authenticated_read
on public.widgets
for select
to authenticated
using (true);

drop policy if exists parts_barcodes_authenticated_read
  on public.parts_barcodes;
create policy parts_barcodes_authenticated_read
on public.parts_barcodes
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles actor
    where actor.id = (select auth.uid())
      and actor.shop_id = parts_barcodes.shop_id
  )
);

drop policy if exists parts_barcodes_inventory_insert
  on public.parts_barcodes;
create policy parts_barcodes_inventory_insert
on public.parts_barcodes
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles actor
    where actor.id = (select auth.uid())
      and actor.shop_id = parts_barcodes.shop_id
      and lower(coalesce(actor.role, '')) in (
        'owner',
        'admin',
        'manager',
        'parts'
      )
  )
  and exists (
    select 1
    from public.parts part
    where part.id = parts_barcodes.part_id
      and part.shop_id = parts_barcodes.shop_id
  )
  and (
    nullif(to_jsonb(parts_barcodes) ->> 'supplier_id', '') is null
    or exists (
      select 1
      from public.suppliers supplier
      where supplier.id = (
          to_jsonb(parts_barcodes) ->> 'supplier_id'
        )::uuid
        and supplier.shop_id = parts_barcodes.shop_id
    )
  )
);

drop policy if exists parts_barcodes_inventory_update
  on public.parts_barcodes;
create policy parts_barcodes_inventory_update
on public.parts_barcodes
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles actor
    where actor.id = (select auth.uid())
      and actor.shop_id = parts_barcodes.shop_id
      and lower(coalesce(actor.role, '')) in (
        'owner',
        'admin',
        'manager',
        'parts'
      )
  )
)
with check (
  exists (
    select 1
    from public.profiles actor
    where actor.id = (select auth.uid())
      and actor.shop_id = parts_barcodes.shop_id
      and lower(coalesce(actor.role, '')) in (
        'owner',
        'admin',
        'manager',
        'parts'
      )
  )
  and exists (
    select 1
    from public.parts part
    where part.id = parts_barcodes.part_id
      and part.shop_id = parts_barcodes.shop_id
  )
  and (
    nullif(to_jsonb(parts_barcodes) ->> 'supplier_id', '') is null
    or exists (
      select 1
      from public.suppliers supplier
      where supplier.id = (
          to_jsonb(parts_barcodes) ->> 'supplier_id'
        )::uuid
        and supplier.shop_id = parts_barcodes.shop_id
    )
  )
);

-- Remove the baseline policies, including the unrestricted public SELECT and
-- the policies that depend on the mutable app.current_shop_id setting.
drop policy if exists shop_profiles_public_select on public.shop_profiles;
drop policy if exists shop_profiles_shop_delete on public.shop_profiles;
drop policy if exists shop_profiles_shop_insert on public.shop_profiles;
drop policy if exists shop_profiles_shop_select on public.shop_profiles;
drop policy if exists shop_profiles_shop_update on public.shop_profiles;
drop policy if exists shop_profiles_staff_write on public.shop_profiles;

drop policy if exists shop_profiles_authenticated_read
  on public.shop_profiles;
create policy shop_profiles_authenticated_read
on public.shop_profiles
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles actor
    where actor.id = (select auth.uid())
      and actor.shop_id = shop_profiles.shop_id
  )
);

drop policy if exists shop_profiles_manager_insert
  on public.shop_profiles;
create policy shop_profiles_manager_insert
on public.shop_profiles
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles actor
    where actor.id = (select auth.uid())
      and actor.shop_id = shop_profiles.shop_id
      and lower(coalesce(actor.role, '')) in (
        'owner',
        'admin',
        'manager'
      )
  )
);

drop policy if exists shop_profiles_manager_update
  on public.shop_profiles;
create policy shop_profiles_manager_update
on public.shop_profiles
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles actor
    where actor.id = (select auth.uid())
      and actor.shop_id = shop_profiles.shop_id
      and lower(coalesce(actor.role, '')) in (
        'owner',
        'admin',
        'manager'
      )
  )
)
with check (
  exists (
    select 1
    from public.profiles actor
    where actor.id = (select auth.uid())
      and actor.shop_id = shop_profiles.shop_id
      and lower(coalesce(actor.role, '')) in (
        'owner',
        'admin',
        'manager'
      )
  )
);

drop policy if exists warranties_authenticated_read on public.warranties;
create policy warranties_authenticated_read
on public.warranties
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles actor
    where actor.id = (select auth.uid())
      and actor.shop_id = warranties.shop_id
  )
);

drop policy if exists warranties_inventory_insert on public.warranties;
create policy warranties_inventory_insert
on public.warranties
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles actor
    where actor.id = (select auth.uid())
      and actor.shop_id = warranties.shop_id
      and lower(coalesce(actor.role, '')) in (
        'owner',
        'admin',
        'manager',
        'parts'
      )
  )
  and exists (
    select 1
    from public.parts part
    where part.id = warranties.part_id
      and part.shop_id = warranties.shop_id
  )
  and (
    warranties.supplier_id is null
    or exists (
      select 1
      from public.suppliers supplier
      where supplier.id = warranties.supplier_id
        and supplier.shop_id = warranties.shop_id
    )
  )
  and (
    warranties.work_order_id is null
    or exists (
      select 1
      from public.work_orders work_order
      where work_order.id = warranties.work_order_id
        and work_order.shop_id = warranties.shop_id
    )
  )
  and (
    warranties.work_order_line_id is null
    or exists (
      select 1
      from public.work_order_lines work_order_line
      where work_order_line.id = warranties.work_order_line_id
        and work_order_line.shop_id = warranties.shop_id
        and (
          warranties.work_order_id is null
          or work_order_line.work_order_id = warranties.work_order_id
        )
    )
  )
  and (
    warranties.customer_id is null
    or exists (
      select 1
      from public.customers customer
      where customer.id = warranties.customer_id
        and customer.shop_id = warranties.shop_id
    )
  )
  and (
    warranties.vehicle_id is null
    or exists (
      select 1
      from public.vehicles vehicle
      where vehicle.id = warranties.vehicle_id
        and vehicle.shop_id = warranties.shop_id
        and (
          warranties.customer_id is null
          or vehicle.customer_id = warranties.customer_id
        )
    )
  )
);

drop policy if exists warranties_inventory_update on public.warranties;
create policy warranties_inventory_update
on public.warranties
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles actor
    where actor.id = (select auth.uid())
      and actor.shop_id = warranties.shop_id
      and lower(coalesce(actor.role, '')) in (
        'owner',
        'admin',
        'manager',
        'parts'
      )
  )
)
with check (
  exists (
    select 1
    from public.profiles actor
    where actor.id = (select auth.uid())
      and actor.shop_id = warranties.shop_id
      and lower(coalesce(actor.role, '')) in (
        'owner',
        'admin',
        'manager',
        'parts'
      )
  )
  and exists (
    select 1
    from public.parts part
    where part.id = warranties.part_id
      and part.shop_id = warranties.shop_id
  )
  and (
    warranties.supplier_id is null
    or exists (
      select 1
      from public.suppliers supplier
      where supplier.id = warranties.supplier_id
        and supplier.shop_id = warranties.shop_id
    )
  )
  and (
    warranties.work_order_id is null
    or exists (
      select 1
      from public.work_orders work_order
      where work_order.id = warranties.work_order_id
        and work_order.shop_id = warranties.shop_id
    )
  )
  and (
    warranties.work_order_line_id is null
    or exists (
      select 1
      from public.work_order_lines work_order_line
      where work_order_line.id = warranties.work_order_line_id
        and work_order_line.shop_id = warranties.shop_id
        and (
          warranties.work_order_id is null
          or work_order_line.work_order_id = warranties.work_order_id
        )
    )
  )
  and (
    warranties.customer_id is null
    or exists (
      select 1
      from public.customers customer
      where customer.id = warranties.customer_id
        and customer.shop_id = warranties.shop_id
    )
  )
  and (
    warranties.vehicle_id is null
    or exists (
      select 1
      from public.vehicles vehicle
      where vehicle.id = warranties.vehicle_id
        and vehicle.shop_id = warranties.shop_id
        and (
          warranties.customer_id is null
          or vehicle.customer_id = warranties.customer_id
        )
    )
  )
);

drop policy if exists warranty_claims_authenticated_read
  on public.warranty_claims;
create policy warranty_claims_authenticated_read
on public.warranty_claims
for select
to authenticated
using (
  exists (
    select 1
    from public.warranties warranty
    join public.profiles actor
      on actor.id = (select auth.uid())
     and actor.shop_id = warranty.shop_id
    where warranty.id = warranty_claims.warranty_id
  )
);

drop policy if exists warranty_claims_inventory_insert
  on public.warranty_claims;
create policy warranty_claims_inventory_insert
on public.warranty_claims
for insert
to authenticated
with check (
  exists (
    select 1
    from public.warranties warranty
    join public.profiles actor
      on actor.id = (select auth.uid())
     and actor.shop_id = warranty.shop_id
     and lower(coalesce(actor.role, '')) in (
       'owner',
       'admin',
       'manager',
       'parts'
     )
    where warranty.id = warranty_claims.warranty_id
  )
);

drop policy if exists warranty_claims_inventory_update
  on public.warranty_claims;
create policy warranty_claims_inventory_update
on public.warranty_claims
for update
to authenticated
using (
  exists (
    select 1
    from public.warranties warranty
    join public.profiles actor
      on actor.id = (select auth.uid())
     and actor.shop_id = warranty.shop_id
     and lower(coalesce(actor.role, '')) in (
       'owner',
       'admin',
       'manager',
       'parts'
     )
    where warranty.id = warranty_claims.warranty_id
  )
)
with check (
  exists (
    select 1
    from public.warranties warranty
    join public.profiles actor
      on actor.id = (select auth.uid())
     and actor.shop_id = warranty.shop_id
     and lower(coalesce(actor.role, '')) in (
       'owner',
       'admin',
       'manager',
       'parts'
     )
    where warranty.id = warranty_claims.warranty_id
  )
);

revoke all privileges on table public.apps
  from public, anon, authenticated;
revoke all privileges on table public.part_stock_summary
  from public, anon, authenticated;
revoke all privileges on table public.parts_barcodes
  from public, anon, authenticated;
revoke all privileges on table public.shop_profiles
  from public, anon, authenticated;
revoke all privileges on table public.warranties
  from public, anon, authenticated;
revoke all privileges on table public.warranty_claims
  from public, anon, authenticated;
revoke all privileges on table public.widgets
  from public, anon, authenticated;

grant select on table public.apps to authenticated;
grant select on table public.part_stock_summary to authenticated;
grant select, insert, update on table public.parts_barcodes to authenticated;
grant select, insert, update on table public.shop_profiles to authenticated;
grant select, insert, update on table public.warranties to authenticated;
grant select, insert, update on table public.warranty_claims to authenticated;
grant select on table public.widgets to authenticated;

-- Preserve the explicit service boundary used by server-only workflows. RLS
-- remains a client boundary; service-role callers must still authenticate and
-- authorize before using these grants.
grant all privileges on table public.apps to service_role;
grant all privileges on table public.part_stock_summary to service_role;
grant all privileges on table public.parts_barcodes to service_role;
grant all privileges on table public.shop_profiles to service_role;
grant all privileges on table public.warranties to service_role;
grant all privileges on table public.warranty_claims to service_role;
grant all privileges on table public.widgets to service_role;
