\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '11000000-0000-4000-8000-000000000001',
    'p0-001-owner-a@example.com',
    '{"full_name":"P0-001 Owner A"}'::jsonb
  ),
  (
    '22000000-0000-4000-8000-000000000002',
    'p0-001-owner-b@example.com',
    '{"full_name":"P0-001 Owner B"}'::jsonb
  ),
  (
    '33000000-0000-4000-8000-000000000003',
    'p0-001-tech-a@example.com',
    '{"full_name":"P0-001 Tech A"}'::jsonb
  )
on conflict (id) do nothing;

insert into public.profiles (id, user_id, role, full_name)
values
  (
    '11000000-0000-4000-8000-000000000001',
    '11000000-0000-4000-8000-000000000001',
    'owner',
    'P0-001 Owner A'
  ),
  (
    '22000000-0000-4000-8000-000000000002',
    '22000000-0000-4000-8000-000000000002',
    'owner',
    'P0-001 Owner B'
  ),
  (
    '33000000-0000-4000-8000-000000000003',
    '33000000-0000-4000-8000-000000000003',
    'tech',
    'P0-001 Tech A'
  )
on conflict (id) do update
set user_id = excluded.user_id,
    role = excluded.role,
    full_name = excluded.full_name;

insert into public.shops (id, owner_id, business_name, name)
values
  (
    'a1000000-0000-4000-8000-000000000001',
    '11000000-0000-4000-8000-000000000001',
    'P0-001 Shop A',
    'P0-001 Shop A'
  ),
  (
    'b2000000-0000-4000-8000-000000000002',
    '22000000-0000-4000-8000-000000000002',
    'P0-001 Shop B',
    'P0-001 Shop B'
  )
on conflict (id) do nothing;

update public.profiles
set shop_id = case id
  when '22000000-0000-4000-8000-000000000002'::uuid
    then 'b2000000-0000-4000-8000-000000000002'::uuid
  else 'a1000000-0000-4000-8000-000000000001'::uuid
end
where id in (
  '11000000-0000-4000-8000-000000000001',
  '22000000-0000-4000-8000-000000000002',
  '33000000-0000-4000-8000-000000000003'
);

insert into public.parts (id, shop_id, name, part_number, sku)
values
  (
    'a1100000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001',
    'P0-001 Part A',
    'P0-001-A',
    'P0-001-A'
  ),
  (
    'b2200000-0000-4000-8000-000000000002',
    'b2000000-0000-4000-8000-000000000002',
    'P0-001 Part B',
    'P0-001-B',
    'P0-001-B'
  );

insert into public.stock_locations (id, shop_id, code, name)
values
  (
    'a1200000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001',
    'P0A',
    'P0-001 Location A'
  ),
  (
    'b2300000-0000-4000-8000-000000000002',
    'b2000000-0000-4000-8000-000000000002',
    'P0B',
    'P0-001 Location B'
  );

insert into public.part_stock_summary (
  part_id,
  location_id,
  shop_id,
  qty_on_hand,
  qty_reserved
) values
  (
    'a1100000-0000-4000-8000-000000000001',
    'a1200000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001',
    5,
    1
  ),
  (
    'b2200000-0000-4000-8000-000000000002',
    'b2300000-0000-4000-8000-000000000002',
    'b2000000-0000-4000-8000-000000000002',
    7,
    2
  );

insert into public.parts_barcodes (id, shop_id, part_id, barcode)
values
  (
    'a1300000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001',
    'a1100000-0000-4000-8000-000000000001',
    'P0001-A'
  ),
  (
    'b2400000-0000-4000-8000-000000000002',
    'b2000000-0000-4000-8000-000000000002',
    'b2200000-0000-4000-8000-000000000002',
    'P0001-B'
  );

insert into public.shop_profiles (shop_id, email, phone, tagline)
values
  (
    'a1000000-0000-4000-8000-000000000001',
    'private-a@example.com',
    '555-0101',
    'Shop A'
  ),
  (
    'b2000000-0000-4000-8000-000000000002',
    'private-b@example.com',
    '555-0202',
    'Shop B'
  );

insert into public.warranties (
  id,
  shop_id,
  part_id,
  installed_at,
  expires_at
) values
  (
    'a1400000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001',
    'a1100000-0000-4000-8000-000000000001',
    now(),
    now() + interval '12 months'
  ),
  (
    'b2500000-0000-4000-8000-000000000002',
    'b2000000-0000-4000-8000-000000000002',
    'b2200000-0000-4000-8000-000000000002',
    now(),
    now() + interval '12 months'
  );

insert into public.warranty_claims (id, warranty_id, status, notes)
values
  (
    'a1500000-0000-4000-8000-000000000001',
    'a1400000-0000-4000-8000-000000000001',
    'open',
    'Private claim A'
  ),
  (
    'b2600000-0000-4000-8000-000000000002',
    'b2500000-0000-4000-8000-000000000002',
    'open',
    'Private claim B'
  );

