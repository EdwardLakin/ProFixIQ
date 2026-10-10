-- Atomic, idempotent service-catalog import.
--
-- Additive only: one new function. Templates, services and their links are
-- written in a single transaction, so a failure part-way through leaves no
-- partial catalog behind. Identity is shop-scoped and independent of the
-- upload: services reconcile on menu_items.service_key, templates on the
-- import key recorded in form_context.import (falling back to the catalog
-- import tag + name when a user has since edited the template).
--
-- Invariants mirror create_menu_item_with_parts_intake: services are created
-- active, labor_time and labor_hours are written together, the linked
-- inspection must belong to the shop, and the actor must be a shop member.
-- Imported templates are owned by the acting user (user_id) so they appear in
-- "My Templates" and can be edited/deleted under the existing RLS policies.

create or replace function public.import_service_catalog(
  p_shop_id uuid,
  p_actor_profile_id uuid,
  p_actor_auth_user_id uuid,
  p_source_ref text,
  p_templates jsonb,
  p_services jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype;
  v_labor_rate numeric := 0;
  v_tpl record;
  v_svc record;
  v_template_id uuid;
  v_existing_template_id uuid;
  v_menu_id uuid;
  v_template_ids jsonb := '{}'::jsonb;
  v_link_id uuid;
  v_price numeric;
  v_templates_created integer := 0;
  v_templates_updated integer := 0;
  v_services_created integer := 0;
  v_services_updated integer := 0;
  v_links integer := 0;
  v_provenance jsonb;
begin
  if p_shop_id is null or p_actor_profile_id is null or p_actor_auth_user_id is null then
    raise exception 'Shop, actor, and auth user are required';
  end if;

  select * into v_actor
  from public.profiles p
  where p.id = p_actor_profile_id
    and p.shop_id = p_shop_id
    and (p.id = p_actor_auth_user_id or p.user_id = p_actor_auth_user_id);

  if not found then
    raise exception 'Actor is not a member of this shop';
  end if;

  if auth.uid() is not null and auth.uid() <> p_actor_auth_user_id then
    raise exception 'Actor identity mismatch';
  end if;

  if lower(coalesce(v_actor.role::text, '')) not in ('owner', 'admin', 'manager') then
    raise exception 'Not authorized to import a service catalog';
  end if;

  if coalesce(jsonb_typeof(p_templates), 'array') <> 'array'
     or coalesce(jsonb_typeof(p_services), 'array') <> 'array' then
    raise exception 'Templates and services must be JSON arrays';
  end if;
  if jsonb_array_length(coalesce(p_services, '[]'::jsonb)) > 1000
     or jsonb_array_length(coalesce(p_templates, '[]'::jsonb)) > 500 then
    raise exception 'Catalog is too large to import at once';
  end if;

  -- One catalog import per shop at a time; concurrent re-uploads serialize.
  perform pg_advisory_xact_lock(hashtext('service_catalog_import:' || p_shop_id::text));

  select greatest(0, coalesce(shop.labor_rate, 0)) into v_labor_rate
  from public.shops shop
  where shop.id = p_shop_id;
  if not found then
    raise exception 'Shop not found';
  end if;

  -- 1) Inspection templates first, so services can reference them.
  for v_tpl in
    select
      trim(coalesce(t.import_key, '')) as import_key,
      trim(coalesce(t.name, '')) as name,
      nullif(trim(coalesce(t.description, '')), '') as description,
      nullif(trim(coalesce(t.vehicle_type, '')), '') as vehicle_type,
      t.sections
    from jsonb_to_recordset(coalesce(p_templates, '[]'::jsonb)) as t(
      import_key text,
      name text,
      description text,
      vehicle_type text,
      sections jsonb
    )
  loop
    if v_tpl.import_key = '' or v_tpl.name = '' then
      raise exception 'Every inspection template needs a key and a name';
    end if;
    if char_length(v_tpl.name) > 180 then
      raise exception 'Inspection template name is too long: %', v_tpl.name;
    end if;
    -- The inspection runtime consumes a plain array of { title, items[] }.
    if jsonb_typeof(v_tpl.sections) <> 'array' or jsonb_array_length(v_tpl.sections) = 0 then
      raise exception 'Inspection template % needs at least one checklist section', v_tpl.name;
    end if;

    v_provenance := jsonb_build_object(
      'import', jsonb_build_object(
        'source', 'service_catalog_csv',
        'import_key', v_tpl.import_key,
        'source_ref', p_source_ref,
        'imported_at', now()
      )
    );

    select tpl.id into v_existing_template_id
    from public.inspection_templates tpl
    where tpl.shop_id = p_shop_id
      and (
        tpl.form_context -> 'import' ->> 'import_key' = v_tpl.import_key
        or (
          coalesce('catalog_import' = any (tpl.tags), false)
          and lower(tpl.template_name) = lower(v_tpl.name)
        )
      )
    order by tpl.created_at
    limit 1;

    if v_existing_template_id is null then
      insert into public.inspection_templates (
        shop_id, user_id, template_name, description, vehicle_type,
        sections, tags, is_public, form_context
      ) values (
        p_shop_id, p_actor_auth_user_id, v_tpl.name, v_tpl.description, v_tpl.vehicle_type,
        v_tpl.sections, array['catalog_import'], false, v_provenance
      )
      returning id into v_template_id;
      v_templates_created := v_templates_created + 1;
    else
      update public.inspection_templates tpl
      set template_name = v_tpl.name,
          description = v_tpl.description,
          vehicle_type = v_tpl.vehicle_type,
          sections = v_tpl.sections,
          form_context = coalesce(tpl.form_context, '{}'::jsonb) || v_provenance,
          tags = (
            select array_agg(distinct tag)
            from unnest(coalesce(tpl.tags, '{}') || array['catalog_import']) as tag
          ),
          updated_at = now()
      where tpl.id = v_existing_template_id
      returning tpl.id into v_template_id;
      v_templates_updated := v_templates_updated + 1;
    end if;

    v_template_ids := v_template_ids || jsonb_build_object(v_tpl.import_key, v_template_id);
  end loop;

  -- 2) Services, linked to the templates written above.
  for v_svc in
    select
      trim(coalesce(s.service_key, '')) as service_key,
      trim(coalesce(s.name, '')) as name,
      nullif(trim(coalesce(s.description, '')), '') as description,
      nullif(trim(coalesce(s.category, '')), '') as category,
      s.labor_hours,
      s.price,
      nullif(trim(coalesce(s.template_key, '')), '') as template_key
    from jsonb_to_recordset(coalesce(p_services, '[]'::jsonb)) as s(
      service_key text,
      name text,
      description text,
      category text,
      labor_hours numeric,
      price numeric,
      template_key text
    )
  loop
    if v_svc.service_key = '' or v_svc.name = '' then
      raise exception 'Every service needs a key and a name';
    end if;
    if char_length(v_svc.name) > 180 then
      raise exception 'Service name is too long: %', v_svc.name;
    end if;
    if v_svc.labor_hours is not null and (v_svc.labor_hours < 0 or v_svc.labor_hours > 24) then
      raise exception 'Labor hours out of range for service %', v_svc.name;
    end if;
    if v_svc.price is not null and v_svc.price < 0 then
      raise exception 'Price cannot be negative for service %', v_svc.name;
    end if;

    v_link_id := null;
    if v_svc.template_key is not null then
      v_link_id := nullif(v_template_ids ->> v_svc.template_key, '')::uuid;
      if v_link_id is null then
        raise exception 'Service % references an unknown inspection template', v_svc.name;
      end if;
    end if;

    v_price := coalesce(v_svc.price, case when v_svc.labor_hours is not null then v_svc.labor_hours * v_labor_rate end);

    select item.id into v_menu_id
    from public.menu_items item
    where item.shop_id = p_shop_id
      and item.service_key = v_svc.service_key
    order by item.created_at
    limit 1;

    if v_menu_id is null then
      insert into public.menu_items (
        shop_id, user_id, name, description, category,
        labor_time, labor_hours, total_price,
        inspection_template_id, is_active, source, service_key
      ) values (
        p_shop_id, p_actor_auth_user_id, v_svc.name, v_svc.description, v_svc.category,
        v_svc.labor_hours, v_svc.labor_hours, v_price,
        v_link_id, true, 'service_catalog_import', v_svc.service_key
      );
      v_services_created := v_services_created + 1;
    else
      -- Re-import reconciles the existing service; activation state is the
      -- shop's to manage, so is_active is left as it is.
      update public.menu_items item
      set name = v_svc.name,
          description = v_svc.description,
          category = v_svc.category,
          labor_time = v_svc.labor_hours,
          labor_hours = v_svc.labor_hours,
          total_price = v_price,
          inspection_template_id = v_link_id
      where item.id = v_menu_id;
      v_services_updated := v_services_updated + 1;
    end if;

    if v_link_id is not null then
      v_links := v_links + 1;
    end if;
  end loop;

  insert into public.audit_logs (actor_id, action, target, metadata)
  values (
    p_actor_profile_id,
    'menu.service_catalog_imported',
    p_shop_id::text,
    jsonb_build_object(
      'shop_id', p_shop_id,
      'target_type', 'service_catalog',
      'source_ref', p_source_ref,
      'services_created', v_services_created,
      'services_updated', v_services_updated,
      'templates_created', v_templates_created,
      'templates_updated', v_templates_updated,
      'links', v_links
    )
  );

  return jsonb_build_object(
    'ok', true,
    'servicesCreated', v_services_created,
    'servicesUpdated', v_services_updated,
    'templatesCreated', v_templates_created,
    'templatesUpdated', v_templates_updated,
    'linksCreated', v_links
  );
end;
$$;

revoke all on function public.import_service_catalog(uuid, uuid, uuid, text, jsonb, jsonb) from public, anon;
grant execute on function public.import_service_catalog(uuid, uuid, uuid, text, jsonb, jsonb) to authenticated, service_role;

comment on function public.import_service_catalog(uuid, uuid, uuid, text, jsonb, jsonb) is
  'Atomically and idempotently imports a confirmed service catalog: inspection templates, active menu services, and their links.';
