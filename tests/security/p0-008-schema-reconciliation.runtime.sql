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
      'org_members',
      'organizations',
      'parts_suppliers',
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
      'supplier_catalog_items',
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

  select array_agg(expected.column_name order by expected.column_name)
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

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'work_orders'
      and column_name = 'shop_id'
      and is_nullable <> 'NO'
  ) then
    raise exception 'P0-008 work_orders.shop_id must be required';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'work_orders'
      and column_name = 'source_row_id'
      and data_type = 'text'
  ) then
    raise exception 'P0-008 work_orders.source_row_id must support namespaced text identities';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'payments'
      and column_name = 'amount'
      and data_type = 'numeric'
      and is_nullable = 'NO'
      and column_default is not null
  ) then
    raise exception 'P0-008 payments.amount must preserve the canonical decimal contract';
  end if;

  select array_agg(
      expected.table_name || '.' || expected.column_name
      order by expected.table_name, expected.column_name
    )
    into unsafe
  from (values
    ('chat_participants', 'chat_id'),
    ('chat_participants', 'profile_id'),
    ('conversation_participants', 'conversation_id'),
    ('conversation_participants', 'user_id'),
    ('demo_shop_boosts', 'snapshot'),
    ('email_logs', 'created_at'),
    ('email_logs', 'status'),
    ('inspections', 'shop_id'),
    ('inspections', 'status'),
    ('inspections', 'locked'),
    ('payments', 'updated_at'),
    ('payroll_pay_periods', 'created_at'),
    ('payroll_pay_periods', 'period_end'),
    ('payroll_pay_periods', 'period_start'),
    ('payroll_pay_periods', 'shop_id'),
    ('portal_notifications', 'title'),
    ('quote_lines', 'status'),
    ('quote_lines', 'work_order_id'),
    ('shops', 'owner_id'),
    ('work_order_approvals', 'work_order_id'),
    ('work_order_lines', 'shop_id'),
    ('work_order_lines', 'status'),
    ('work_order_lines', 'work_order_id'),
    ('work_order_part_allocations', 'shop_id'),
    ('work_order_parts', 'work_order_id'),
    ('work_order_quote_lines', 'description'),
    ('work_orders', 'status')
  ) as expected(table_name, column_name)
  left join information_schema.columns c
    on c.table_schema = 'public'
   and c.table_name = expected.table_name
   and c.column_name = expected.column_name
  where c.is_nullable is distinct from 'NO';

  if unsafe is not null then
    raise exception 'P0-008 required runtime columns remain nullable or missing: %', unsafe;
  end if;

  select array_agg(
      expected.table_name || '.' || expected.column_name
      order by expected.table_name, expected.column_name
    )
    into unsafe
  from (values
    ('demo_shop_boosts', 'snapshot'),
    ('email_logs', 'status'),
    ('inspections', 'locked'),
    ('payments', 'updated_at'),
    ('payroll_pay_periods', 'created_at'),
    ('work_order_quote_lines', 'est_labor_hours'),
    ('work_order_quote_lines', 'grand_total'),
    ('work_order_quote_lines', 'labor_hours'),
    ('work_order_quote_lines', 'labor_total'),
    ('work_order_quote_lines', 'metadata'),
    ('work_order_quote_lines', 'parts_total'),
    ('work_order_quote_lines', 'subtotal'),
    ('work_order_quote_lines', 'tax_total')
  ) as expected(table_name, column_name)
  left join information_schema.columns c
    on c.table_schema = 'public'
   and c.table_name = expected.table_name
   and c.column_name = expected.column_name
  where c.column_default is null;

  if unsafe is not null then
    raise exception 'P0-008 canonical column defaults remain missing: %', unsafe;
  end if;

  select array_agg(
      expected.table_name || '.' || expected.column_name
      order by expected.table_name, expected.column_name
    )
    into missing
  from (values
    ('email_logs', 'shop_id'),
    ('email_logs', 'template_key'),
    ('email_logs', 'to_email'),
    ('history', 'source_payload'),
    ('history', 'source_row_id'),
    ('menu_item_parts', 'part_id'),
    ('menu_item_parts', 'shop_id'),
    ('payments', 'amount_cents'),
    ('payments', 'platform_fee_cents'),
    ('payments', 'stripe_checkout_session_id'),
    ('payments', 'stripe_payment_intent_id'),
    ('payments', 'stripe_session_id'),
    ('purchase_orders', 'notes'),
    ('tech_sessions', 'work_order_line_id'),
    ('work_order_line_technicians', 'id'),
    ('work_order_quote_lines', 'ai_cause'),
    ('work_order_quote_lines', 'ai_complaint'),
    ('work_order_quote_lines', 'ai_correction'),
    ('work_order_quote_lines', 'job_type'),
    ('work_order_quote_lines', 'notes'),
    ('work_order_quote_lines', 'qty'),
    ('work_order_quote_lines', 'sent_to_customer_at'),
    ('work_order_quote_lines', 'suggested_by'),
    ('work_order_quote_lines', 'vehicle_id')
  ) as expected(table_name, column_name)
  where not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = expected.table_name
      and c.column_name = expected.column_name
  );

  if missing is not null then
    raise exception 'P0-008 missing application schema columns: %', missing;
  end if;

  select array_agg(expected.column_name order by expected.column_name)
    into unsafe
  from unnest(
    ARRAY[
      'est_labor_hours',
      'grand_total',
      'labor_hours',
      'labor_total',
      'metadata',
      'parts_total',
      'subtotal',
      'tax_total'
    ]::text[]
  ) as expected(column_name)
  left join information_schema.columns c
    on c.table_schema = 'public'
   and c.table_name = 'work_order_quote_lines'
   and c.column_name = expected.column_name
  where c.is_nullable is distinct from 'YES';

  if unsafe is not null then
    raise exception 'P0-008 quote input columns must preserve nullable application semantics: %', unsafe;
  end if;

  select array_agg(expected.name order by expected.name)
    into unsafe
  from unnest(
    ARRAY[
      'part_stock_summary',
      'v_quote_queue',
      'v_work_order_board_cards_fleet',
      'v_work_order_board_cards_portal'
    ]::text[]
  ) as expected(name)
  left join pg_class c
    on c.relnamespace = 'public'::regnamespace
   and c.relname = expected.name
  where c.relkind is distinct from 'v'
     or not (
       coalesce(c.reloptions, ARRAY[]::text[])
       @> ARRAY['security_invoker=true']::text[]
     );

  if unsafe is not null then
    raise exception 'P0-008 application views must be security-invoker views: %', unsafe;
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
      'org_members',
      'organizations',
      'parts_suppliers',
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
      'supplier_catalog_items',
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

  select array_agg(c.relname || '.' || p.polname order by c.relname, p.polname)
    into unsafe
  from pg_policy p
  join pg_class c on c.oid = p.polrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = any(
      ARRAY[
        'ai_action_previews',
        'ai_events',
        'ai_evidence_snapshots',
        'ai_recommendations',
        'content_assets',
        'content_events',
        'content_pieces',
        'content_platform_accounts',
        'content_publications',
        'dashboard_layouts',
        'guided_onboarding_events',
        'guided_onboarding_sessions',
        'guided_onboarding_steps',
        'inspection_smart_match_history',
        'menu_repair_item_parts',
        'menu_repair_item_pricing_snapshots',
        'optimization_actions',
        'people_workforce_profiles',
        'shopreel_manual_assets',
        'shopreel_publications',
        'shopreel_social_connections',
        'staff_certifications',
        'workforce_document_requirements'
      ]::text[]
    )
    and (
      coalesce(pg_get_expr(p.polqual, p.polrelid), '') like '%current_shop_id()%'
      or coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') like '%current_shop_id()%'
    );

  if unsafe is not null then
    raise exception 'P0-008 recovered policies still trust request-local shop context: %', unsafe;
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'org_members'
      and policyname = 'org_members_select_self'
      and roles = array['authenticated']::name[]
      and cmd = 'SELECT'
  ) then
    raise exception 'P0-008 org_members self-read policy is missing';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'parts_suppliers'
      and policyname = 'parts_suppliers__shop_select'
      and roles = array['authenticated']::name[]
      and cmd = 'SELECT'
  ) then
    raise exception 'P0-008 parts supplier tenant policy is missing';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'supplier_catalog_items'
      and policyname = 'supplier_catalog_items__supplier_shop_all'
      and roles = array['authenticated']::name[]
      and cmd = 'ALL'
  ) then
    raise exception 'P0-008 supplier catalog tenant policy is missing';
  end if;

  if has_table_privilege('anon', 'public.org_members', 'SELECT')
    or has_table_privilege('anon', 'public.parts_suppliers', 'SELECT')
    or has_table_privilege('anon', 'public.supplier_catalog_items', 'SELECT')
    or not has_table_privilege('authenticated', 'public.org_members', 'SELECT')
    or has_table_privilege('authenticated', 'public.org_members', 'INSERT')
    or has_table_privilege('authenticated', 'public.org_members', 'UPDATE')
    or has_table_privilege('authenticated', 'public.org_members', 'DELETE')
    or not has_table_privilege('authenticated', 'public.parts_suppliers', 'SELECT')
    or not has_table_privilege('authenticated', 'public.parts_suppliers', 'INSERT')
    or not has_table_privilege('authenticated', 'public.parts_suppliers', 'UPDATE')
    or not has_table_privilege('authenticated', 'public.parts_suppliers', 'DELETE')
    or not has_table_privilege('authenticated', 'public.supplier_catalog_items', 'SELECT')
    or not has_table_privilege('authenticated', 'public.supplier_catalog_items', 'INSERT')
    or not has_table_privilege('authenticated', 'public.supplier_catalog_items', 'UPDATE')
    or not has_table_privilege('authenticated', 'public.supplier_catalog_items', 'DELETE')
    or not has_table_privilege('service_role', 'public.org_members', 'SELECT')
    or not has_table_privilege('service_role', 'public.parts_suppliers', 'SELECT')
    or not has_table_privilege('service_role', 'public.supplier_catalog_items', 'SELECT')
  then
    raise exception 'P0-008 policy dependency table ACLs are unsafe';
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
      'public.create_work_order_with_custom_id(uuid,uuid,uuid,text,integer,boolean,uuid)',
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
      'public.is_agent_developer()',
      'public.is_shop_member_v2(uuid)',
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
      'public.shop_role(uuid)',
      'public.shop_role_v2(uuid)',
      'public.shopreel_manual_assets_set_updated_at()',
      'public.start_canonical_shift(uuid,uuid,uuid,timestamp with time zone)',
      'public.sync_shop_brand_logo_to_profile()',
      'public.sync_shop_user_limit_from_billing()',
      'public.tg_set_updated_at()',
      'public.touch_updated_at()',
      'public.user_is_in_shop(uuid)',
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
      'public.create_work_order_with_custom_id(uuid,uuid,uuid,text,integer,boolean,uuid)',
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
      'public.is_agent_developer()',
      'public.is_shop_member_v2(uuid)',
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
      'public.shop_role(uuid)',
      'public.shop_role_v2(uuid)',
      'public.shopreel_manual_assets_set_updated_at()',
      'public.start_canonical_shift(uuid,uuid,uuid,timestamp with time zone)',
      'public.sync_shop_brand_logo_to_profile()',
      'public.sync_shop_user_limit_from_billing()',
      'public.tg_set_updated_at()',
      'public.touch_updated_at()',
      'public.user_is_in_shop(uuid)',
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

  if to_regprocedure(
      'public.create_work_order_with_custom_id(uuid,uuid,uuid,text,integer,boolean)'
    ) is not null
    or has_function_privilege(
      'anon',
      'public.create_work_order_with_custom_id(uuid,uuid,uuid,text,integer,boolean,uuid)',
      'EXECUTE'
    )
    or not has_function_privilege(
      'authenticated',
      'public.create_work_order_with_custom_id(uuid,uuid,uuid,text,integer,boolean,uuid)',
      'EXECUTE'
    )
    or not has_function_privilege(
      'service_role',
      'public.create_work_order_with_custom_id(uuid,uuid,uuid,text,integer,boolean,uuid)',
      'EXECUTE'
    )
  then
    raise exception 'P0-008 work-order creation RPC contract or ACL is unsafe';
  end if;

  select array_agg(
      retired.table_name || '.' || retired.column_name
      order by retired.table_name, retired.column_name
    )
    into unsafe
  from (values
    ('demo_shop_boosts', 'updated_at'),
    ('email_logs', 'email'),
    ('email_logs', 'error'),
    ('email_logs', 'event_type'),
    ('email_logs', 'sg_event_id'),
    ('email_logs', 'timestamp'),
    ('fleet_members', 'id'),
    ('invoices', 'due_at'),
    ('messages', 'chat_id'),
    ('payments', 'invoice_id'),
    ('payments', 'payment_method'),
    ('payments', 'processor'),
    ('payments', 'processor_payment_id'),
    ('work_order_lines', 'void_note'),
    ('work_order_lines', 'void_reason'),
    ('work_order_quote_lines', 'inspection_item_id'),
    ('work_order_quote_lines', 'menu_item_id')
  ) retired(table_name, column_name)
  join information_schema.columns c
    on c.table_schema = 'public'
   and c.table_name = retired.table_name
   and c.column_name = retired.column_name;

  if unsafe is not null then
    raise exception 'P0-008 retired bootstrap aliases remain: %', unsafe;
  end if;

  select array_agg(
      required.table_name || '.' || required.column_name
      order by required.table_name, required.column_name
    )
    into missing
  from (values
    ('shops', 'billing_entitlement_override'),
    ('shops', 'billing_grace_until'),
    ('shops', 'billing_entitlement_updated_at'),
    ('shops', 'location_type')
  ) required(table_name, column_name)
  where not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = required.table_name
      and c.column_name = required.column_name
  );

  if missing is not null then
    raise exception 'P0-008 missing billing entitlement columns: %', missing;
  end if;

  if to_regprocedure('public.can_update_part_request_items(uuid)') is null
    or to_regprocedure(
      'public.receive_part_request_item(uuid,uuid,numeric,uuid,text)'
    ) is null
  then
    raise exception 'P0-008 required Parts overloads are missing';
  end if;

  if has_function_privilege(
      'anon',
      'public.prevent_client_shop_billing_identity_write()',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'public.prevent_client_shop_billing_identity_write()',
      'EXECUTE'
    )
    or has_function_privilege(
      'anon',
      'public.normalize_client_shop_billing_identity_insert()',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'public.normalize_client_shop_billing_identity_insert()',
      'EXECUTE'
    )
    or has_function_privilege(
      'anon',
      'public.profixiq_mark_shop_billing_sync()',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'public.profixiq_mark_shop_billing_sync()',
      'EXECUTE'
    )
  then
    raise exception 'P0-008 shop billing trigger functions are exposed to clients';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'shops'
      and policyname = 'shops_insert_first_shop_only'
      and roles = array['authenticated']::name[]
      and cmd = 'INSERT'
  ) then
    raise exception 'P0-008 first-shop-only insert policy is missing';
  end if;

  if not exists (
    select 1
    from pg_trigger t
    where t.tgrelid = 'public.profiles'::regclass
      and t.tgname = 'profiles_mark_shop_billing_sync'
      and not t.tgisinternal
  ) or not exists (
    select 1
    from pg_trigger t
    where t.tgrelid = 'public.shops'::regclass
      and t.tgname = 'prevent_client_shop_billing_identity_write'
      and not t.tgisinternal
  ) or not exists (
    select 1
    from pg_trigger t
    where t.tgrelid = 'public.shops'::regclass
      and t.tgname = 'shops_normalize_client_billing_identity_insert'
      and not t.tgisinternal
  ) then
    raise exception 'P0-008 shop billing protection triggers are missing';
  end if;

  if position(
      'new.max_users is distinct from old.max_users'
      in pg_get_functiondef(
        'public.prevent_client_shop_billing_identity_write()'::regprocedure
      )
    ) > 0
  then
    raise exception 'P0-008 billing guard must not compare generated max_users';
  end if;

  if position(
      'f.shop_id, f.customer_id'
      in pg_get_functiondef(
        'public.manage_fleet_unit_enrollment(text,uuid,uuid,uuid,text,text,text,integer,text,text,text,text,time without time zone)'::regprocedure
      )
    ) = 0
    or position(
      'Enroll the unit before assigning a driver'
      in pg_get_functiondef(
        'public.manage_fleet_unit_enrollment(text,uuid,uuid,uuid,text,text,text,integer,text,text,text,text,time without time zone)'::regprocedure
      )
    ) = 0
  then
    raise exception 'P0-008 Fleet-owned unit enrollment boundary is stale';
  end if;

  if position(
      'voided_reason = trim(p_reason)'
      in pg_get_functiondef(
        'public.parts_void_work_order_line_atomic(uuid,uuid,text,text,text,text,text,text,text,text,uuid)'::regprocedure
      )
    ) = 0
    or position(
      'voided_note = nullif(trim(p_note)'
      in pg_get_functiondef(
        'public.parts_void_work_order_line_atomic(uuid,uuid,text,text,text,text,text,text,text,text,uuid)'::regprocedure
      )
    ) = 0
  then
    raise exception 'P0-008 line-void RPC still targets retired aliases';
  end if;

  if to_regclass('public.agent_bridge_credentials') is not null then
    raise exception 'P0-008 retired agent bridge credential table remains';
  end if;

  if not exists (
    select 1
    from pg_namespace n
    where n.nspname = 'onboarding_agent'
  )
  or not has_schema_privilege('service_role', 'onboarding_agent', 'USAGE')
  or has_schema_privilege('anon', 'onboarding_agent', 'USAGE')
  or has_schema_privilege('authenticated', 'onboarding_agent', 'USAGE') then
    raise exception 'P0-008 onboarding-agent compatibility namespace is unsafe';
  end if;

  if (
    select array_agg(p.policyname::text order by p.policyname)
    from pg_policies p
    where p.schemaname = 'public'
      and p.tablename = 'integrations'
  ) is distinct from array[
    'integrations__shop_delete',
    'integrations__shop_insert',
    'integrations__shop_select',
    'integrations__shop_update'
  ]::text[]
  or exists (
    select 1
    from pg_policies p
    where p.schemaname = 'public'
      and p.tablename = 'integrations'
      and p.roles::text <> '{authenticated}'
  ) then
    raise exception 'P0-008 integration policies must be authenticated-only';
  end if;

  if exists (
    select 1
    from public.integrations i
    where i.id = '7c2da329-5117-48c0-a1ee-d51b5d63827d'::uuid
      and not (
        i.shop_id is null
        and i.provider = 'aftermarket_api'
        and i.status = 'enabled'
        and i.config ->> 'kind' = 'profixiq_agent_bridge'
        and nullif(i.config ->> 'secret', '') is not null
      )
  ) or exists (
    select 1
    from public.integrations i
    where i.config ->> 'kind' = 'profixiq_agent_bridge'
      and i.id <> '7c2da329-5117-48c0-a1ee-d51b5d63827d'::uuid
  ) then
    raise exception 'P0-008 configured agent bridge integration is noncanonical';
  end if;

  if not exists (
    select 1
    from pg_constraint c
    where c.conrelid = 'public.quickbooks_sync_events'::regclass
      and c.conname = 'quickbooks_sync_events_entity_type_check'
      and c.convalidated
      and pg_get_constraintdef(c.oid, true) like '%invoice_version%'
  ) then
    raise exception 'P0-008 QuickBooks invoice-version entity contract is missing';
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

