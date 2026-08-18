-- Production hardening: remove unintended anonymous/cross-tenant access through
-- public views that currently execute with the view owner's privileges.
--
-- Internal views become security-invoker so their base-table RLS policies are
-- enforced for the calling user. Public-facing views retain only the minimum
-- read grants required by their intended surface.

alter view public.ai_training_events_v set (security_invoker = true);
alter view public.stock_balances set (security_invoker = true);
alter view public.v_shift_rollups set (security_invoker = true);
alter view public.v_vehicle_service_history set (security_invoker = true);
alter view public.v_parts_reconciliation set (security_invoker = true);
alter view public.v_global_saved_menu_items set (security_invoker = true);
alter view public.v_video_performance_summary set (security_invoker = true);
alter view public.v_top_content_types_by_shop set (security_invoker = true);
alter view public.shop_reviews_public set (security_invoker = true);

-- Internal/authenticated views: never expose them to anon. Authenticated reads
-- are permitted, but security_invoker ensures the underlying RLS policies
-- determine which rows are visible.
revoke all on table public.ai_training_events_v from public, anon, authenticated;
revoke all on table public.stock_balances from public, anon, authenticated;
revoke all on table public.v_shift_rollups from public, anon, authenticated;
revoke all on table public.v_vehicle_service_history from public, anon, authenticated;
revoke all on table public.v_parts_reconciliation from public, anon, authenticated;
revoke all on table public.v_global_saved_menu_items from public, anon, authenticated;
revoke all on table public.v_video_performance_summary from public, anon, authenticated;
revoke all on table public.v_top_content_types_by_shop from public, anon, authenticated;

grant select on table public.ai_training_events_v to authenticated;
grant select on table public.stock_balances to authenticated;
grant select on table public.v_shift_rollups to authenticated;
grant select on table public.v_vehicle_service_history to authenticated;
grant select on table public.v_parts_reconciliation to authenticated;
grant select on table public.v_global_saved_menu_items to authenticated;
grant select on table public.v_video_performance_summary to authenticated;
grant select on table public.v_top_content_types_by_shop to authenticated;

-- Reviews are intentionally public, and the base table already has a public
-- SELECT RLS policy limited to published (`is_public = true`) reviews.
revoke all on table public.shop_reviews_public from public, anon, authenticated;
grant select on table public.shop_reviews_public to anon, authenticated;

-- Shop public profiles are an intentionally sanitized public projection. The
-- base `shops` table has no anon SELECT policy, so converting this one view to
-- security_invoker would break the public shop-profile surface. Keep the
-- projection behavior but remove every DML privilege and expose SELECT only.
revoke all on table public.shop_public_profiles from public, anon, authenticated;
grant select on table public.shop_public_profiles to anon, authenticated;

-- Fail the migration during clean replay if a future baseline/default grant
-- causes any of these boundaries to regress.
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
