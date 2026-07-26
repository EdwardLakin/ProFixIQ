\set ON_ERROR_STOP on

begin;

do $p0_008$
declare
  missing text[];
  unsafe text[];
begin
  select array_agg(name order by name)
    into missing
  from unnest(
    ARRAY[
      'agent_actions',
      'agent_attachments',
      'agent_jobs',
      'agent_requests',
      'ai_action_previews',
      'ai_events',
      'ai_evidence_snapshots',
      'ai_recommendations',
      'ai_suggestion_feedback',
      'ai_training_data',
      'assets',
      'assistant_daily_summaries',
      'content_assets',
      'content_events',
      'content_pieces',
      'content_platform_accounts',
      'content_publications',
      'content_templates',
      'dashboard_layouts',
      'dashboard_user_layouts',
      'expenses',
      'fleet_dispatch_assignments',
      'fleet_inspection_schedules',
      'fleet_pretrip_reports',
      'fleet_program_tasks',
      'fleet_programs',
      'fleet_service_requests',
      'fleet_vehicles',
      'guided_onboarding_events',
      'guided_onboarding_sessions',
      'guided_onboarding_steps',
      'inspection_result_items',
      'inspection_results',
      'inspection_smart_match_feedback',
      'inspection_smart_match_history',
      'inspection_template_suggestions',
      'invoice_documents',
      'maintenance_rules',
      'maintenance_services',
      'maintenance_suggestions',
      'menu_item_suggestions',
      'menu_repair_item_parts',
      'menu_repair_item_pricing_parts',
      'menu_repair_item_pricing_snapshots',
      'menu_repair_items',
      'optimization_actions',
      'organizations',
      'payroll_timecards',
      'people_workforce_profiles',
      'planner_events',
      'planner_runs',
      'property_assets',
      'property_inspection_signatures',
      'property_inspections',
      'property_maintenance_requests',
      'property_members',
      'property_portal_invites',
      'property_portfolios',
      'property_properties',
      'property_request_attachments',
      'property_request_events',
      'property_units',
      'property_vendor_assignments',
      'property_vendors',
      'quickbooks_connections',
      'quickbooks_customer_links',
      'quickbooks_sync_events',
      'shop_ai_profiles',
      'shop_boost_import_provenance',
      'shop_boost_import_reset_audit_events',
      'shop_boost_intakes',
      'shop_boost_integrity_reports',
      'shop_boost_review_audit_events',
      'shop_boost_review_items',
      'shop_boost_row_results',
      'shop_brand_assets',
      'shop_brand_profiles',
      'shop_health_snapshots',
      'shop_import_files',
      'shop_import_rows',
      'shop_maintenance_service_map',
      'shop_members',
      'shop_onboarding_activation_rules',
      'shop_onboarding_attempts',
      'shop_onboarding_jobs',
      'shop_onboarding_runs',
      'shop_parts_import_match_candidates',
      'shop_parts_import_staging',
      'shop_parts_source_aliases',
      'shop_vehicle_menu_items',
      'shopreel_drafts',
      'shopreel_event_deliveries',
      'shopreel_integrations',
      'shopreel_manual_assets',
      'shopreel_opportunities',
      'shopreel_opportunity_status_history',
      'shopreel_publications',
      'shopreel_publish_jobs',
      'shopreel_social_connections',
      'shopreel_story_sources',
      'staff_certifications',
      'staff_invite_candidates',
      'staff_invite_suggestions',
      'supplier_quote_batch_rows',
      'supplier_quote_batches',
      'user_theme_preferences',
      'vehicle_menus',
      'videos',
      'work_order_invoice_reviews',
      'work_order_line_ai',
      'work_order_line_dtc_threads',
      'workforce_document_requirements'
    ]::text[]
  ) as expected(name)
  where to_regclass('public.' || name) is null;

  if missing is not null then
    raise exception 'P0-008 missing runtime relations: %', missing;
  end if;

  select array_agg(column_name order by column_name)
    into missing
  from unnest(
    ARRAY[
      'work_order_id',
      'updated_at',
      'cancelled_at',
      'cancelled_by',
      'cancellation_reason',
      'lifecycle_metadata'
    ]::text[]
  ) as expected(column_name)
  where not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'bookings'
      and c.column_name = expected.column_name
  );

  if missing is not null then
    raise exception 'P0-008 missing booking lifecycle columns: %', missing;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'bookings'
      and column_name = 'shop_id'
      and is_nullable <> 'NO'
  ) then
    raise exception 'P0-008 bookings.shop_id must be required';
  end if;

  select array_agg(trigger_name order by trigger_name)
    into missing
  from unnest(
    ARRAY[
      'bookings_guard_customer_mutation',
      'trg_enforce_booking_customer_vehicle_consistency',
      'trg_enforce_booking_work_order_consistency'
    ]::text[]
  ) as expected(trigger_name)
  where not exists (
    select 1
    from pg_trigger t
    where t.tgrelid = 'public.bookings'::regclass
      and t.tgname = expected.trigger_name
      and not t.tgisinternal
  );

  if missing is not null then
    raise exception 'P0-008 missing booking integrity triggers: %', missing;
  end if;

  select array_agg(c.relname order by c.relname)
    into unsafe
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = any(
      ARRAY[
      'agent_actions',
      'agent_attachments',
      'agent_jobs',
      'agent_requests',
      'ai_action_previews',
      'ai_events',
      'ai_evidence_snapshots',
      'ai_recommendations',
      'ai_suggestion_feedback',
      'ai_training_data',
      'assets',
      'assistant_daily_summaries',
      'content_assets',
      'content_events',
      'content_pieces',
      'content_platform_accounts',
      'content_publications',
      'content_templates',
      'dashboard_layouts',
      'dashboard_user_layouts',
      'expenses',
      'fleet_dispatch_assignments',
      'fleet_inspection_schedules',
      'fleet_pretrip_reports',
      'fleet_program_tasks',
      'fleet_programs',
      'fleet_service_requests',
      'fleet_vehicles',
      'guided_onboarding_events',
      'guided_onboarding_sessions',
      'guided_onboarding_steps',
      'inspection_result_items',
      'inspection_results',
      'inspection_smart_match_feedback',
      'inspection_smart_match_history',
      'inspection_template_suggestions',
      'invoice_documents',
      'maintenance_rules',
      'maintenance_services',
      'maintenance_suggestions',
      'menu_item_suggestions',
      'menu_repair_item_parts',
      'menu_repair_item_pricing_parts',
      'menu_repair_item_pricing_snapshots',
      'menu_repair_items',
      'optimization_actions',
      'organizations',
      'payroll_timecards',
      'people_workforce_profiles',
      'planner_events',
      'planner_runs',
      'property_assets',
      'property_inspection_signatures',
      'property_inspections',
      'property_maintenance_requests',
      'property_members',
      'property_portal_invites',
      'property_portfolios',
      'property_properties',
      'property_request_attachments',
      'property_request_events',
      'property_units',
      'property_vendor_assignments',
      'property_vendors',
      'quickbooks_connections',
      'quickbooks_customer_links',
      'quickbooks_sync_events',
      'shop_ai_profiles',
      'shop_boost_import_provenance',
      'shop_boost_import_reset_audit_events',
      'shop_boost_intakes',
      'shop_boost_integrity_reports',
      'shop_boost_review_audit_events',
      'shop_boost_review_items',
      'shop_boost_row_results',
      'shop_brand_assets',
      'shop_brand_profiles',
      'shop_health_snapshots',
      'shop_import_files',
      'shop_import_rows',
      'shop_maintenance_service_map',
      'shop_members',
      'shop_onboarding_activation_rules',
      'shop_onboarding_attempts',
      'shop_onboarding_jobs',
      'shop_onboarding_runs',
      'shop_parts_import_match_candidates',
      'shop_parts_import_staging',
      'shop_parts_source_aliases',
      'shop_vehicle_menu_items',
      'shopreel_drafts',
      'shopreel_event_deliveries',
      'shopreel_integrations',
      'shopreel_manual_assets',
      'shopreel_opportunities',
      'shopreel_opportunity_status_history',
      'shopreel_publications',
      'shopreel_publish_jobs',
      'shopreel_social_connections',
      'shopreel_story_sources',
      'staff_certifications',
      'staff_invite_candidates',
      'staff_invite_suggestions',
      'supplier_quote_batch_rows',
      'supplier_quote_batches',
      'user_theme_preferences',
      'vehicle_menus',
      'videos',
      'work_order_invoice_reviews',
      'work_order_line_ai',
      'work_order_line_dtc_threads',
      'workforce_document_requirements'
    ]::text[]
    )
    and not c.relrowsecurity;

  if unsafe is not null then
    raise exception 'P0-008 recovered tables without RLS: %', unsafe;
  end if;

  select array_agg(signature order by signature)
    into missing
  from unnest(
    ARRAY[
      'public.accept_property_portal_invite(text)',
      'public.add_repair_line_from_vehicle_service(uuid,integer,text,text,text,text,numeric)',
      'public.agent_approve_action(uuid,uuid)',
      'public.agent_reject_action(uuid,uuid,text)',
      'public.ai_generate_training_row()',
      'public.clear_other_active_brand_assets()',
      'public.complete_canonical_shift(uuid,uuid,uuid,uuid,timestamp with time zone)',
      'public.compute_timecard_hours()',
      'public.enforce_ai_suggestion_feedback_consistency()',
      'public.enforce_assistant_daily_summary_consistency()',
      'public.enforce_booking_customer_vehicle_consistency()',
      'public.enforce_booking_work_order_consistency()',
      'public.enforce_content_asset_consistency()',
      'public.enforce_content_event_consistency()',
      'public.enforce_invoice_amount_consistency()',
      'public.enforce_invoice_work_order_for_active_invoices()',
      'public.enforce_property_inspection_signature_shop_id()',
      'public.enforce_supplier_quote_batch_row_consistency()',
      'public.enforce_work_order_line_ai_consistency()',
      'public.fleet_fill_fleet_id()',
      'public.fleet_inspection_schedules_set_next()',
      'public.get_work_order_assignments(uuid)',
      'public.guard_customer_booking_mutation()',
      'public.insert_ai_event(uuid,text,jsonb,uuid,text,uuid,text)',
      'public.invoice_is_historical_import(jsonb)',
      'public.invoices_compute_totals_biu()',
      'public.invoices_sync_work_orders_aiu()',
      'public.match_learned_job_templates(uuid,vector,integer)',
      'public.match_work_order_intelligence(uuid,vector,integer)',
      'public.menu_repair_items_set_updated_at()',
      'public.payroll_timecards_set_hours()',
      'public.plan_user_limit(text)',
      'public.plan_user_limit(text,text)',
      'public.process_ai_event_for_shopreel()',
      'public.property_portal_invites_set_updated_at()',
      'public.property_portal_invites_validate_hierarchy()',
      'public.recalc_menu_items_for_shop()',
      'public.receive_po_part_and_allocate(uuid,uuid,uuid,numeric)',
      'public.replace_shop_hours_atomic(uuid,jsonb)',
      'public.set_part_request_status(uuid,part_request_status)',
      'public.set_quickbooks_updated_at()',
      'public.set_shop_ownership_defaults()',
      'public.set_shop_maintenance_service_map_updated_at()',
      'public.set_updated_at_now()',
      'public.set_updated_at_shopreel_event_deliveries()',
      'public.set_updated_at_shopreel_integrations()',
      'public.set_updated_at_timestamp()',
      'public.set_user_theme_preferences_updated_at()',
      'public.set_work_order_line_dtc_threads_updated_at()',
      'public.shopreel_manual_assets_set_updated_at()',
      'public.start_canonical_shift(uuid,uuid,uuid,timestamp with time zone)',
      'public.sync_shop_brand_logo_to_profile()',
      'public.sync_shop_user_limit_from_billing()',
      'public.tg_set_updated_at()',
      'public.touch_updated_at()',
      'public.update_pricing_snapshot_status()',
      'public.validate_property_assets_tenant_consistency()',
      'public.validate_property_inspections_tenant_consistency()',
      'public.validate_property_maintenance_requests_tenant_consistency()',
      'public.validate_property_members_tenant_consistency()',
      'public.validate_property_properties_tenant_consistency()',
      'public.validate_property_request_attachment_scope()',
      'public.validate_property_request_event_scope()',
      'public.validate_property_units_tenant_consistency()',
      'public.validate_property_vendor_assignments_tenant_consistency()',
      'public.wo_release_parts_holds_for_part(uuid)',
      'public.wor_enforce_shop_consistency()',
      'public.portal_request_start_atomic(uuid,uuid,uuid,timestamp with time zone,timestamp with time zone,text,text,text)'
    ]::text[]
  ) as expected(signature)
  where to_regprocedure(signature) is null;

  if missing is not null then
    raise exception 'P0-008 missing runtime functions: %', missing;
  end if;

  select array_agg(name order by name)
    into unsafe
  from unnest(
    ARRAY[
      'v_menu_repair_item_match_stats',
      'v_portal_invoices',
      'v_shop_boost_overview',
      'v_shop_boost_suggestions',
      'v_shop_health_latest',
      'v_staff_invites_common',
      'v_work_order_board_cards_shop'
    ]::text[]
  ) as expected(name)
  join pg_class c on c.oid = to_regclass('public.' || expected.name)
  where not (coalesce(c.reloptions, '{}'::text[]) @> array['security_invoker=true']);

  if unsafe is not null then
    raise exception 'P0-008 views are not security invokers: %', unsafe;
  end if;

  select array_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text)
    into unsafe
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and p.oid = any(
      array(
        select to_regprocedure(signature)::oid
        from unnest(
          ARRAY[
      'public.accept_property_portal_invite(text)',
      'public.add_repair_line_from_vehicle_service(uuid,integer,text,text,text,text,numeric)',
      'public.agent_approve_action(uuid,uuid)',
      'public.agent_reject_action(uuid,uuid,text)',
      'public.ai_generate_training_row()',
      'public.clear_other_active_brand_assets()',
      'public.complete_canonical_shift(uuid,uuid,uuid,uuid,timestamp with time zone)',
      'public.compute_timecard_hours()',
      'public.enforce_ai_suggestion_feedback_consistency()',
      'public.enforce_assistant_daily_summary_consistency()',
      'public.enforce_booking_customer_vehicle_consistency()',
      'public.enforce_booking_work_order_consistency()',
      'public.enforce_content_asset_consistency()',
      'public.enforce_content_event_consistency()',
      'public.enforce_invoice_amount_consistency()',
      'public.enforce_invoice_work_order_for_active_invoices()',
      'public.enforce_property_inspection_signature_shop_id()',
      'public.enforce_supplier_quote_batch_row_consistency()',
      'public.enforce_work_order_line_ai_consistency()',
      'public.fleet_fill_fleet_id()',
      'public.fleet_inspection_schedules_set_next()',
      'public.get_work_order_assignments(uuid)',
      'public.guard_customer_booking_mutation()',
      'public.insert_ai_event(uuid,text,jsonb,uuid,text,uuid,text)',
      'public.invoice_is_historical_import(jsonb)',
      'public.invoices_compute_totals_biu()',
      'public.invoices_sync_work_orders_aiu()',
      'public.match_learned_job_templates(uuid,vector,integer)',
      'public.match_work_order_intelligence(uuid,vector,integer)',
      'public.menu_repair_items_set_updated_at()',
      'public.payroll_timecards_set_hours()',
      'public.plan_user_limit(text)',
      'public.plan_user_limit(text,text)',
      'public.process_ai_event_for_shopreel()',
      'public.property_portal_invites_set_updated_at()',
      'public.property_portal_invites_validate_hierarchy()',
      'public.recalc_menu_items_for_shop()',
      'public.receive_po_part_and_allocate(uuid,uuid,uuid,numeric)',
      'public.replace_shop_hours_atomic(uuid,jsonb)',
      'public.set_part_request_status(uuid,part_request_status)',
      'public.set_quickbooks_updated_at()',
      'public.set_shop_ownership_defaults()',
      'public.set_shop_maintenance_service_map_updated_at()',
      'public.set_updated_at_now()',
      'public.set_updated_at_shopreel_event_deliveries()',
      'public.set_updated_at_shopreel_integrations()',
      'public.set_updated_at_timestamp()',
      'public.set_user_theme_preferences_updated_at()',
      'public.set_work_order_line_dtc_threads_updated_at()',
      'public.shopreel_manual_assets_set_updated_at()',
      'public.start_canonical_shift(uuid,uuid,uuid,timestamp with time zone)',
      'public.sync_shop_brand_logo_to_profile()',
      'public.sync_shop_user_limit_from_billing()',
      'public.tg_set_updated_at()',
      'public.touch_updated_at()',
      'public.update_pricing_snapshot_status()',
      'public.validate_property_assets_tenant_consistency()',
      'public.validate_property_inspections_tenant_consistency()',
      'public.validate_property_maintenance_requests_tenant_consistency()',
      'public.validate_property_members_tenant_consistency()',
      'public.validate_property_properties_tenant_consistency()',
      'public.validate_property_request_attachment_scope()',
      'public.validate_property_request_event_scope()',
      'public.validate_property_units_tenant_consistency()',
      'public.validate_property_vendor_assignments_tenant_consistency()',
      'public.wo_release_parts_holds_for_part(uuid)',
      'public.wor_enforce_shop_consistency()',
      'public.portal_request_start_atomic(uuid,uuid,uuid,timestamp with time zone,timestamp with time zone,text,text,text)'
          ]::text[]
        ) expected(signature)
        where to_regprocedure(signature) is not null
      )
    )
    and not exists (
      select 1
      from unnest(coalesce(p.proconfig, '{}'::text[])) setting
      where setting like 'search_path=%'
    );

  if unsafe is not null then
    raise exception 'P0-008 SECURITY DEFINER functions lack fixed search_path: %', unsafe;
  end if;

  if not exists (
    select 1
    from pg_extension
    where extname = 'pg_trgm'
  ) or to_regclass('public.idx_smart_match_note_trgm') is null then
    raise exception 'P0-008 trigram search dependency or index is missing';
  end if;

  if public.plan_user_limit('complete_10', null) <> 10
    or public.plan_user_limit('complete_50', null) <> 50
    or public.plan_user_limit('complete_100', null) <> 100
    or public.plan_user_limit('complete_unlimited', null) <> 2147483647
    or public.plan_user_limit('pro') <> 50
  then
    raise exception 'P0-008 plan_user_limit mapping is not canonical';
  end if;

  if has_function_privilege('anon', 'public.plan_user_limit(text,text)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.plan_user_limit(text,text)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.plan_user_limit(text,text)', 'EXECUTE')
  then
    raise exception 'P0-008 plan_user_limit ACL is unsafe';
  end if;

  if has_function_privilege(
      'anon',
      'public.portal_request_start_atomic(uuid,uuid,uuid,timestamptz,timestamptz,text,text,text)',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'public.portal_request_start_atomic(uuid,uuid,uuid,timestamptz,timestamptz,text,text,text)',
      'EXECUTE'
    )
    or not has_function_privilege(
      'service_role',
      'public.portal_request_start_atomic(uuid,uuid,uuid,timestamptz,timestamptz,text,text,text)',
      'EXECUTE'
    )
  then
    raise exception 'P0-008 portal request RPC ACL is unsafe';
  end if;