insert into public.apps (id, slug, name, default_route)
values (
  'cc000000-0000-4000-8000-000000000001',
  'p0-001-runtime-app',
  'P0-001 Runtime App',
  '/p0-001'
);

insert into public.widgets (id, slug, name, default_route)
values (
  'dd000000-0000-4000-8000-000000000001',
  'p0-001-runtime-widget',
  'P0-001 Runtime Widget',
  '/p0-001'
);

do $$
declare
  v_relation text;
  v_relkind "char";
  v_rls_enabled boolean;
  v_rls_forced boolean;
  v_reloptions text[];
begin
  foreach v_relation in array array[
    'apps',
    'parts_barcodes',
    'shop_profiles',
    'warranties',
    'warranty_claims',
    'widgets'
  ]
  loop
    select c.relrowsecurity, c.relforcerowsecurity
      into v_rls_enabled, v_rls_forced
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n
      on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = v_relation;

    if not coalesce(v_rls_enabled, false)
       or not coalesce(v_rls_forced, false) then
      raise exception
        'P0-001 runtime assertion failed: %.% is not forced-RLS',
        'public',
        v_relation;
    end if;
  end loop;

  select c.relkind, c.relrowsecurity, c.relforcerowsecurity, c.reloptions
    into v_relkind, v_rls_enabled, v_rls_forced, v_reloptions
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n
    on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'part_stock_summary';

  if v_relkind in ('r', 'p') then
    if not coalesce(v_rls_enabled, false)
       or not coalesce(v_rls_forced, false) then
      raise exception
        'P0-001 runtime assertion failed: part_stock_summary table is not forced-RLS';
    end if;
  elsif v_relkind = 'v' then
    if not (
      coalesce(v_reloptions, '{}'::text[])
      @> array['security_invoker=true']
    ) then
      raise exception
        'P0-001 runtime assertion failed: part_stock_summary view is not security-invoker';
    end if;
  else
    raise exception
      'P0-001 runtime assertion failed: unsupported part_stock_summary relkind %',
      v_relkind;
  end if;
end
$$;

do $$
declare
  v_relation text;
begin
  foreach v_relation in array array[
    'apps',
    'part_stock_summary',
    'parts_barcodes',
    'shop_profiles',
    'warranties',
    'warranty_claims',
    'widgets'
  ]
  loop
    if has_table_privilege('anon', 'public.' || v_relation, 'SELECT')
       or has_table_privilege('anon', 'public.' || v_relation, 'INSERT')
       or has_table_privilege('anon', 'public.' || v_relation, 'UPDATE')
       or has_table_privilege('anon', 'public.' || v_relation, 'DELETE') then
      raise exception
        'P0-001 runtime assertion failed: anon retains privileges on %',
        v_relation;
    end if;
  end loop;

  if not has_table_privilege('authenticated', 'public.apps', 'SELECT')
     or has_table_privilege('authenticated', 'public.apps', 'INSERT')
     or not has_table_privilege(
       'authenticated',
       'public.part_stock_summary',
       'SELECT'
     )
     or has_table_privilege(
       'authenticated',
       'public.part_stock_summary',
       'INSERT'
     )
     or not has_table_privilege(
       'authenticated',
       'public.parts_barcodes',
       'SELECT'
     )
     or not has_table_privilege(
       'authenticated',
       'public.parts_barcodes',
       'INSERT'
     )
     or not has_table_privilege(
       'authenticated',
       'public.parts_barcodes',
       'UPDATE'
     )
     or has_table_privilege(
       'authenticated',
       'public.parts_barcodes',
       'DELETE'
     )
     or not has_table_privilege(
       'authenticated',
       'public.shop_profiles',
       'SELECT'
     )
     or not has_table_privilege(
       'authenticated',
       'public.shop_profiles',
       'INSERT'
     )
     or not has_table_privilege(
       'authenticated',
       'public.shop_profiles',
       'UPDATE'
     )
     or has_table_privilege(
       'authenticated',
       'public.shop_profiles',
       'DELETE'
     )
     or not has_table_privilege(
       'authenticated',
       'public.warranties',
       'SELECT'
     )
     or not has_table_privilege(
       'authenticated',
       'public.warranties',
       'INSERT'
     )
     or not has_table_privilege(
       'authenticated',
       'public.warranties',
       'UPDATE'
     )
     or has_table_privilege(
       'authenticated',
       'public.warranties',
       'DELETE'
     )
     or not has_table_privilege(
       'authenticated',
       'public.warranty_claims',
       'SELECT'
     )
     or not has_table_privilege(
       'authenticated',
       'public.warranty_claims',
       'INSERT'
     )
     or not has_table_privilege(
       'authenticated',
       'public.warranty_claims',
       'UPDATE'
     )
     or has_table_privilege(
       'authenticated',
       'public.warranty_claims',
       'DELETE'
     )
     or not has_table_privilege('authenticated', 'public.widgets', 'SELECT')
     or has_table_privilege('authenticated', 'public.widgets', 'INSERT') then
    raise exception
      'P0-001 runtime assertion failed: authenticated privilege contract changed';
  end if;

  foreach v_relation in array array[
    'apps',
    'part_stock_summary',
    'parts_barcodes',
    'shop_profiles',
    'warranties',
    'warranty_claims',
    'widgets'
  ]
  loop
    if not has_table_privilege(
      'service_role',
      'public.' || v_relation,
      'SELECT'
    ) then
      raise exception
        'P0-001 runtime assertion failed: service_role lost SELECT on %',
        v_relation;
    end if;
  end loop;
