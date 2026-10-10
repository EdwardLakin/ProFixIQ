-- Imported inspection templates carry their service's labor.
--
-- The work-order "Inspection templates" picker (and the line it creates) read
-- inspection_templates.labor_hours. The catalog import set labor on the menu
-- services but left it null on the templates, so every imported template showed
-- "Labor TBD" and added a line with no labor.
--
-- Additive only: one new function that wraps the existing import (the merged
-- import_service_catalog / import_service_catalog_with_parts are not modified)
-- and, in the same transaction, sets each linked template's labor from the
-- service that links to it. A template shared by several services takes the
-- first service's labor in file order.
--
-- A template's labor is only written when it is empty or was itself set by a
-- catalog import (form_context.import.labor_hours_source = 'catalog'), so a
-- labor value a user typed into the template is never overwritten.
--
-- The one-time backfill below fixes templates created by earlier imports. It is
-- deterministic and narrow: only templates created by the catalog importer
-- (form_context.import.source = 'service_catalog_csv') whose labor is still
-- empty, from the service that links to them.

create or replace function public.import_service_catalog_complete(
  p_shop_id uuid,
  p_actor_profile_id uuid,
  p_actor_auth_user_id uuid,
  p_source_ref text,
  p_templates jsonb,
  p_services jsonb,
  p_parts jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_labor_set integer := 0;
  v_catalog_labor_keys text[];
begin
  -- The wrapped import rewrites a template's whole import provenance, which
  -- would drop the labor_hours_source marker. Remember which templates had
  -- catalog-sourced labor before it runs. (Authorization is enforced by the
  -- wrapped import before anything is written; this read is shop-scoped.)
  select coalesce(array_agg(tpl.form_context -> 'import' ->> 'import_key'), '{}'::text[])
  into v_catalog_labor_keys
  from public.inspection_templates tpl
  where tpl.shop_id = p_shop_id
    and tpl.form_context -> 'import' ->> 'labor_hours_source' = 'catalog';

  -- Authorization, identity, validation and every catalog/parts write happen in
  -- the wrapped functions; any failure rolls back this whole call.
  v_result := public.import_service_catalog_with_parts(
    p_shop_id, p_actor_profile_id, p_actor_auth_user_id, p_source_ref, p_templates, p_services, p_parts
  );

  with src as (
    select distinct on (template_key) template_key, labor_hours
    from (
      select
        nullif(trim(coalesce(e.obj ->> 'template_key', '')), '') as template_key,
        case when jsonb_typeof(e.obj -> 'labor_hours') = 'number' then (e.obj ->> 'labor_hours')::numeric end as labor_hours,
        e.n
      from jsonb_array_elements(coalesce(p_services, '[]'::jsonb)) with ordinality as e(obj, n)
    ) s
    where template_key is not null
      and labor_hours is not null
      and labor_hours >= 0
    order by template_key, n
  ),
  updated as (
    update public.inspection_templates tpl
    set labor_hours = src.labor_hours,
        form_context = jsonb_set(
          coalesce(tpl.form_context, '{}'::jsonb),
          '{import,labor_hours_source}',
          '"catalog"'::jsonb,
          true
        ),
        updated_at = now()
    from src
    where tpl.shop_id = p_shop_id
      and tpl.form_context -> 'import' ->> 'import_key' = src.template_key
      and (
        tpl.labor_hours is null
        or (tpl.form_context -> 'import' ->> 'import_key') = any (v_catalog_labor_keys)
      )
    returning tpl.id
  )
  select count(*)::integer into v_labor_set from updated;

  return v_result || jsonb_build_object('templatesLaborSet', v_labor_set);
end;
$$;

revoke all on function public.import_service_catalog_complete(uuid, uuid, uuid, text, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.import_service_catalog_complete(uuid, uuid, uuid, text, jsonb, jsonb, jsonb) to authenticated, service_role;

comment on function public.import_service_catalog_complete(uuid, uuid, uuid, text, jsonb, jsonb, jsonb) is
  'Imports a confirmed service catalog with its parts and sets each linked inspection template''s labor from its service, in one transaction.';

-- One-time backfill for templates created by earlier catalog imports.
update public.inspection_templates tpl
set labor_hours = src.labor,
    form_context = jsonb_set(
      coalesce(tpl.form_context, '{}'::jsonb),
      '{import,labor_hours_source}',
      '"catalog"'::jsonb,
      true
    ),
    updated_at = now()
from (
  select distinct on (item.inspection_template_id)
    item.inspection_template_id,
    coalesce(item.labor_time, item.labor_hours) as labor
  from public.menu_items item
  where item.source = 'service_catalog_import'
    and item.inspection_template_id is not null
    and coalesce(item.labor_time, item.labor_hours) is not null
  order by item.inspection_template_id, item.created_at
) src
where tpl.id = src.inspection_template_id
  and tpl.labor_hours is null
  and tpl.form_context -> 'import' ->> 'source' = 'service_catalog_csv';
