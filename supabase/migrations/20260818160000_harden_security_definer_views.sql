-- Production hardening: remove unintended anonymous/cross-tenant access through
-- public views that currently execute with the view owner's privileges.
--
-- Several of the audited views are production-only legacy objects that are
-- intentionally not part of the clean-replay migration chain. Harden them when
-- present without making a fresh database depend on unreconciled legacy schema.
-- Baseline-owned views remain required and are hardened directly below.

do $$
declare
  v_relation text;
begin
  foreach v_relation in array array[
    'ai_training_events_v',
    'stock_balances',
    'v_vehicle_service_history',
    'v_parts_reconciliation',
    'v_global_saved_menu_items',
    'v_video_performance_summary',
    'v_top_content_types_by_shop'
  ]
  loop
    if to_regclass(format('public.%I', v_relation)) is null then
      continue;
    end if;

    execute format(
      'alter view public.%I set (security_invoker = true)',
      v_relation
    );
    execute format(
      'revoke all on table public.%I from public, anon, authenticated',
      v_relation
    );
    execute format(
      'grant select on table public.%I to authenticated',
      v_relation
    );
  end loop;
end
$$;

-- v_shift_rollups is owned by the ordered baseline and therefore must exist on
-- both clean replay and production.
alter view public.v_shift_rollups set (security_invoker = true);
revoke all on table public.v_shift_rollups from public, anon, authenticated;
grant select on table public.v_shift_rollups to authenticated;

-- Reviews are intentionally public, and the base table already has a public
-- SELECT RLS policy limited to published (`is_public = true`) reviews.
alter view public.shop_reviews_public set (security_invoker = true);
revoke all on table public.shop_reviews_public from public, anon, authenticated;
grant select on table public.shop_reviews_public to anon, authenticated;

-- Shop public profiles are an intentionally sanitized public projection. The
-- base `shops` table has no anon SELECT policy, so converting this one view to
-- security_invoker would break the public shop-profile surface. Keep the
-- projection behavior but remove every DML privilege and expose SELECT only.
revoke all on table public.shop_public_profiles from public, anon, authenticated;
grant select on table public.shop_public_profiles to anon, authenticated;

-- Fail the migration during clean replay if a future baseline/default grant
-- causes any present boundary to regress. Production-only legacy views are
-- checked when present and skipped when absent on clean replay.
do $$
declare
  v_relation text;
  v_reloptions text[];
begin
  foreach v_relation in array array[
    'ai_training_events_v',
    'stock_balances',
    'v_shift_rollups',
    'v_vehicle_service_history',
    'v_parts_reconciliation',
    'v_global_saved_menu_items',
    'v_video_performance_summary',
    'v_top_content_types_by_shop'
  ]
  loop
    if to_regclass(format('public.%I', v_relation)) is null then
      continue;
    end if;

    select c.reloptions
      into v_reloptions
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = v_relation;

    if not (
      coalesce(v_reloptions, '{}'::text[])
      @> array['security_invoker=true']
    ) then
      raise exception
        'security hardening failed: public.% is not security-invoker',
        v_relation;
    end if;

    if has_table_privilege('anon', 'public.' || v_relation, 'SELECT')
       or has_table_privilege('anon', 'public.' || v_relation, 'INSERT')
       or has_table_privilege('anon', 'public.' || v_relation, 'UPDATE')
       or has_table_privilege('anon', 'public.' || v_relation, 'DELETE') then
      raise exception
        'security hardening failed: anon retains access to public.%',
        v_relation;
    end if;

    if not has_table_privilege(
      'authenticated',
      'public.' || v_relation,
      'SELECT'
    )
       or has_table_privilege(
         'authenticated',
         'public.' || v_relation,
         'INSERT'
       )
       or has_table_privilege(
         'authenticated',
         'public.' || v_relation,
         'UPDATE'
       )
       or has_table_privilege(
         'authenticated',
         'public.' || v_relation,
         'DELETE'
       ) then
      raise exception
        'security hardening failed: authenticated privilege contract changed for public.%',
        v_relation;
    end if;

    if not has_table_privilege(
      'service_role',
      'public.' || v_relation,
      'SELECT'
    ) then
      raise exception
        'security hardening failed: service_role lost SELECT on public.%',
        v_relation;
    end if;
  end loop;

  select c.reloptions
    into v_reloptions
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'shop_reviews_public';

  if not (
    coalesce(v_reloptions, '{}'::text[])
    @> array['security_invoker=true']
  ) then
    raise exception
      'security hardening failed: shop_reviews_public is not security-invoker';
  end if;

  if not has_table_privilege('anon', 'public.shop_reviews_public', 'SELECT')
     or has_table_privilege('anon', 'public.shop_reviews_public', 'INSERT')
     or has_table_privilege('anon', 'public.shop_reviews_public', 'UPDATE')
     or has_table_privilege('anon', 'public.shop_reviews_public', 'DELETE')
     or not has_table_privilege(
       'authenticated',
       'public.shop_reviews_public',
       'SELECT'
     )
     or has_table_privilege(
       'authenticated',
       'public.shop_reviews_public',
       'INSERT'
     )
     or has_table_privilege(
       'authenticated',
       'public.shop_reviews_public',
       'UPDATE'
     )
     or has_table_privilege(
       'authenticated',
       'public.shop_reviews_public',
       'DELETE'
     ) then
    raise exception
      'security hardening failed: shop_reviews_public privilege contract changed';
  end if;

  if not has_table_privilege('anon', 'public.shop_public_profiles', 'SELECT')
     or has_table_privilege('anon', 'public.shop_public_profiles', 'INSERT')
     or has_table_privilege('anon', 'public.shop_public_profiles', 'UPDATE')
     or has_table_privilege('anon', 'public.shop_public_profiles', 'DELETE')
     or not has_table_privilege(
       'authenticated',
       'public.shop_public_profiles',
       'SELECT'
     )
     or has_table_privilege(
       'authenticated',
       'public.shop_public_profiles',
       'INSERT'
     )
     or has_table_privilege(
       'authenticated',
       'public.shop_public_profiles',
       'UPDATE'
     )
     or has_table_privilege(
       'authenticated',
       'public.shop_public_profiles',
       'DELETE'
     ) then
    raise exception
      'security hardening failed: shop_public_profiles privilege contract changed';
  end if;
end
$$;