end
$$;

create temp table p0_001_public_view_result (
  visible_rows bigint not null
);
grant insert, select on table p0_001_public_view_result to anon;

create function pg_temp.expect_anon_select_denied(p_relation regclass)
returns void
language plpgsql
as $$
begin
  begin
    execute format('select 1 from %s limit 1', p_relation);
  exception when insufficient_privilege then
    return;
  end;

  raise exception
    'P0-001 runtime assertion failed: anon selected from %',
    p_relation;
end;
$$;

set local role anon;
insert into p0_001_public_view_result
select count(*)
from public.shop_public_profiles
where id in (
  'a1000000-0000-4000-8000-000000000001',
  'b2000000-0000-4000-8000-000000000002'
);
select pg_temp.expect_anon_select_denied('public.apps');
select pg_temp.expect_anon_select_denied('public.part_stock_summary');
select pg_temp.expect_anon_select_denied('public.parts_barcodes');
select pg_temp.expect_anon_select_denied('public.shop_profiles');
select pg_temp.expect_anon_select_denied('public.warranties');
select pg_temp.expect_anon_select_denied('public.warranty_claims');
select pg_temp.expect_anon_select_denied('public.widgets');
reset role;

do $$
begin
  if not exists (
    select 1
    from p0_001_public_view_result
    where visible_rows = 2
  ) then
    raise exception
      'P0-001 runtime assertion failed: safe public shop view regressed';
  end if;
end
$$;

create temp table p0_001_service_result (
  visible_rows bigint not null
);
grant insert, select on table p0_001_service_result to service_role;

set local role service_role;
insert into p0_001_service_result
select count(*)
from public.warranty_claims
where id in (
  'a1500000-0000-4000-8000-000000000001',
  'b2600000-0000-4000-8000-000000000002'
);
reset role;

do $$
begin
  if not exists (
    select 1
    from p0_001_service_result
    where visible_rows = 2
  ) then
    raise exception
      'P0-001 runtime assertion failed: service-role tenant bypass regressed';
  end if;
end
$$;

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  '11000000-0000-4000-8000-000000000001',
  true
);

create temp table p0_001_read_results (
  relation_name text primary key,
  visible_rows bigint not null
);
grant select, insert on table p0_001_read_results to authenticated;

set local role authenticated;
insert into p0_001_read_results
values
  (
    'apps',
    (
      select count(*)
      from public.apps
      where slug = 'p0-001-runtime-app'
    )
  ),
  (
    'part_stock_summary',
    (
      select count(*)
      from public.part_stock_summary
      where shop_id in (
        'a1000000-0000-4000-8000-000000000001',
        'b2000000-0000-4000-8000-000000000002'
      )
    )
  ),
  (
    'parts_barcodes',
    (
      select count(*)
      from public.parts_barcodes
      where barcode in ('P0001-A', 'P0001-B')
    )
  ),
  (
    'shop_profiles',
    (
      select count(*)
      from public.shop_profiles
      where shop_id in (
        'a1000000-0000-4000-8000-000000000001',
        'b2000000-0000-4000-8000-000000000002'
      )
    )
  ),
  (
    'warranties',
    (
      select count(*)
      from public.warranties
      where id in (
        'a1400000-0000-4000-8000-000000000001',
        'b2500000-0000-4000-8000-000000000002'
      )
    )
  ),
  (
    'warranty_claims',
    (
      select count(*)
      from public.warranty_claims
      where id in (
        'a1500000-0000-4000-8000-000000000001',
        'b2600000-0000-4000-8000-000000000002'
      )
    )
  ),
  (
    'widgets',
    (
      select count(*)
      from public.widgets
      where slug = 'p0-001-runtime-widget'
    )
  );
reset role;

do $$
begin
  if exists (
    select 1
    from p0_001_read_results
    where visible_rows <> 1
  ) then
    raise exception
      'P0-001 runtime assertion failed: actor A read boundary results %',
      (
        select jsonb_object_agg(relation_name, visible_rows)
        from p0_001_read_results
      );
  end if;