end
$p0_008$;

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '81000000-0000-4000-8000-000000000001',
    'p0-008-owner-a@example.com',
    '{"full_name":"P0-008 Owner A"}'::jsonb
  ),
  (
    '82000000-0000-4000-8000-000000000002',
    'p0-008-owner-b@example.com',
    '{"full_name":"P0-008 Owner B"}'::jsonb
  )
on conflict (id) do nothing;

insert into public.profiles (id, user_id, role, full_name)
values
  (
    '81000000-0000-4000-8000-000000000001',
    '81000000-0000-4000-8000-000000000001',
    'owner',
    'P0-008 Owner A'
  ),
  (
    '82000000-0000-4000-8000-000000000002',
    '82000000-0000-4000-8000-000000000002',
    'owner',
    'P0-008 Owner B'
  )
on conflict (id) do update
set user_id = excluded.user_id,
    role = excluded.role,
    full_name = excluded.full_name;

insert into public.shops (id, owner_id, business_name, name, plan, user_limit)
values
  (
    'a8100000-0000-4000-8000-000000000001',
    '81000000-0000-4000-8000-000000000001',
    'P0-008 Shop A',
    'P0-008 Shop A',
    'complete_100',
    1
  ),
  (
    'b8200000-0000-4000-8000-000000000002',
    '82000000-0000-4000-8000-000000000002',
    'P0-008 Shop B',
    'P0-008 Shop B',
    'complete_10',
    1
  )