insert into public.customers (id, shop_id, name)
values
  (
    'ca100000-0000-4000-8000-000000000001',
    'a8100000-0000-4000-8000-000000000001',
    'P0-008 Customer A'
  ),
  (
    'cb200000-0000-4000-8000-000000000002',
    'b8200000-0000-4000-8000-000000000002',
    'P0-008 Customer B'
  )
on conflict (id) do update
set shop_id = excluded.shop_id,
    name = excluded.name;

insert into public.vehicles (id, shop_id, customer_id, year, make, model)
values
  (
    'aa100000-0000-4000-8000-000000000001',
    'a8100000-0000-4000-8000-000000000001',
    'ca100000-0000-4000-8000-000000000001',
    2024,
    'Test',
    'Shop A Vehicle'
  ),
  (
    'bb200000-0000-4000-8000-000000000002',
    'b8200000-0000-4000-8000-000000000002',
    'cb200000-0000-4000-8000-000000000002',
    2024,
    'Test',
    'Shop B Vehicle'
  )
on conflict (id) do update
set shop_id = excluded.shop_id,
    customer_id = excluded.customer_id,
    year = excluded.year,
    make = excluded.make,
    model = excluded.model;

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
declare
  created_work_order public.work_orders%rowtype;
begin
  begin
    perform public.create_work_order_with_custom_id(
      p_shop_id => 'b8200000-0000-4000-8000-000000000002',
      p_customer_id => 'cb200000-0000-4000-8000-000000000002',
      p_vehicle_id => 'bb200000-0000-4000-8000-000000000002'
    );
    raise exception 'P0-008 cross-shop work-order creation unexpectedly succeeded';
  exception
    when insufficient_privilege then
      null;
  end;

  select *
    into created_work_order
  from public.create_work_order_with_custom_id(
    p_shop_id => 'a8100000-0000-4000-8000-000000000001',
    p_customer_id => 'ca100000-0000-4000-8000-000000000001',
    p_vehicle_id => 'aa100000-0000-4000-8000-000000000001',
    p_notes => 'P0-008 same-shop creation',
    p_priority => 3,
    p_is_waiter => false,
    p_advisor_id => '81000000-0000-4000-8000-000000000001'
  );

  if created_work_order.id is null
    or created_work_order.shop_id <> 'a8100000-0000-4000-8000-000000000001'::uuid
    or created_work_order.customer_id <> 'ca100000-0000-4000-8000-000000000001'::uuid
    or created_work_order.vehicle_id <> 'aa100000-0000-4000-8000-000000000001'::uuid
    or created_work_order.created_by <> '81000000-0000-4000-8000-000000000001'::uuid
  then
    raise exception 'P0-008 same-shop work-order creation returned the wrong tenant or actor';
  end if;

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