end
$$;

-- Verify the policies allow the intended same-shop owner workflows.
set local role authenticated;
insert into public.parts_barcodes (id, shop_id, part_id, barcode)
values (
  'a1600000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'a1100000-0000-4000-8000-000000000001',
  'P0001-A-OWNER'
);

update public.shop_profiles
set tagline = 'Owner A updated'
where shop_id = 'a1000000-0000-4000-8000-000000000001';

insert into public.warranties (
  id,
  shop_id,
  part_id,
  installed_at,
  expires_at
) values (
  'a1700000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'a1100000-0000-4000-8000-000000000001',
  now(),
  now() + interval '12 months'
);

update public.warranty_claims
set notes = 'Owner A updated'
where id = 'a1500000-0000-4000-8000-000000000001';
reset role;

create function pg_temp.expect_protected_insert_denied(
  p_target text
) returns void
language plpgsql
as $$
begin
  begin
    if p_target = 'parts_barcodes' then
      insert into public.parts_barcodes (id, shop_id, part_id, barcode)
      values (
        'b2700000-0000-4000-8000-000000000002',
        'a1000000-0000-4000-8000-000000000001',
        'a1100000-0000-4000-8000-000000000001',
        'P0001-CROSS-SHOP'
      );
    elsif p_target = 'warranties' then
      insert into public.warranties (
        id,
        shop_id,
        part_id,
        installed_at,
        expires_at
      ) values (
        'b2800000-0000-4000-8000-000000000002',
        'a1000000-0000-4000-8000-000000000001',
        'a1100000-0000-4000-8000-000000000001',
        now(),
        now() + interval '12 months'
      );
    elsif p_target = 'warranty_claims' then
      insert into public.warranty_claims (id, warranty_id, status)
      values (
        'b2900000-0000-4000-8000-000000000002',
        'a1400000-0000-4000-8000-000000000001',
        'open'
      );
    else
      raise exception 'Unknown P0-001 target %', p_target;
    end if;
  exception when insufficient_privilege then
    return;
  end;

  raise exception
    'P0-001 runtime assertion failed: protected insert succeeded for %',
    p_target;
end;
$$;

create function pg_temp.expect_disallowed_updates_hidden()
returns void
language plpgsql
as $$
declare
  v_rows bigint;
begin
  update public.shop_profiles
  set tagline = 'Cross-shop overwrite'
  where shop_id = 'a1000000-0000-4000-8000-000000000001';
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception
      'P0-001 runtime assertion failed: cross-shop shop profile updated';
  end if;

  update public.warranty_claims
  set notes = 'Cross-shop overwrite'
  where id = 'a1500000-0000-4000-8000-000000000001';
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception
      'P0-001 runtime assertion failed: cross-shop warranty claim updated';
  end if;
end;
$$;

-- Same-shop technicians may read operational records but cannot mutate
-- inventory, warranty, or private shop-profile configuration.
select set_config(
  'request.jwt.claim.sub',
  '33000000-0000-4000-8000-000000000003',
  true
);

set local role authenticated;
select pg_temp.expect_protected_insert_denied('parts_barcodes');
select pg_temp.expect_protected_insert_denied('warranties');
select pg_temp.expect_protected_insert_denied('warranty_claims');
select pg_temp.expect_disallowed_updates_hidden();
reset role;

select set_config(
  'request.jwt.claim.sub',
  '22000000-0000-4000-8000-000000000002',
  true
);

set local role authenticated;
select pg_temp.expect_protected_insert_denied('parts_barcodes');
select pg_temp.expect_protected_insert_denied('warranties');
select pg_temp.expect_protected_insert_denied('warranty_claims');
select pg_temp.expect_disallowed_updates_hidden();
reset role;

do $$
begin
  if exists (
    select 1
    from public.parts_barcodes
    where id = 'b2700000-0000-4000-8000-000000000002'
  )
  or exists (
    select 1
    from public.warranties
    where id = 'b2800000-0000-4000-8000-000000000002'
  )
  or exists (
    select 1
    from public.warranty_claims
    where id = 'b2900000-0000-4000-8000-000000000002'
  )
  or exists (
    select 1
    from public.shop_profiles
    where shop_id = 'a1000000-0000-4000-8000-000000000001'
      and tagline = 'Cross-shop overwrite'
  )
  or exists (
    select 1
    from public.warranty_claims
    where id = 'a1500000-0000-4000-8000-000000000001'
      and notes = 'Cross-shop overwrite'
  ) then
    raise exception
      'P0-001 runtime assertion failed: a denied cross-shop mutation persisted';
  end if;
end
$$;

select 'p0_001_relation_boundaries_runtime_ok' as result;

rollback;