on conflict (id) do nothing;

update public.profiles
set shop_id = case id
  when '81000000-0000-4000-8000-000000000001'::uuid
    then 'a8100000-0000-4000-8000-000000000001'::uuid
  else 'b8200000-0000-4000-8000-000000000002'::uuid
end
where id in (
  '81000000-0000-4000-8000-000000000001',
  '82000000-0000-4000-8000-000000000002'
);

do $p0_008$
begin
  if (select user_limit from public.shops where id = 'a8100000-0000-4000-8000-000000000001') <> 100
    or (select user_limit from public.shops where id = 'b8200000-0000-4000-8000-000000000002') <> 10
  then
    raise exception 'P0-008 shop user_limit trigger did not synchronize plan caps';
  end if;
end
$p0_008$;

insert into public.dashboard_layouts (shop_id, user_id, layout)
values
  (
    'a8100000-0000-4000-8000-000000000001',
    '81000000-0000-4000-8000-000000000001',
    '[{"id":"shop-a"}]'::jsonb
  ),
  (
    'b8200000-0000-4000-8000-000000000002',
    '82000000-0000-4000-8000-000000000002',
    '[{"id":"shop-b"}]'::jsonb
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"81000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

do $p0_008$
begin
  if (select count(*) from public.dashboard_layouts) <> 1 then
    raise exception 'P0-008 dashboard_layouts tenant isolation failed';
  end if;

  if exists (
    select 1
    from public.dashboard_layouts
    where shop_id = 'b8200000-0000-4000-8000-000000000002'::uuid
  ) then
    raise exception 'P0-008 cross-shop dashboard layout was visible';
  end if;
end
$p0_008$;

reset role;

rollback;
