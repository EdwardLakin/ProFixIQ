-- P0-008: constraints and indexes for the runtime recovery snapshot.
-- The preceding migration creates only absent schema shapes; this layer restores
-- integrity rules without replacing any existing production constraint or index.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15min';

-- Production already has pg_trgm in public, while clean Supabase projects
-- conventionally install optional extensions in extensions. Preserve either
-- layout and resolve the operator-class schema explicitly below.
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

DO $p0_008$
DECLARE
  item record;
BEGIN
  FOR item IN
    SELECT *
    FROM (VALUES
      ('agent_actions', 'agent_actions_pkey', 'PRIMARY KEY (id)'),
      ('agent_attachments', 'agent_attachments_pkey', 'PRIMARY KEY (id)'),
      ('agent_jobs', 'agent_jobs_pkey', 'PRIMARY KEY (id)'),
      ('agent_requests', 'agent_requests_pkey', 'PRIMARY KEY (id)'),
      ('ai_action_previews', 'ai_action_previews_action_type_nonempty', 'CHECK (length(btrim(action_type)) > 0)'),
      ('ai_action_previews', 'ai_action_previews_domain_nonempty', 'CHECK (length(btrim(domain)) > 0)'),
      ('ai_action_previews', 'ai_action_previews_pkey', 'PRIMARY KEY (id)'),
      ('ai_action_previews', 'ai_action_previews_risk_tier_chk', 'CHECK (risk_tier = ANY (ARRAY[''low''::text, ''medium''::text, ''high''::text, ''critical''::text]))'),
      ('ai_action_previews', 'ai_action_previews_status_chk', 'CHECK (status = ANY (ARRAY[''draft''::text, ''ready''::text, ''approval_required''::text, ''approved''::text, ''rejected''::text, ''expired''::text, ''executed''::text, ''cancelled''::text, ''failed''::text]))'),
      ('ai_action_previews', 'ai_action_previews_subject_nonempty', 'CHECK (length(btrim(subject_type)) > 0)'),
      ('ai_events', 'ai_events_event_type_check', 'CHECK (event_type = ANY (ARRAY[''quote_created''::text, ''quote_updated''::text, ''work_order_created''::text, ''work_order_updated''::text, ''inspection_created''::text, ''inspection_updated''::text, ''booking_created''::text, ''booking_updated''::text, ''message''::text, ''customer_added''::text, ''vehicle_added''::text, ''parts_added''::text, ''labor_added''::text]))'),
      ('ai_events', 'ai_events_pkey', 'PRIMARY KEY (id)'),
      ('ai_evidence_snapshots', 'ai_evidence_snapshots_confidence_chk', 'CHECK (confidence IS NULL OR confidence >= 0::numeric AND confidence <= 1::numeric)'),
      ('ai_evidence_snapshots', 'ai_evidence_snapshots_domain_nonempty', 'CHECK (length(btrim(domain)) > 0)'),
      ('ai_evidence_snapshots', 'ai_evidence_snapshots_kind_nonempty', 'CHECK (length(btrim(evidence_kind)) > 0)'),
      ('ai_evidence_snapshots', 'ai_evidence_snapshots_pkey', 'PRIMARY KEY (id)'),
      ('ai_evidence_snapshots', 'ai_evidence_snapshots_subject_type_nonempty', 'CHECK (length(btrim(subject_type)) > 0)'),
      ('ai_recommendations', 'ai_recommendations_confidence_chk', 'CHECK (confidence IS NULL OR confidence >= 0::numeric AND confidence <= 1::numeric)'),
      ('ai_recommendations', 'ai_recommendations_domain_nonempty', 'CHECK (length(btrim(domain)) > 0)'),
      ('ai_recommendations', 'ai_recommendations_pkey', 'PRIMARY KEY (id)'),
      ('ai_recommendations', 'ai_recommendations_priority_chk', 'CHECK (priority = ANY (ARRAY[''low''::text, ''normal''::text, ''high''::text, ''urgent''::text]))'),
      ('ai_recommendations', 'ai_recommendations_risk_tier_chk', 'CHECK (risk_tier = ANY (ARRAY[''low''::text, ''medium''::text, ''high''::text, ''critical''::text]))'),
      ('ai_recommendations', 'ai_recommendations_status_chk', 'CHECK (status = ANY (ARRAY[''open''::text, ''acknowledged''::text, ''dismissed''::text, ''resolved''::text, ''expired''::text, ''superseded''::text]))'),
      ('ai_recommendations', 'ai_recommendations_subject_nonempty', 'CHECK (length(btrim(subject_type)) > 0)'),
      ('ai_recommendations', 'ai_recommendations_title_nonempty', 'CHECK (length(btrim(title)) > 0)'),
      ('ai_recommendations', 'ai_recommendations_type_nonempty', 'CHECK (length(btrim(recommendation_type)) > 0)'),
      ('ai_suggestion_feedback', 'ai_suggestion_feedback_anchor_chk', 'CHECK (suggestion_id IS NOT NULL OR work_order_line_id IS NOT NULL)'),
      ('ai_suggestion_feedback', 'ai_suggestion_feedback_line_requires_work_order_chk', 'CHECK (work_order_line_id IS NULL OR work_order_id IS NOT NULL)'),
      ('ai_suggestion_feedback', 'ai_suggestion_feedback_nonnegative_labor_chk', 'CHECK (COALESCE(labor_hours, 0::numeric) >= 0::numeric)'),
      ('ai_suggestion_feedback', 'ai_suggestion_feedback_pkey', 'PRIMARY KEY (id)'),
      ('ai_suggestion_feedback', 'ai_suggestion_feedback_shop_required_chk', 'CHECK (shop_id IS NOT NULL)'),
      ('ai_suggestion_feedback', 'ai_suggestion_feedback_title_required_chk', 'CHECK (COALESCE(TRIM(BOTH FROM title), ''''::text) <> ''''::text)'),
      ('ai_suggestion_feedback', 'ai_suggestion_feedback_work_order_required_chk', 'CHECK (work_order_id IS NOT NULL)'),
      ('ai_training_data', 'ai_training_data_pkey', 'PRIMARY KEY (id)'),
      ('assets', 'assets_asset_type_check', 'CHECK (asset_type = ANY (ARRAY[''video''::text, ''image''::text, ''audio''::text, ''document''::text, ''other''::text]))'),
      ('assets', 'assets_pkey', 'PRIMARY KEY (id)'),
      ('assets', 'assets_source_check', 'CHECK (source = ANY (ARRAY[''upload''::text, ''generated''::text, ''imported''::text]))'),
      ('assistant_daily_summaries', 'assistant_daily_summaries_date_not_future_far_chk', 'CHECK (summary_date <= (CURRENT_DATE + 7))'),
      ('assistant_daily_summaries', 'assistant_daily_summaries_pkey', 'PRIMARY KEY (id)'),
      ('assistant_daily_summaries', 'assistant_daily_summaries_role_required_chk', 'CHECK (COALESCE(TRIM(BOTH FROM role), ''''::text) <> ''''::text)'),
      ('assistant_daily_summaries', 'assistant_daily_summaries_shop_id_user_id_role_summary_date_key', 'UNIQUE (shop_id, user_id, role, summary_date)'),
      ('assistant_daily_summaries', 'assistant_daily_summaries_shop_required_chk', 'CHECK (shop_id IS NOT NULL)'),
      ('assistant_daily_summaries', 'assistant_daily_summaries_summary_date_required_chk', 'CHECK (summary_date IS NOT NULL)'),
      ('assistant_daily_summaries', 'assistant_daily_summaries_summary_text_required_chk', 'CHECK (COALESCE(TRIM(BOTH FROM summary_text), ''''::text) <> ''''::text)'),
      ('assistant_daily_summaries', 'assistant_daily_summaries_user_required_chk', 'CHECK (user_id IS NOT NULL)'),
      ('content_assets', 'content_assets_content_event_required_chk', 'CHECK (content_event_id IS NOT NULL)'),
      ('content_assets', 'content_assets_nonnegative_dimensions_chk', 'CHECK (COALESCE(width, 0) >= 0 AND COALESCE(height, 0) >= 0 AND COALESCE(duration_seconds, 0::numeric) >= 0::numeric)'),
      ('content_assets', 'content_assets_nonnegative_file_size_chk', 'CHECK (COALESCE(file_size_bytes, 0::bigint) >= 0)'),
      ('content_assets', 'content_assets_nonnegative_shape_chk', 'CHECK (COALESCE(width, 0) >= 0 AND COALESCE(height, 0) >= 0 AND COALESCE(duration_seconds, 0::numeric) >= 0::numeric)'),
      ('content_assets', 'content_assets_pkey', 'PRIMARY KEY (id)'),
      ('content_assets', 'content_assets_shop_required_chk', 'CHECK (shop_id IS NOT NULL)'),
      ('content_assets', 'content_assets_updated_after_created_chk', 'CHECK (created_at IS NULL OR updated_at IS NULL OR updated_at >= created_at)'),
      ('content_events', 'content_events_anchor_chk', 'CHECK (inspection_id IS NOT NULL OR work_order_id IS NOT NULL OR work_order_line_id IS NOT NULL OR vehicle_id IS NOT NULL OR customer_id IS NOT NULL)'),
      ('content_events', 'content_events_line_requires_work_order_chk', 'CHECK (work_order_line_id IS NULL OR work_order_id IS NOT NULL)'),
      ('content_events', 'content_events_pkey', 'PRIMARY KEY (id)'),
      ('content_events', 'content_events_shop_id_required_chk', 'CHECK (shop_id IS NOT NULL)'),
      ('content_events', 'content_events_updated_after_created_chk', 'CHECK (created_at IS NULL OR updated_at IS NULL OR updated_at >= created_at)'),
      ('content_pieces', 'content_pieces_pkey', 'PRIMARY KEY (id)'),
      ('content_platform_accounts', 'content_platform_accounts_pkey', 'PRIMARY KEY (id)'),
      ('content_publications', 'content_publications_pkey', 'PRIMARY KEY (id)'),
      ('content_templates', 'content_templates_pkey', 'PRIMARY KEY (id)'),
      ('content_templates', 'content_templates_shop_id_key_key', 'UNIQUE (shop_id, key)'),
      ('dashboard_layouts', 'dashboard_layouts_pkey', 'PRIMARY KEY (id)'),
      ('dashboard_user_layouts', 'dashboard_user_layouts_pkey', 'PRIMARY KEY (id)'),
      ('dashboard_user_layouts', 'dashboard_user_layouts_user_id_scope_key', 'UNIQUE (user_id, scope)'),
      ('expenses', 'expenses_pkey', 'PRIMARY KEY (id)'),
      ('fleet_dispatch_assignments', 'fleet_dispatch_assignments_pkey', 'PRIMARY KEY (id)'),
      ('fleet_dispatch_assignments', 'fleet_dispatch_assignments_state_check', 'CHECK (state = ANY (ARRAY[''pretrip_due''::text, ''en_route''::text, ''in_shop''::text, ''completed''::text]))'),
      ('fleet_inspection_schedules', 'fleet_inspection_dates_order_chk', 'CHECK (next_inspection_date IS NULL OR last_inspection_date IS NULL OR next_inspection_date >= last_inspection_date)'),
      ('fleet_inspection_schedules', 'fleet_inspection_schedules_pkey', 'PRIMARY KEY (id)'),
      ('fleet_inspection_schedules', 'fleet_inspection_schedules_vehicle_unique', 'UNIQUE (vehicle_id)'),
      ('fleet_pretrip_reports', 'fleet_pretrip_reports_pkey', 'PRIMARY KEY (id)'),
      ('fleet_pretrip_reports', 'fleet_pretrip_reports_status_check', 'CHECK (status = ANY (ARRAY[''open''::text, ''reviewed''::text, ''archived''::text]))'),
      ('fleet_program_tasks', 'fleet_program_tasks_pkey', 'PRIMARY KEY (id)'),
      ('fleet_programs', 'fleet_programs_pkey', 'PRIMARY KEY (id)'),
      ('fleet_service_requests', 'fleet_service_requests_pkey', 'PRIMARY KEY (id)'),
      ('fleet_service_requests', 'fleet_service_requests_severity_check', 'CHECK (severity = ANY (ARRAY[''safety''::text, ''compliance''::text, ''maintenance''::text, ''recommend''::text]))'),
      ('fleet_service_requests', 'fleet_service_requests_status_check', 'CHECK (status = ANY (ARRAY[''open''::text, ''scheduled''::text, ''completed''::text, ''cancelled''::text]))'),
      ('fleet_vehicles', 'fleet_vehicles_pkey', 'PRIMARY KEY (fleet_id, vehicle_id)'),
      ('guided_onboarding_events', 'guided_onboarding_events_pkey', 'PRIMARY KEY (id)'),
      ('guided_onboarding_sessions', 'guided_onboarding_sessions_pkey', 'PRIMARY KEY (id)'),
      ('guided_onboarding_sessions', 'guided_onboarding_sessions_status_check', 'CHECK (status = ANY (ARRAY[''active''::text, ''in_progress''::text, ''completed''::text, ''cancelled''::text]))'),
      ('guided_onboarding_steps', 'guided_onboarding_steps_pkey', 'PRIMARY KEY (id)'),
      ('guided_onboarding_steps', 'guided_onboarding_steps_session_id_step_key_key', 'UNIQUE (session_id, step_key)'),
      ('guided_onboarding_steps', 'guided_onboarding_steps_status_check', 'CHECK (status = ANY (ARRAY[''not_started''::text, ''in_progress''::text, ''completed''::text, ''skipped''::text]))'),
      ('inspection_results', 'inspection_results_pkey', 'PRIMARY KEY (id)'),
      ('inspection_smart_match_feedback', 'inspection_smart_match_feedback_action_check', 'CHECK (action = ANY (ARRAY[''accepted''::text, ''dismissed''::text]))'),
      ('inspection_smart_match_feedback', 'inspection_smart_match_feedback_pkey', 'PRIMARY KEY (id)'),
      ('inspection_smart_match_history', 'inspection_smart_match_history_pkey', 'PRIMARY KEY (id)'),
      ('inspection_template_suggestions', 'inspection_template_suggestions_pkey', 'PRIMARY KEY (id)'),
      ('invoice_documents', 'invoice_documents_pkey', 'PRIMARY KEY (id)'),
      ('maintenance_rules', 'maintenance_rules_pkey', 'PRIMARY KEY (id)'),
      ('maintenance_services', 'maintenance_services_pkey', 'PRIMARY KEY (code)'),
      ('maintenance_suggestions', 'maintenance_suggestions_pkey', 'PRIMARY KEY (work_order_id)'),
      ('menu_item_suggestions', 'menu_item_suggestions_pkey', 'PRIMARY KEY (id)'),
      ('menu_repair_item_parts', 'menu_repair_item_parts_pkey', 'PRIMARY KEY (id)'),
      ('menu_repair_item_pricing_parts', 'menu_repair_item_pricing_parts_pkey', 'PRIMARY KEY (id)'),
      ('menu_repair_item_pricing_snapshots', 'menu_repair_item_pricing_snapshots_pkey', 'PRIMARY KEY (id)'),
      ('menu_repair_item_pricing_snapshots', 'menu_repair_item_pricing_snapshots_status_check', 'CHECK (status = ANY (ARRAY[''fresh''::text, ''stale''::text, ''expired''::text, ''superseded''::text]))'),
      ('menu_repair_items', 'menu_repair_items_pkey', 'PRIMARY KEY (id)'),
      ('optimization_actions', 'optimization_actions_action_check', 'CHECK (action = ANY (ARRAY[''applied''::text, ''dismissed''::text]))'),
      ('optimization_actions', 'optimization_actions_pkey', 'PRIMARY KEY (id)'),
      ('optimization_actions', 'optimization_actions_type_check', 'CHECK (type = ANY (ARRAY[''pricing''::text, ''inspection''::text, ''revenue''::text]))'),
      ('organizations', 'organizations_pkey', 'PRIMARY KEY (id)'),
      ('payroll_timecards', 'payroll_timecards_clock_out_after_in', 'CHECK (clock_in IS NULL OR clock_out IS NULL OR clock_out > clock_in)'),
      ('payroll_timecards', 'payroll_timecards_pkey', 'PRIMARY KEY (id)'),
      ('payroll_timecards', 'payroll_timecards_positive_hours', 'CHECK (hours_worked IS NULL OR hours_worked >= 0::numeric)'),
      ('people_workforce_profiles', 'people_workforce_profiles_employment_status_check', 'CHECK (employment_status = ANY (ARRAY[''active''::text, ''inactive''::text, ''on_leave''::text]))'),
      ('people_workforce_profiles', 'people_workforce_profiles_pkey', 'PRIMARY KEY (id)'),
      ('people_workforce_profiles', 'people_workforce_profiles_shop_id_user_id_key', 'UNIQUE (shop_id, user_id)'),
      ('planner_events', 'planner_events_pkey', 'PRIMARY KEY (id)'),
      ('planner_runs', 'planner_runs_pkey', 'PRIMARY KEY (id)'),
      ('planner_runs', 'planner_runs_planner_kind_check', 'CHECK (planner_kind = ANY (ARRAY[''simple''::text, ''openai''::text, ''ops''::text, ''fleet''::text, ''approvals''::text]))'),
      ('planner_runs', 'planner_runs_status_check', 'CHECK (status = ANY (ARRAY[''running''::text, ''succeeded''::text, ''failed''::text, ''cancelled''::text]))'),
      ('property_assets', 'property_assets_pkey', 'PRIMARY KEY (id)'),
      ('property_inspection_signatures', 'property_inspection_signatures_payload_check', 'CHECK (signature_type = ''acknowledged''::text OR NULLIF(btrim(COALESCE(signature_text, ''''::text)), ''''::text) IS NOT NULL OR NULLIF(btrim(COALESCE(signature_image_path, ''''::text)), ''''::text) IS NOT NULL)'),
      ('property_inspection_signatures', 'property_inspection_signatures_pkey', 'PRIMARY KEY (id)'),
      ('property_inspection_signatures', 'property_inspection_signatures_signature_type_check', 'CHECK (signature_type = ANY (ARRAY[''typed''::text, ''drawn''::text, ''uploaded''::text, ''acknowledged''::text]))'),
      ('property_inspection_signatures', 'property_inspection_signatures_signer_role_check', 'CHECK (signer_role = ANY (ARRAY[''tenant''::text, ''property_manager''::text, ''owner''::text, ''internal''::text, ''witness''::text]))'),
      ('property_inspections', 'property_inspections_pkey', 'PRIMARY KEY (id)'),
      ('property_maintenance_requests', 'property_maintenance_requests_pkey', 'PRIMARY KEY (id)'),
      ('property_maintenance_requests', 'property_maintenance_requests_severity_check', 'CHECK (severity = ANY (ARRAY[''emergency''::text, ''urgent''::text, ''routine''::text, ''recommended''::text])) NOT VALID'),
      ('property_maintenance_requests', 'property_maintenance_requests_status_check', 'CHECK (status = ANY (ARRAY[''open''::text, ''triaged''::text, ''approval_required''::text, ''assigned''::text, ''scheduled''::text, ''in_progress''::text, ''completed''::text, ''cancelled''::text])) NOT VALID'),
      ('property_members', 'property_members_pkey', 'PRIMARY KEY (id)'),
      ('property_members', 'property_members_role_check', 'CHECK (role = ANY (ARRAY[''property_manager''::text, ''owner_approver''::text, ''tenant_requester''::text, ''vendor''::text, ''viewer''::text])) NOT VALID'),
      ('property_portal_invites', 'property_portal_invites_pkey', 'PRIMARY KEY (id)'),
      ('property_portal_invites', 'property_portal_invites_role_check', 'CHECK (role = ANY (ARRAY[''property_manager''::text, ''owner_approver''::text, ''tenant_requester''::text, ''viewer''::text]))'),
      ('property_portal_invites', 'property_portal_invites_scope_check', 'CHECK (role = ''property_manager''::text OR portfolio_id IS NOT NULL OR property_id IS NOT NULL OR unit_id IS NOT NULL)'),
      ('property_portal_invites', 'property_portal_invites_status_check', 'CHECK (status = ANY (ARRAY[''pending''::text, ''accepted''::text, ''expired''::text, ''revoked''::text]))'),
      ('property_portfolios', 'property_portfolios_pkey', 'PRIMARY KEY (id)'),
      ('property_properties', 'property_properties_pkey', 'PRIMARY KEY (id)'),
      ('property_request_attachments', 'property_request_attachments_file_kind_chk', 'CHECK (file_kind = ANY (ARRAY[''image''::text, ''video''::text, ''document''::text, ''other''::text]))'),
      ('property_request_attachments', 'property_request_attachments_pkey', 'PRIMARY KEY (id)'),
      ('property_request_events', 'property_request_events_actor_type_chk', 'CHECK (actor_type = ANY (ARRAY[''internal''::text, ''tenant''::text, ''vendor''::text, ''system''::text]))'),
      ('property_request_events', 'property_request_events_event_type_chk', 'CHECK (event_type = ANY (ARRAY[''request_created''::text, ''status_changed''::text, ''comment''::text, ''internal_note''::text, ''vendor_assigned''::text, ''work_order_linked''::text, ''inspection_linked''::text, ''attachment_added''::text, ''read_receipt''::text, ''system''::text]))'),
      ('property_request_events', 'property_request_events_pkey', 'PRIMARY KEY (id)'),
      ('property_request_events', 'property_request_events_visibility_chk', 'CHECK (visibility = ANY (ARRAY[''internal''::text, ''tenant_visible''::text, ''vendor_visible''::text, ''all_parties''::text]))'),
      ('property_units', 'property_units_pkey', 'PRIMARY KEY (id)'),
      ('property_vendor_assignments', 'property_vendor_assignments_has_parent_check', 'CHECK (request_id IS NOT NULL OR work_order_id IS NOT NULL) NOT VALID'),
      ('property_vendor_assignments', 'property_vendor_assignments_pkey', 'PRIMARY KEY (id)'),
      ('property_vendors', 'property_vendors_pkey', 'PRIMARY KEY (id)'),
      ('quickbooks_connections', 'quickbooks_connections_environment_check', 'CHECK (environment = ANY (ARRAY[''sandbox''::text, ''production''::text]))'),
      ('quickbooks_connections', 'quickbooks_connections_pkey', 'PRIMARY KEY (id)'),
      ('quickbooks_connections', 'quickbooks_connections_realm_unique', 'UNIQUE (realm_id)'),
      ('quickbooks_connections', 'quickbooks_connections_shop_unique', 'UNIQUE (shop_id)'),
      ('quickbooks_customer_links', 'quickbooks_customer_links_customer_unique', 'UNIQUE (customer_id)'),
      ('quickbooks_customer_links', 'quickbooks_customer_links_pkey', 'PRIMARY KEY (id)'),
      ('quickbooks_customer_links', 'quickbooks_customer_links_shop_customer_unique', 'UNIQUE (shop_id, customer_id)'),
      ('quickbooks_customer_links', 'quickbooks_customer_links_shop_qb_customer_unique', 'UNIQUE (shop_id, qb_customer_id)'),
      ('quickbooks_customer_links', 'quickbooks_customer_links_sync_status_check', 'CHECK (sync_status = ANY (ARRAY[''pending''::text, ''synced''::text, ''error''::text]))'),
      ('quickbooks_sync_events', 'quickbooks_sync_events_entity_type_check', 'CHECK (entity_type = ANY (ARRAY[''connection''::text, ''customer''::text, ''invoice''::text, ''item''::text, ''token''::text]))'),
      ('quickbooks_sync_events', 'quickbooks_sync_events_pkey', 'PRIMARY KEY (id)'),
      ('quickbooks_sync_events', 'quickbooks_sync_events_status_check', 'CHECK (status = ANY (ARRAY[''started''::text, ''succeeded''::text, ''failed''::text]))'),
      ('shop_ai_profiles', 'shop_ai_profiles_pkey', 'PRIMARY KEY (shop_id)'),
      ('shop_boost_import_provenance', 'shop_boost_import_provenance_domain_check', 'CHECK (domain = ANY (ARRAY[''customer''::text, ''vehicle''::text, ''work_order''::text, ''work_order_line''::text, ''invoice''::text]))'),
      ('shop_boost_import_provenance', 'shop_boost_import_provenance_pkey', 'PRIMARY KEY (id)'),
      ('shop_boost_import_provenance', 'shop_boost_import_provenance_shop_id_intake_id_domain_recor_key', 'UNIQUE (shop_id, intake_id, domain, record_id)'),
      ('shop_boost_import_reset_audit_events', 'shop_boost_import_reset_audit_events_mode_check', 'CHECK (mode = ANY (ARRAY[''preview''::text, ''execute''::text]))'),
      ('shop_boost_import_reset_audit_events', 'shop_boost_import_reset_audit_events_pkey', 'PRIMARY KEY (id)'),
      ('shop_boost_import_reset_audit_events', 'shop_boost_import_reset_audit_events_scope_check', 'CHECK (scope = ANY (ARRAY[''intake''::text, ''shop''::text]))'),
      ('shop_boost_intakes', 'shop_boost_intakes_pkey', 'PRIMARY KEY (id)'),
      ('shop_boost_intakes', 'shop_boost_intakes_status_check', 'CHECK (status = ANY (ARRAY[''pending''::text, ''processing''::text, ''completed''::text, ''failed''::text]))'),
      ('shop_boost_integrity_reports', 'shop_boost_integrity_reports_pkey', 'PRIMARY KEY (id)'),
      ('shop_boost_review_audit_events', 'shop_boost_review_audit_events_pkey', 'PRIMARY KEY (id)'),
      ('shop_boost_review_items', 'shop_boost_review_items_ignore_reason_check', 'CHECK (ignore_reason_code IS NULL OR (ignore_reason_code = ANY (ARRAY[''duplicate''::text, ''obsolete''::text, ''invalid''::text, ''test_data''::text, ''intentionally_skipped''::text, ''unsupported_format''::text, ''other''::text])))'),
      ('shop_boost_review_items', 'shop_boost_review_items_pkey', 'PRIMARY KEY (id)'),
      ('shop_boost_review_items', 'shop_boost_review_items_recommended_action_check', 'CHECK (recommended_action IS NULL OR (recommended_action = ANY (ARRAY[''link_existing''::text, ''create_new''::text, ''merge_candidate''::text, ''ignore''::text])))'),
      ('shop_boost_review_items', 'shop_boost_review_items_status_check', 'CHECK (status = ANY (ARRAY[''pending''::text, ''resolved''::text, ''materialized''::text, ''failed_materialization''::text, ''ignored''::text]))'),
      ('shop_boost_row_results', 'shop_boost_row_results_pkey', 'PRIMARY KEY (id)'),
      ('shop_brand_assets', 'shop_brand_assets_file_ref_chk', 'CHECK (file_url IS NOT NULL OR storage_path IS NOT NULL)'),
      ('shop_brand_assets', 'shop_brand_assets_pkey', 'PRIMARY KEY (id)'),
      ('shop_brand_profiles', 'shop_brand_profiles_accent_color_chk', 'CHECK (accent_color IS NULL OR accent_color ~ ''^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$''::text)'),
      ('shop_brand_profiles', 'shop_brand_profiles_pkey', 'PRIMARY KEY (shop_id)'),
      ('shop_brand_profiles', 'shop_brand_profiles_primary_color_chk', 'CHECK (primary_color IS NULL OR primary_color ~ ''^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$''::text)'),
      ('shop_brand_profiles', 'shop_brand_profiles_radius_scale_chk', 'CHECK (radius_scale IS NULL OR (radius_scale = ANY (ARRAY[''none''::text, ''sm''::text, ''md''::text, ''lg''::text, ''xl''::text])))'),
      ('shop_brand_profiles', 'shop_brand_profiles_secondary_color_chk', 'CHECK (secondary_color IS NULL OR secondary_color ~ ''^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$''::text)'),
      ('shop_brand_profiles', 'shop_brand_profiles_shadow_style_chk', 'CHECK (shadow_style IS NULL OR (shadow_style = ANY (ARRAY[''none''::text, ''soft''::text, ''medium''::text, ''strong''::text])))'),
      ('shop_brand_profiles', 'shop_brand_profiles_theme_mode_chk', 'CHECK (theme_mode IS NULL OR (theme_mode = ANY (ARRAY[''light''::text, ''dark''::text, ''system''::text])))'),
      ('shop_health_snapshots', 'shop_health_snapshots_pkey', 'PRIMARY KEY (id)'),
      ('shop_import_files', 'shop_import_files_pkey', 'PRIMARY KEY (id)'),
      ('shop_import_rows', 'shop_import_rows_pkey', 'PRIMARY KEY (id)'),
      ('shop_maintenance_service_map', 'shop_maintenance_service_map_pkey', 'PRIMARY KEY (id)'),
      ('shop_maintenance_service_map', 'shop_maintenance_service_map_target_chk', 'CHECK (menu_item_id IS NOT NULL OR menu_repair_item_id IS NOT NULL)'),
      ('shop_maintenance_service_map', 'shop_maintenance_service_map_unique', 'UNIQUE (shop_id, service_code)'),
      ('shop_members', 'shop_members_pkey', 'PRIMARY KEY (shop_id, user_id)'),
      ('shop_members', 'shop_members_role_check', 'CHECK (role = ANY (ARRAY[''owner''::text, ''admin''::text, ''manager''::text, ''advisor''::text, ''mechanic''::text, ''parts''::text, ''driver''::text, ''dispatcher''::text, ''fleet_manager''::text, ''viewer''::text]))'),
      ('shop_onboarding_activation_rules', 'shop_onboarding_activation_rules_pkey', 'PRIMARY KEY (id)'),
      ('shop_onboarding_activation_rules', 'shop_onboarding_activation_rules_shop_id_key', 'UNIQUE (shop_id)'),
      ('shop_onboarding_activation_rules', 'shop_onboarding_activation_rules_threshold_check', 'CHECK (min_customer_rows >= 0 AND min_vehicle_rows >= 0 AND max_pending_review_ratio >= 0::numeric AND max_pending_review_ratio <= 1::numeric AND max_failed_ratio >= 0::numeric AND max_failed_ratio <= 1::numeric)'),
      ('shop_onboarding_attempts', 'shop_onboarding_attempts_pkey', 'PRIMARY KEY (id)'),
      ('shop_onboarding_attempts', 'shop_onboarding_attempts_status_check', 'CHECK (status = ANY (ARRAY[''running''::text, ''succeeded''::text, ''failed''::text, ''canceled''::text]))'),
      ('shop_onboarding_jobs', 'shop_onboarding_jobs_attempt_count_check', 'CHECK (attempt_count >= 0 AND max_attempts >= 1 AND attempt_count <= (max_attempts + 1000))'),
      ('shop_onboarding_jobs', 'shop_onboarding_jobs_domain_check', 'CHECK (domain IS NULL OR (domain = ANY (ARRAY[''global''::text, ''customers''::text, ''vehicles''::text, ''history''::text, ''invoices''::text, ''parts''::text, ''staff''::text, ''profile''::text])))'),
      ('shop_onboarding_jobs', 'shop_onboarding_jobs_idempotency_key_key', 'UNIQUE (idempotency_key)'),
      ('shop_onboarding_jobs', 'shop_onboarding_jobs_job_type_check', 'CHECK (job_type = ANY (ARRAY[''profile''::text, ''normalize''::text, ''match''::text, ''materialize''::text, ''verify''::text, ''activate''::text]))'),
      ('shop_onboarding_jobs', 'shop_onboarding_jobs_pkey', 'PRIMARY KEY (id)'),
      ('shop_onboarding_jobs', 'shop_onboarding_jobs_status_check', 'CHECK (status = ANY (ARRAY[''queued''::text, ''running''::text, ''succeeded''::text, ''retryable_failed''::text, ''blocked_manual''::text, ''terminal_failed''::text, ''canceled''::text]))'),
      ('shop_onboarding_runs', 'shop_onboarding_runs_activation_status_check', 'CHECK (activation_status = ANY (ARRAY[''not_eligible''::text, ''eligible''::text, ''activated''::text, ''blocked''::text]))'),
      ('shop_onboarding_runs', 'shop_onboarding_runs_attempt_count_check', 'CHECK (attempt_count >= 0 AND max_attempts >= 1 AND attempt_count <= (max_attempts + 1000))'),
      ('shop_onboarding_runs', 'shop_onboarding_runs_pkey', 'PRIMARY KEY (id)'),
      ('shop_onboarding_runs', 'shop_onboarding_runs_shop_id_intake_id_key', 'UNIQUE (shop_id, intake_id)'),
      ('shop_onboarding_runs', 'shop_onboarding_runs_state_check', 'CHECK (state = ANY (ARRAY[''uploaded''::text, ''normalized''::text, ''matched''::text, ''materialized''::text, ''verified''::text, ''activated''::text, ''blocked_manual''::text, ''retryable_failed''::text, ''terminal_failed''::text]))'),
      ('shop_onboarding_runs', 'shop_onboarding_runs_trigger_source_check', 'CHECK (trigger_source = ANY (ARRAY[''manual''::text, ''cron''::text, ''api''::text, ''demo''::text, ''system''::text]))'),
      ('shop_parts_import_match_candidates', 'shop_parts_import_match_candidates_pkey', 'PRIMARY KEY (id)'),
      ('shop_parts_import_staging', 'shop_parts_import_staging_pkey', 'PRIMARY KEY (id)'),
      ('shop_parts_source_aliases', 'shop_parts_source_aliases_pkey', 'PRIMARY KEY (id)'),
      ('shop_parts_source_aliases', 'shop_parts_source_aliases_shop_id_part_id_source_hash_key', 'UNIQUE (shop_id, part_id, source_hash)'),
      ('shop_vehicle_menu_items', 'shop_vehicle_menu_items_pkey', 'PRIMARY KEY (id)'),
      ('shop_vehicle_menu_items', 'shop_vehicle_menu_items_shop_id_vehicle_menu_id_key', 'UNIQUE (shop_id, vehicle_menu_id)'),
      ('shopreel_drafts', 'shopreel_drafts_opportunity_id_key', 'UNIQUE (opportunity_id)'),
      ('shopreel_drafts', 'shopreel_drafts_pkey', 'PRIMARY KEY (id)'),
      ('shopreel_event_deliveries', 'shopreel_event_deliveries_pkey', 'PRIMARY KEY (id)'),
      ('shopreel_integrations', 'shopreel_integrations_pkey', 'PRIMARY KEY (id)'),
      ('shopreel_integrations', 'shopreel_integrations_shop_unique', 'UNIQUE (shop_id)'),
      ('shopreel_manual_assets', 'shopreel_manual_assets_asset_type_check', 'CHECK (asset_type = ANY (ARRAY[''image''::text, ''video''::text, ''mixed''::text]))'),
      ('shopreel_manual_assets', 'shopreel_manual_assets_content_goal_check', 'CHECK (content_goal = ANY (ARRAY[''educational_tip''::text, ''before_after''::text, ''repair_story''::text, ''promotion''::text, ''customer_trust''::text, ''team_culture''::text, ''seasonal_reminder''::text, ''product_spotlight''::text]))'),
      ('shopreel_manual_assets', 'shopreel_manual_assets_pkey', 'PRIMARY KEY (id)'),
      ('shopreel_manual_assets', 'shopreel_manual_assets_status_check', 'CHECK (status = ANY (ARRAY[''draft''::text, ''uploaded''::text, ''processing''::text, ''ready''::text, ''archived''::text, ''failed''::text]))'),
      ('shopreel_opportunities', 'shopreel_opportunities_pkey', 'PRIMARY KEY (id)'),
      ('shopreel_opportunities', 'shopreel_opportunities_story_source_id_key', 'UNIQUE (story_source_id)'),
      ('shopreel_opportunity_status_history', 'shopreel_opportunity_status_history_pkey', 'PRIMARY KEY (id)'),
      ('shopreel_publications', 'shopreel_publications_pkey', 'PRIMARY KEY (id)'),
      ('shopreel_publications', 'shopreel_publications_status_check', 'CHECK (status = ANY (ARRAY[''queued''::text, ''scheduled''::text, ''publishing''::text, ''published''::text, ''failed''::text, ''cancelled''::text]))'),
      ('shopreel_publish_jobs', 'shopreel_publish_jobs_pkey', 'PRIMARY KEY (id)'),
      ('shopreel_social_connections', 'shopreel_social_connections_pkey', 'PRIMARY KEY (id)'),
      ('shopreel_story_sources', 'shopreel_story_sources_pkey', 'PRIMARY KEY (id)'),
      ('shopreel_story_sources', 'shopreel_story_sources_shop_id_event_key_key', 'UNIQUE (shop_id, event_key)'),
      ('staff_certifications', 'staff_certifications_pkey', 'PRIMARY KEY (id)'),
      ('staff_certifications', 'staff_certifications_status_check', 'CHECK (status = ANY (ARRAY[''active''::text, ''expired''::text, ''revoked''::text, ''pending''::text]))'),
      ('staff_invite_candidates', 'staff_invite_candidates_confidence_check', 'CHECK (confidence IS NULL OR confidence >= 0::numeric AND confidence <= 1::numeric)'),
      ('staff_invite_candidates', 'staff_invite_candidates_pkey', 'PRIMARY KEY (id)'),
      ('staff_invite_candidates', 'staff_invite_candidates_shop_email_lc_uq', 'UNIQUE (shop_id, email_lc)'),
      ('staff_invite_candidates', 'staff_invite_candidates_shop_username_lc_uq', 'UNIQUE (shop_id, username_lc)'),
      ('staff_invite_suggestions', 'staff_invite_suggestions_pkey', 'PRIMARY KEY (id)'),
      ('supplier_quote_batch_rows', 'supplier_quote_batch_rows_batch_required_chk', 'CHECK (batch_id IS NOT NULL)'),
      ('supplier_quote_batch_rows', 'supplier_quote_batch_rows_nonnegative_values_chk', 'CHECK (COALESCE(raw_qty, 0::numeric) >= 0::numeric AND COALESCE(raw_unit_cost, 0::numeric) >= 0::numeric AND COALESCE(raw_sell, 0::numeric) >= 0::numeric)'),
      ('supplier_quote_batch_rows', 'supplier_quote_batch_rows_pkey', 'PRIMARY KEY (id)'),
      ('supplier_quote_batch_rows', 'supplier_quote_batch_rows_review_status_chk', 'CHECK (review_status = ANY (ARRAY[''pending''::text, ''approved''::text, ''rejected''::text]))'),
      ('supplier_quote_batch_rows', 'supplier_quote_batch_rows_status_check', 'CHECK (review_status = ANY (ARRAY[''matched''::text, ''needs_review''::text, ''unmatched''::text]))'),
      ('supplier_quote_batches', 'supplier_quote_batches_pkey', 'PRIMARY KEY (id)'),
      ('supplier_quote_batches', 'supplier_quote_batches_processed_requires_timestamp_chk', 'CHECK (status <> ''processed''::text OR processed_at IS NOT NULL)'),
      ('supplier_quote_batches', 'supplier_quote_batches_shop_required_chk', 'CHECK (shop_id IS NOT NULL)'),
      ('supplier_quote_batches', 'supplier_quote_batches_source_type_required_chk', 'CHECK (COALESCE(TRIM(BOTH FROM source_type), ''''::text) <> ''''::text)'),
      ('supplier_quote_batches', 'supplier_quote_batches_status_check', 'CHECK (status = ANY (ARRAY[''uploaded''::text, ''parsed''::text, ''review_required''::text, ''applied''::text, ''failed''::text]))'),
      ('supplier_quote_batches', 'supplier_quote_batches_status_chk', 'CHECK (status = ANY (ARRAY[''uploaded''::text, ''processing''::text, ''processed''::text, ''failed''::text]))'),
      ('user_theme_preferences', 'user_theme_preferences_pkey', 'PRIMARY KEY (user_id)'),
      ('user_theme_preferences', 'user_theme_preferences_radius_scale_check', 'CHECK (radius_scale = ANY (ARRAY[''none''::text, ''sm''::text, ''md''::text, ''lg''::text, ''xl''::text]))'),
      ('user_theme_preferences', 'user_theme_preferences_radius_scale_chk', 'CHECK (radius_scale IS NULL OR (radius_scale = ANY (ARRAY[''none''::text, ''sm''::text, ''md''::text, ''lg''::text, ''xl''::text])))'),
      ('user_theme_preferences', 'user_theme_preferences_shadow_style_check', 'CHECK (shadow_style = ANY (ARRAY[''none''::text, ''soft''::text, ''medium''::text, ''strong''::text]))'),
      ('user_theme_preferences', 'user_theme_preferences_shadow_style_chk', 'CHECK (shadow_style IS NULL OR (shadow_style = ANY (ARRAY[''none''::text, ''soft''::text, ''medium''::text, ''strong''::text])))'),
      ('user_theme_preferences', 'user_theme_preferences_theme_mode_check', 'CHECK (theme_mode = ANY (ARRAY[''light''::text, ''dark''::text, ''system''::text]))'),
      ('user_theme_preferences', 'user_theme_preferences_theme_mode_chk', 'CHECK (theme_mode IS NULL OR (theme_mode = ANY (ARRAY[''light''::text, ''dark''::text, ''system''::text])))'),
      ('vehicle_menus', 'vehicle_menus_pkey', 'PRIMARY KEY (id)'),
      ('videos', 'videos_content_type_check', 'CHECK (content_type = ANY (ARRAY[''workflow_demo''::text, ''repair_story''::text, ''inspection_highlight''::text, ''before_after''::text, ''educational_tip''::text, ''how_to''::text, ''findings_on_vehicle''::text]))'),
      ('videos', 'videos_human_rating_check', 'CHECK (human_rating >= 1 AND human_rating <= 5)'),
      ('videos', 'videos_pkey', 'PRIMARY KEY (id)'),
      ('videos', 'videos_status_check', 'CHECK (status = ANY (ARRAY[''draft''::text, ''queued''::text, ''processing''::text, ''ready''::text, ''published''::text, ''failed''::text, ''archived''::text]))'),
      ('work_order_invoice_reviews', 'work_order_invoice_reviews_pkey', 'PRIMARY KEY (id)'),
      ('work_order_line_ai', 'work_order_line_ai_anchor_chk', 'CHECK (intake_id IS NOT NULL OR work_order_id IS NOT NULL OR work_order_line_id IS NOT NULL)'),
      ('work_order_line_ai', 'work_order_line_ai_confidence_present_chk', 'CHECK (confidence IS NULL OR confidence >= 0::numeric AND confidence <= 1::numeric)'),
      ('work_order_line_ai', 'work_order_line_ai_confidence_range_chk', 'CHECK (confidence IS NULL OR confidence >= 0::numeric AND confidence <= 1::numeric)'),
      ('work_order_line_ai', 'work_order_line_ai_line_required_chk', 'CHECK (work_order_line_id IS NOT NULL)'),
      ('work_order_line_ai', 'work_order_line_ai_pkey', 'PRIMARY KEY (id)'),
      ('work_order_line_ai', 'work_order_line_ai_shop_required_chk', 'CHECK (shop_id IS NOT NULL)'),
      ('work_order_line_ai', 'work_order_line_ai_summary_required_chk', 'CHECK (COALESCE(TRIM(BOTH FROM summary), ''''::text) <> ''''::text)'),
      ('work_order_line_ai', 'work_order_line_ai_work_order_required_chk', 'CHECK (work_order_id IS NOT NULL)'),
      ('work_order_line_dtc_threads', 'work_order_line_dtc_threads_dtc_code_chk', 'CHECK (dtc_code IS NULL OR length(btrim(dtc_code)) > 0)'),
      ('work_order_line_dtc_threads', 'work_order_line_dtc_threads_messages_array_chk', 'CHECK (jsonb_typeof(messages) = ''array''::text)'),
      ('work_order_line_dtc_threads', 'work_order_line_dtc_threads_pkey', 'PRIMARY KEY (id)'),
      ('work_order_line_dtc_threads', 'work_order_line_dtc_threads_work_order_line_id_key', 'UNIQUE (work_order_line_id)'),
      ('workforce_document_requirements', 'workforce_document_requirements_accept_statuses_not_empty_chk', 'CHECK (COALESCE(array_length(accept_statuses, 1), 0) > 0)'),
      ('workforce_document_requirements', 'workforce_document_requirements_doc_type_chk', 'CHECK (doc_type = ANY (ARRAY[''drivers_license''::text, ''certification''::text, ''tax_form''::text, ''other''::text]))'),
      ('workforce_document_requirements', 'workforce_document_requirements_expires_warning_days_chk', 'CHECK (expires_warning_days >= 0 AND expires_warning_days <= 365)'),
      ('workforce_document_requirements', 'workforce_document_requirements_pkey', 'PRIMARY KEY (id)'),
      ('workforce_document_requirements', 'workforce_document_requirements_review_statuses_not_empty_chk', 'CHECK (COALESCE(array_length(review_statuses, 1), 0) > 0)'),
      ('agent_attachments', 'agent_attachments_agent_request_id_fkey', 'FOREIGN KEY (agent_request_id) REFERENCES agent_requests(id) ON DELETE CASCADE'),
      ('agent_attachments', 'agent_attachments_created_by_fkey', 'FOREIGN KEY (created_by) REFERENCES profiles(id)'),
      ('agent_requests', 'agent_requests_reporter_id_fkey', 'FOREIGN KEY (reporter_id) REFERENCES profiles(id) ON DELETE SET NULL'),
      ('agent_requests', 'agent_requests_run_id_fkey', 'FOREIGN KEY (run_id) REFERENCES agent_runs(id)'),
      ('agent_requests', 'agent_requests_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE SET NULL'),
      ('ai_action_previews', 'ai_action_previews_created_by_fkey', 'FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL'),
      ('ai_action_previews', 'ai_action_previews_evidence_snapshot_id_fkey', 'FOREIGN KEY (evidence_snapshot_id) REFERENCES ai_evidence_snapshots(id) ON DELETE SET NULL'),
      ('ai_action_previews', 'ai_action_previews_recommendation_id_fkey', 'FOREIGN KEY (recommendation_id) REFERENCES ai_recommendations(id) ON DELETE SET NULL'),
      ('ai_action_previews', 'ai_action_previews_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('ai_events', 'ai_events_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('ai_events', 'ai_events_user_id_fkey', 'FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL'),
      ('ai_evidence_snapshots', 'ai_evidence_snapshots_created_by_fkey', 'FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL'),
      ('ai_evidence_snapshots', 'ai_evidence_snapshots_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('ai_recommendations', 'ai_recommendations_assigned_to_fkey', 'FOREIGN KEY (assigned_to) REFERENCES profiles(id) ON DELETE SET NULL'),
      ('ai_recommendations', 'ai_recommendations_created_by_fkey', 'FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL'),
      ('ai_recommendations', 'ai_recommendations_dismissed_by_fkey', 'FOREIGN KEY (dismissed_by) REFERENCES profiles(id) ON DELETE SET NULL'),
      ('ai_recommendations', 'ai_recommendations_evidence_snapshot_id_fkey', 'FOREIGN KEY (evidence_snapshot_id) REFERENCES ai_evidence_snapshots(id) ON DELETE SET NULL'),
      ('ai_recommendations', 'ai_recommendations_resolved_by_fkey', 'FOREIGN KEY (resolved_by) REFERENCES profiles(id) ON DELETE SET NULL'),
      ('ai_recommendations', 'ai_recommendations_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('ai_suggestion_feedback', 'ai_suggestion_feedback_created_by_fkey', 'FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL'),
      ('ai_suggestion_feedback', 'ai_suggestion_feedback_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('ai_suggestion_feedback', 'ai_suggestion_feedback_work_order_id_fkey', 'FOREIGN KEY (work_order_id) REFERENCES work_orders(id) ON DELETE CASCADE'),
      ('ai_suggestion_feedback', 'ai_suggestion_feedback_work_order_line_id_fkey', 'FOREIGN KEY (work_order_line_id) REFERENCES work_order_lines(id) ON DELETE SET NULL'),
      ('ai_training_data', 'ai_training_data_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('ai_training_data', 'ai_training_data_source_event_id_fkey', 'FOREIGN KEY (source_event_id) REFERENCES ai_events(id) ON DELETE CASCADE'),
      ('assets', 'assets_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('assets', 'assets_uploaded_by_fkey', 'FOREIGN KEY (uploaded_by) REFERENCES profiles(id) ON DELETE SET NULL'),
      ('assistant_daily_summaries', 'assistant_daily_summaries_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('assistant_daily_summaries', 'assistant_daily_summaries_user_id_fkey', 'FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE'),
      ('content_assets', 'content_assets_asset_id_fkey', 'FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE'),
      ('content_assets', 'content_assets_content_event_id_fkey', 'FOREIGN KEY (content_event_id) REFERENCES content_events(id) ON DELETE CASCADE'),
      ('content_assets', 'content_assets_created_by_fkey', 'FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL'),
      ('content_assets', 'content_assets_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('content_events', 'content_events_approved_by_fkey', 'FOREIGN KEY (approved_by) REFERENCES auth.users(id) ON DELETE SET NULL'),
      ('content_events', 'content_events_created_by_fkey', 'FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL'),
      ('content_events', 'content_events_customer_id_fkey', 'FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL'),
      ('content_events', 'content_events_inspection_id_fkey', 'FOREIGN KEY (inspection_id) REFERENCES inspections(id) ON DELETE SET NULL'),
      ('content_events', 'content_events_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('content_events', 'content_events_vehicle_id_fkey', 'FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL'),
      ('content_events', 'content_events_work_order_id_fkey', 'FOREIGN KEY (work_order_id) REFERENCES work_orders(id) ON DELETE SET NULL'),
      ('content_events', 'content_events_work_order_line_id_fkey', 'FOREIGN KEY (work_order_line_id) REFERENCES work_order_lines(id) ON DELETE SET NULL'),
      ('content_pieces', 'content_pieces_approved_by_fkey', 'FOREIGN KEY (approved_by) REFERENCES auth.users(id) ON DELETE SET NULL'),
      ('content_pieces', 'content_pieces_content_event_id_fkey', 'FOREIGN KEY (content_event_id) REFERENCES content_events(id) ON DELETE CASCADE'),
      ('content_pieces', 'content_pieces_created_by_fkey', 'FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL'),
      ('content_pieces', 'content_pieces_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('content_platform_accounts', 'content_platform_accounts_created_by_fkey', 'FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL'),
      ('content_platform_accounts', 'content_platform_accounts_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('content_publications', 'content_publications_content_asset_id_fkey', 'FOREIGN KEY (content_asset_id) REFERENCES content_assets(id) ON DELETE SET NULL'),
      ('content_publications', 'content_publications_content_event_id_fkey', 'FOREIGN KEY (content_event_id) REFERENCES content_events(id) ON DELETE CASCADE'),
      ('content_publications', 'content_publications_content_piece_id_fkey', 'FOREIGN KEY (content_piece_id) REFERENCES content_pieces(id) ON DELETE SET NULL'),
      ('content_publications', 'content_publications_created_by_fkey', 'FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL'),
      ('content_publications', 'content_publications_platform_account_id_fkey', 'FOREIGN KEY (platform_account_id) REFERENCES content_platform_accounts(id) ON DELETE SET NULL'),
      ('content_publications', 'content_publications_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('content_templates', 'content_templates_created_by_fkey', 'FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL'),
      ('content_templates', 'content_templates_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('dashboard_layouts', 'dashboard_layouts_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('dashboard_layouts', 'dashboard_layouts_user_id_fkey', 'FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE'),
      ('dashboard_user_layouts', 'dashboard_user_layouts_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('dashboard_user_layouts', 'dashboard_user_layouts_user_id_fkey', 'FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE'),
      ('expenses', 'expenses_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('expenses', 'expenses_work_order_id_fkey', 'FOREIGN KEY (work_order_id) REFERENCES work_orders(id) ON DELETE SET NULL'),
      ('fleet_dispatch_assignments', 'fleet_dispatch_assignments_driver_profile_id_fkey', 'FOREIGN KEY (driver_profile_id) REFERENCES profiles(id) ON DELETE CASCADE'),
      ('fleet_dispatch_assignments', 'fleet_dispatch_assignments_fleet_fk', 'FOREIGN KEY (fleet_id) REFERENCES fleets(id) ON DELETE CASCADE'),
      ('fleet_dispatch_assignments', 'fleet_dispatch_assignments_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('fleet_dispatch_assignments', 'fleet_dispatch_assignments_vehicle_id_fkey', 'FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE'),
      ('fleet_inspection_schedules', 'fleet_inspection_schedules_fleet_fk', 'FOREIGN KEY (fleet_id) REFERENCES fleets(id) ON DELETE CASCADE'),
      ('fleet_inspection_schedules', 'fleet_inspection_schedules_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('fleet_inspection_schedules', 'fleet_inspection_schedules_vehicle_id_fkey', 'FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE'),
      ('fleet_pretrip_reports', 'fleet_pretrip_reports_driver_profile_id_fkey', 'FOREIGN KEY (driver_profile_id) REFERENCES profiles(id) ON DELETE SET NULL'),
      ('fleet_pretrip_reports', 'fleet_pretrip_reports_fleet_fk', 'FOREIGN KEY (fleet_id) REFERENCES fleets(id) ON DELETE CASCADE'),
      ('fleet_pretrip_reports', 'fleet_pretrip_reports_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('fleet_pretrip_reports', 'fleet_pretrip_reports_vehicle_id_fkey', 'FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE'),
      ('fleet_program_tasks', 'fleet_program_tasks_program_id_fkey', 'FOREIGN KEY (program_id) REFERENCES fleet_programs(id) ON DELETE CASCADE'),
      ('fleet_programs', 'fleet_programs_fleet_id_fkey', 'FOREIGN KEY (fleet_id) REFERENCES fleets(id) ON DELETE CASCADE'),
      ('fleet_service_requests', 'fleet_service_requests_created_by_profile_id_fkey', 'FOREIGN KEY (created_by_profile_id) REFERENCES profiles(id) ON DELETE SET NULL'),
      ('fleet_service_requests', 'fleet_service_requests_fleet_fk', 'FOREIGN KEY (fleet_id) REFERENCES fleets(id) ON DELETE CASCADE'),
      ('fleet_service_requests', 'fleet_service_requests_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('fleet_service_requests', 'fleet_service_requests_source_pretrip_id_fkey', 'FOREIGN KEY (source_pretrip_id) REFERENCES fleet_pretrip_reports(id) ON DELETE SET NULL'),
      ('fleet_service_requests', 'fleet_service_requests_vehicle_fk', 'FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL'),
      ('fleet_service_requests', 'fleet_service_requests_vehicle_id_fkey', 'FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE'),
      ('fleet_service_requests', 'fleet_service_requests_work_order_id_fkey', 'FOREIGN KEY (work_order_id) REFERENCES work_orders(id) ON DELETE SET NULL'),
      ('fleet_vehicles', 'fleet_vehicles_fleet_id_fkey', 'FOREIGN KEY (fleet_id) REFERENCES fleets(id) ON DELETE CASCADE'),
      ('fleet_vehicles', 'fleet_vehicles_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id)'),
      ('fleet_vehicles', 'fleet_vehicles_vehicle_id_fkey', 'FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE'),
      ('guided_onboarding_events', 'guided_onboarding_events_session_id_fkey', 'FOREIGN KEY (session_id) REFERENCES guided_onboarding_sessions(id) ON DELETE CASCADE'),
      ('guided_onboarding_events', 'guided_onboarding_events_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('guided_onboarding_sessions', 'guided_onboarding_sessions_created_by_fkey', 'FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL'),
      ('guided_onboarding_sessions', 'guided_onboarding_sessions_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('guided_onboarding_steps', 'guided_onboarding_steps_session_id_fkey', 'FOREIGN KEY (session_id) REFERENCES guided_onboarding_sessions(id) ON DELETE CASCADE'),
      ('guided_onboarding_steps', 'guided_onboarding_steps_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('inspection_result_items', 'inspection_result_items_result_id_fkey', 'FOREIGN KEY (result_id) REFERENCES inspection_results(id) ON DELETE CASCADE'),
      ('inspection_results', 'inspection_results_session_id_fkey', 'FOREIGN KEY (session_id) REFERENCES inspection_sessions(id) ON DELETE CASCADE'),
      ('inspection_smart_match_feedback', 'inspection_smart_match_feedback_menu_repair_item_id_fkey', 'FOREIGN KEY (menu_repair_item_id) REFERENCES menu_repair_items(id) ON DELETE SET NULL'),
      ('inspection_smart_match_feedback', 'inspection_smart_match_feedback_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('inspection_smart_match_feedback', 'inspection_smart_match_feedback_user_id_fkey', 'FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL'),
      ('inspection_template_suggestions', 'inspection_template_suggestions_intake_id_fkey', 'FOREIGN KEY (intake_id) REFERENCES shop_boost_intakes(id) ON DELETE SET NULL'),
      ('inspection_template_suggestions', 'inspection_template_suggestions_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('invoice_documents', 'invoice_documents_created_by_fkey', 'FOREIGN KEY (created_by) REFERENCES auth.users(id)'),
      ('invoice_documents', 'invoice_documents_invoice_id_fkey', 'FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE'),
      ('invoice_documents', 'invoice_documents_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('maintenance_rules', 'maintenance_rules_service_code_fkey', 'FOREIGN KEY (service_code) REFERENCES maintenance_services(code)'),
      ('maintenance_suggestions', 'maintenance_suggestions_vehicle_id_fkey', 'FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)'),
      ('maintenance_suggestions', 'maintenance_suggestions_work_order_id_fkey', 'FOREIGN KEY (work_order_id) REFERENCES work_orders(id) ON DELETE CASCADE'),
      ('menu_item_suggestions', 'menu_item_suggestions_inspection_template_suggestion_id_fkey', 'FOREIGN KEY (inspection_template_suggestion_id) REFERENCES inspection_template_suggestions(id) ON DELETE SET NULL'),
      ('menu_item_suggestions', 'menu_item_suggestions_intake_id_fkey', 'FOREIGN KEY (intake_id) REFERENCES shop_boost_intakes(id) ON DELETE SET NULL'),
      ('menu_item_suggestions', 'menu_item_suggestions_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('menu_repair_item_parts', 'menu_repair_item_parts_menu_repair_item_id_fkey', 'FOREIGN KEY (menu_repair_item_id) REFERENCES menu_repair_items(id) ON DELETE CASCADE'),
      ('menu_repair_item_parts', 'menu_repair_item_parts_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('menu_repair_item_pricing_parts', 'menu_repair_item_pricing_parts_menu_repair_item_part_id_fkey', 'FOREIGN KEY (menu_repair_item_part_id) REFERENCES menu_repair_item_parts(id) ON DELETE SET NULL'),
      ('menu_repair_item_pricing_parts', 'menu_repair_item_pricing_parts_pricing_snapshot_id_fkey', 'FOREIGN KEY (pricing_snapshot_id) REFERENCES menu_repair_item_pricing_snapshots(id) ON DELETE CASCADE'),
      ('menu_repair_item_pricing_snapshots', 'menu_repair_item_pricing_snapshots_menu_repair_item_id_fkey', 'FOREIGN KEY (menu_repair_item_id) REFERENCES menu_repair_items(id) ON DELETE CASCADE'),
      ('menu_repair_item_pricing_snapshots', 'menu_repair_item_pricing_snapshots_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('menu_repair_item_pricing_snapshots', 'menu_repair_item_pricing_snapshots_supplier_id_fkey', 'FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL'),
      ('menu_repair_item_pricing_snapshots', 'menu_repair_item_pricing_snapshots_uploaded_by_fkey', 'FOREIGN KEY (uploaded_by) REFERENCES auth.users(id) ON DELETE SET NULL'),
      ('menu_repair_items', 'menu_repair_items_active_pricing_snapshot_id_fkey', 'FOREIGN KEY (active_pricing_snapshot_id) REFERENCES menu_repair_item_pricing_snapshots(id) ON DELETE SET NULL'),
      ('menu_repair_items', 'menu_repair_items_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('menu_repair_items', 'menu_repair_items_source_work_order_id_fkey', 'FOREIGN KEY (source_work_order_id) REFERENCES work_orders(id) ON DELETE SET NULL'),
      ('menu_repair_items', 'menu_repair_items_source_work_order_line_id_fkey', 'FOREIGN KEY (source_work_order_line_id) REFERENCES work_order_lines(id) ON DELETE SET NULL'),
      ('optimization_actions', 'optimization_actions_created_by_fkey', 'FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL'),
      ('optimization_actions', 'optimization_actions_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('organizations', 'organizations_owner_profile_fk', 'FOREIGN KEY (owner_profile_id) REFERENCES profiles(id) ON DELETE SET NULL'),
      ('payroll_timecards', 'payroll_timecards_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id)'),
      ('payroll_timecards', 'payroll_timecards_user_id_fkey', 'FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE'),
      ('people_workforce_profiles', 'people_workforce_profiles_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('people_workforce_profiles', 'people_workforce_profiles_user_id_fkey', 'FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE'),
      ('planner_events', 'planner_events_run_id_fkey', 'FOREIGN KEY (run_id) REFERENCES planner_runs(id) ON DELETE CASCADE'),
      ('property_assets', 'property_assets_property_id_fkey', 'FOREIGN KEY (property_id) REFERENCES property_properties(id) ON DELETE CASCADE'),
      ('property_assets', 'property_assets_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('property_assets', 'property_assets_unit_id_fkey', 'FOREIGN KEY (unit_id) REFERENCES property_units(id) ON DELETE SET NULL'),
      ('property_inspection_signatures', 'property_inspection_signatures_inspection_id_fkey', 'FOREIGN KEY (inspection_id) REFERENCES property_inspections(id) ON DELETE CASCADE'),
      ('property_inspection_signatures', 'property_inspection_signatures_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('property_inspection_signatures', 'property_inspection_signatures_signer_profile_id_fkey', 'FOREIGN KEY (signer_profile_id) REFERENCES profiles(id) ON DELETE SET NULL'),
      ('property_inspections', 'property_inspections_performed_by_profile_id_fkey', 'FOREIGN KEY (performed_by_profile_id) REFERENCES profiles(id) ON DELETE SET NULL'),
      ('property_inspections', 'property_inspections_property_id_fkey', 'FOREIGN KEY (property_id) REFERENCES property_properties(id) ON DELETE CASCADE'),
      ('property_inspections', 'property_inspections_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('property_inspections', 'property_inspections_unit_id_fkey', 'FOREIGN KEY (unit_id) REFERENCES property_units(id) ON DELETE SET NULL'),
      ('property_maintenance_requests', 'property_maintenance_requests_asset_id_fkey', 'FOREIGN KEY (asset_id) REFERENCES property_assets(id) ON DELETE SET NULL'),
      ('property_maintenance_requests', 'property_maintenance_requests_property_id_fkey', 'FOREIGN KEY (property_id) REFERENCES property_properties(id) ON DELETE CASCADE'),
      ('property_maintenance_requests', 'property_maintenance_requests_requester_profile_id_fkey', 'FOREIGN KEY (requester_profile_id) REFERENCES profiles(id) ON DELETE SET NULL'),
      ('property_maintenance_requests', 'property_maintenance_requests_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('property_maintenance_requests', 'property_maintenance_requests_unit_id_fkey', 'FOREIGN KEY (unit_id) REFERENCES property_units(id) ON DELETE SET NULL'),
      ('property_maintenance_requests', 'property_maintenance_requests_work_order_id_fkey', 'FOREIGN KEY (work_order_id) REFERENCES work_orders(id) ON DELETE SET NULL'),
      ('property_members', 'property_members_portfolio_id_fkey', 'FOREIGN KEY (portfolio_id) REFERENCES property_portfolios(id) ON DELETE CASCADE'),
      ('property_members', 'property_members_property_id_fkey', 'FOREIGN KEY (property_id) REFERENCES property_properties(id) ON DELETE CASCADE'),
      ('property_members', 'property_members_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('property_members', 'property_members_unit_id_fkey', 'FOREIGN KEY (unit_id) REFERENCES property_units(id) ON DELETE CASCADE'),
      ('property_members', 'property_members_user_id_fkey', 'FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE'),
      ('property_portal_invites', 'property_portal_invites_accepted_by_profile_id_fkey', 'FOREIGN KEY (accepted_by_profile_id) REFERENCES profiles(id) ON DELETE SET NULL'),
      ('property_portal_invites', 'property_portal_invites_created_by_profile_id_fkey', 'FOREIGN KEY (created_by_profile_id) REFERENCES profiles(id) ON DELETE SET NULL'),
      ('property_portal_invites', 'property_portal_invites_portfolio_id_fkey', 'FOREIGN KEY (portfolio_id) REFERENCES property_portfolios(id) ON DELETE CASCADE'),
      ('property_portal_invites', 'property_portal_invites_property_id_fkey', 'FOREIGN KEY (property_id) REFERENCES property_properties(id) ON DELETE CASCADE'),
      ('property_portal_invites', 'property_portal_invites_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('property_portal_invites', 'property_portal_invites_unit_id_fkey', 'FOREIGN KEY (unit_id) REFERENCES property_units(id) ON DELETE CASCADE'),
      ('property_portfolios', 'property_portfolios_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('property_properties', 'property_properties_portfolio_id_fkey', 'FOREIGN KEY (portfolio_id) REFERENCES property_portfolios(id) ON DELETE SET NULL'),
      ('property_properties', 'property_properties_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('property_request_attachments', 'property_request_attachments_event_id_fkey', 'FOREIGN KEY (event_id) REFERENCES property_request_events(id) ON DELETE SET NULL'),
      ('property_request_attachments', 'property_request_attachments_request_id_fkey', 'FOREIGN KEY (request_id) REFERENCES property_maintenance_requests(id) ON DELETE CASCADE'),
      ('property_request_attachments', 'property_request_attachments_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('property_request_attachments', 'property_request_attachments_uploaded_by_profile_id_fkey', 'FOREIGN KEY (uploaded_by_profile_id) REFERENCES profiles(id) ON DELETE SET NULL'),
      ('property_request_events', 'property_request_events_actor_profile_id_fkey', 'FOREIGN KEY (actor_profile_id) REFERENCES profiles(id) ON DELETE SET NULL'),
      ('property_request_events', 'property_request_events_request_id_fkey', 'FOREIGN KEY (request_id) REFERENCES property_maintenance_requests(id) ON DELETE CASCADE'),
      ('property_request_events', 'property_request_events_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('property_units', 'property_units_property_id_fkey', 'FOREIGN KEY (property_id) REFERENCES property_properties(id) ON DELETE CASCADE'),
      ('property_units', 'property_units_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('property_vendor_assignments', 'property_vendor_assignments_request_id_fkey', 'FOREIGN KEY (request_id) REFERENCES property_maintenance_requests(id) ON DELETE CASCADE'),
      ('property_vendor_assignments', 'property_vendor_assignments_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('property_vendor_assignments', 'property_vendor_assignments_vendor_id_fkey', 'FOREIGN KEY (vendor_id) REFERENCES property_vendors(id) ON DELETE CASCADE'),
      ('property_vendor_assignments', 'property_vendor_assignments_work_order_id_fkey', 'FOREIGN KEY (work_order_id) REFERENCES work_orders(id) ON DELETE CASCADE'),
      ('property_vendors', 'property_vendors_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('quickbooks_connections', 'quickbooks_connections_created_by_fkey', 'FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL'),
      ('quickbooks_connections', 'quickbooks_connections_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('quickbooks_customer_links', 'quickbooks_customer_links_customer_id_fkey', 'FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE'),
      ('quickbooks_customer_links', 'quickbooks_customer_links_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('quickbooks_sync_events', 'quickbooks_sync_events_connection_id_fkey', 'FOREIGN KEY (connection_id) REFERENCES quickbooks_connections(id) ON DELETE SET NULL'),
      ('quickbooks_sync_events', 'quickbooks_sync_events_created_by_fkey', 'FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL'),
      ('quickbooks_sync_events', 'quickbooks_sync_events_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('shop_ai_profiles', 'shop_ai_profiles_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id)'),
      ('shop_boost_import_provenance', 'shop_boost_import_provenance_intake_id_fkey', 'FOREIGN KEY (intake_id) REFERENCES shop_boost_intakes(id) ON DELETE CASCADE'),
      ('shop_boost_import_provenance', 'shop_boost_import_provenance_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('shop_boost_import_reset_audit_events', 'shop_boost_import_reset_audit_events_actor_user_id_fkey', 'FOREIGN KEY (actor_user_id) REFERENCES profiles(id) ON DELETE RESTRICT'),
      ('shop_boost_import_reset_audit_events', 'shop_boost_import_reset_audit_events_intake_id_fkey', 'FOREIGN KEY (intake_id) REFERENCES shop_boost_intakes(id) ON DELETE SET NULL'),
      ('shop_boost_import_reset_audit_events', 'shop_boost_import_reset_audit_events_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('shop_boost_intakes', 'shop_boost_intakes_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('shop_boost_integrity_reports', 'shop_boost_integrity_reports_intake_id_fkey', 'FOREIGN KEY (intake_id) REFERENCES shop_boost_intakes(id) ON DELETE CASCADE'),
      ('shop_boost_integrity_reports', 'shop_boost_integrity_reports_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('shop_boost_review_audit_events', 'shop_boost_review_audit_events_actor_user_id_fkey', 'FOREIGN KEY (actor_user_id) REFERENCES profiles(id) ON DELETE SET NULL'),
      ('shop_boost_review_audit_events', 'shop_boost_review_audit_events_intake_id_fkey', 'FOREIGN KEY (intake_id) REFERENCES shop_boost_intakes(id) ON DELETE CASCADE'),
      ('shop_boost_review_audit_events', 'shop_boost_review_audit_events_review_item_id_fkey', 'FOREIGN KEY (review_item_id) REFERENCES shop_boost_review_items(id) ON DELETE CASCADE'),
      ('shop_boost_review_audit_events', 'shop_boost_review_audit_events_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('shop_boost_review_items', 'shop_boost_review_items_intake_id_fkey', 'FOREIGN KEY (intake_id) REFERENCES shop_boost_intakes(id) ON DELETE CASCADE'),
      ('shop_boost_review_items', 'shop_boost_review_items_resolved_by_fkey', 'FOREIGN KEY (resolved_by) REFERENCES profiles(id) ON DELETE SET NULL'),
      ('shop_boost_review_items', 'shop_boost_review_items_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('shop_boost_row_results', 'shop_boost_row_results_intake_id_fkey', 'FOREIGN KEY (intake_id) REFERENCES shop_boost_intakes(id) ON DELETE CASCADE'),
      ('shop_boost_row_results', 'shop_boost_row_results_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('shop_brand_assets', 'shop_brand_assets_archived_by_fkey', 'FOREIGN KEY (archived_by) REFERENCES profiles(id) ON DELETE SET NULL'),
      ('shop_brand_assets', 'shop_brand_assets_created_by_fkey', 'FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL'),
      ('shop_brand_assets', 'shop_brand_assets_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('shop_brand_profiles', 'shop_brand_profiles_icon_asset_id_fkey', 'FOREIGN KEY (icon_asset_id) REFERENCES shop_brand_assets(id) ON DELETE SET NULL'),
      ('shop_brand_profiles', 'shop_brand_profiles_logo_asset_id_fkey', 'FOREIGN KEY (logo_asset_id) REFERENCES shop_brand_assets(id) ON DELETE SET NULL'),
      ('shop_brand_profiles', 'shop_brand_profiles_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('shop_brand_profiles', 'shop_brand_profiles_updated_by_fkey', 'FOREIGN KEY (updated_by) REFERENCES profiles(id) ON DELETE SET NULL'),
      ('shop_brand_profiles', 'shop_brand_profiles_watermark_asset_id_fkey', 'FOREIGN KEY (watermark_asset_id) REFERENCES shop_brand_assets(id) ON DELETE SET NULL'),
      ('shop_brand_profiles', 'shop_brand_profiles_wordmark_asset_id_fkey', 'FOREIGN KEY (wordmark_asset_id) REFERENCES shop_brand_assets(id) ON DELETE SET NULL'),
      ('shop_health_snapshots', 'shop_health_snapshots_intake_id_fkey', 'FOREIGN KEY (intake_id) REFERENCES shop_boost_intakes(id) ON DELETE SET NULL'),
      ('shop_health_snapshots', 'shop_health_snapshots_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('shop_import_files', 'shop_import_files_intake_id_fkey', 'FOREIGN KEY (intake_id) REFERENCES shop_boost_intakes(id) ON DELETE CASCADE'),
      ('shop_import_rows', 'shop_import_rows_file_id_fkey', 'FOREIGN KEY (file_id) REFERENCES shop_import_files(id) ON DELETE SET NULL'),
      ('shop_import_rows', 'shop_import_rows_intake_id_fkey', 'FOREIGN KEY (intake_id) REFERENCES shop_boost_intakes(id) ON DELETE CASCADE'),
      ('shop_import_rows', 'shop_import_rows_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('shop_maintenance_service_map', 'shop_maintenance_service_map_menu_item_id_fkey', 'FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE SET NULL'),
      ('shop_maintenance_service_map', 'shop_maintenance_service_map_menu_repair_item_id_fkey', 'FOREIGN KEY (menu_repair_item_id) REFERENCES menu_repair_items(id) ON DELETE SET NULL'),
      ('shop_maintenance_service_map', 'shop_maintenance_service_map_service_code_fkey', 'FOREIGN KEY (service_code) REFERENCES maintenance_services(code) ON DELETE CASCADE'),
      ('shop_maintenance_service_map', 'shop_maintenance_service_map_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('shop_members', 'shop_members_created_by_fkey', 'FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL'),
      ('shop_members', 'shop_members_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('shop_members', 'shop_members_user_id_fkey', 'FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE'),
      ('shop_onboarding_activation_rules', 'shop_onboarding_activation_rules_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('shop_onboarding_attempts', 'shop_onboarding_attempts_job_id_fkey', 'FOREIGN KEY (job_id) REFERENCES shop_onboarding_jobs(id) ON DELETE CASCADE'),
      ('shop_onboarding_attempts', 'shop_onboarding_attempts_run_id_fkey', 'FOREIGN KEY (run_id) REFERENCES shop_onboarding_runs(id) ON DELETE CASCADE'),
      ('shop_onboarding_jobs', 'shop_onboarding_jobs_depends_on_job_id_fkey', 'FOREIGN KEY (depends_on_job_id) REFERENCES shop_onboarding_jobs(id) ON DELETE SET NULL'),
      ('shop_onboarding_jobs', 'shop_onboarding_jobs_intake_id_fkey', 'FOREIGN KEY (intake_id) REFERENCES shop_boost_intakes(id) ON DELETE CASCADE'),
      ('shop_onboarding_jobs', 'shop_onboarding_jobs_run_id_fkey', 'FOREIGN KEY (run_id) REFERENCES shop_onboarding_runs(id) ON DELETE CASCADE'),
      ('shop_onboarding_jobs', 'shop_onboarding_jobs_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('shop_onboarding_runs', 'shop_onboarding_runs_created_by_fkey', 'FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL'),
      ('shop_onboarding_runs', 'shop_onboarding_runs_intake_id_fkey', 'FOREIGN KEY (intake_id) REFERENCES shop_boost_intakes(id) ON DELETE CASCADE'),
      ('shop_onboarding_runs', 'shop_onboarding_runs_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('shop_parts_import_match_candidates', 'shop_parts_import_match_candidates_candidate_part_id_fkey', 'FOREIGN KEY (candidate_part_id) REFERENCES parts(id) ON DELETE CASCADE'),
      ('shop_parts_import_match_candidates', 'shop_parts_import_match_candidates_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('shop_parts_import_match_candidates', 'shop_parts_import_match_candidates_staging_row_id_fkey', 'FOREIGN KEY (staging_row_id) REFERENCES shop_parts_import_staging(id) ON DELETE CASCADE'),
      ('shop_parts_import_staging', 'shop_parts_import_staging_intake_id_fkey', 'FOREIGN KEY (intake_id) REFERENCES shop_boost_intakes(id) ON DELETE CASCADE'),
      ('shop_parts_import_staging', 'shop_parts_import_staging_matched_part_id_fkey', 'FOREIGN KEY (matched_part_id) REFERENCES parts(id) ON DELETE SET NULL'),
      ('shop_parts_import_staging', 'shop_parts_import_staging_raw_row_id_fkey', 'FOREIGN KEY (raw_row_id) REFERENCES shop_import_rows(id) ON DELETE SET NULL'),
      ('shop_parts_import_staging', 'shop_parts_import_staging_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('shop_parts_source_aliases', 'shop_parts_source_aliases_intake_id_fkey', 'FOREIGN KEY (intake_id) REFERENCES shop_boost_intakes(id) ON DELETE SET NULL'),
      ('shop_parts_source_aliases', 'shop_parts_source_aliases_part_id_fkey', 'FOREIGN KEY (part_id) REFERENCES parts(id) ON DELETE CASCADE'),
      ('shop_parts_source_aliases', 'shop_parts_source_aliases_raw_row_id_fkey', 'FOREIGN KEY (raw_row_id) REFERENCES shop_import_rows(id) ON DELETE SET NULL'),
      ('shop_parts_source_aliases', 'shop_parts_source_aliases_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('shop_parts_source_aliases', 'shop_parts_source_aliases_staging_row_id_fkey', 'FOREIGN KEY (staging_row_id) REFERENCES shop_parts_import_staging(id) ON DELETE SET NULL'),
      ('shop_vehicle_menu_items', 'shop_vehicle_menu_items_menu_item_id_fkey', 'FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE'),
      ('shop_vehicle_menu_items', 'shop_vehicle_menu_items_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('shop_vehicle_menu_items', 'shop_vehicle_menu_items_vehicle_menu_id_fkey', 'FOREIGN KEY (vehicle_menu_id) REFERENCES vehicle_menus(id) ON DELETE CASCADE'),
      ('shopreel_drafts', 'shopreel_drafts_created_by_fkey', 'FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL'),
      ('shopreel_drafts', 'shopreel_drafts_opportunity_id_fkey', 'FOREIGN KEY (opportunity_id) REFERENCES shopreel_opportunities(id) ON DELETE CASCADE'),
      ('shopreel_drafts', 'shopreel_drafts_reviewed_by_fkey', 'FOREIGN KEY (reviewed_by) REFERENCES profiles(id) ON DELETE SET NULL'),
      ('shopreel_drafts', 'shopreel_drafts_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('shopreel_drafts', 'shopreel_drafts_updated_by_fkey', 'FOREIGN KEY (updated_by) REFERENCES profiles(id) ON DELETE SET NULL'),
      ('shopreel_event_deliveries', 'shopreel_event_deliveries_integration_id_fkey', 'FOREIGN KEY (integration_id) REFERENCES shopreel_integrations(id) ON DELETE SET NULL'),
      ('shopreel_event_deliveries', 'shopreel_event_deliveries_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('shopreel_integrations', 'shopreel_integrations_created_by_fkey', 'FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL'),
      ('shopreel_integrations', 'shopreel_integrations_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('shopreel_integrations', 'shopreel_integrations_updated_by_fkey', 'FOREIGN KEY (updated_by) REFERENCES profiles(id) ON DELETE SET NULL'),
      ('shopreel_manual_assets', 'shopreel_manual_assets_created_by_fkey', 'FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL'),
      ('shopreel_manual_assets', 'shopreel_manual_assets_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('shopreel_opportunities', 'shopreel_opportunities_acted_by_fkey', 'FOREIGN KEY (acted_by) REFERENCES profiles(id) ON DELETE SET NULL'),
      ('shopreel_opportunities', 'shopreel_opportunities_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('shopreel_opportunities', 'shopreel_opportunities_story_source_id_fkey', 'FOREIGN KEY (story_source_id) REFERENCES shopreel_story_sources(id) ON DELETE CASCADE'),
      ('shopreel_opportunity_status_history', 'shopreel_opportunity_status_history_changed_by_fkey', 'FOREIGN KEY (changed_by) REFERENCES profiles(id) ON DELETE SET NULL'),
      ('shopreel_opportunity_status_history', 'shopreel_opportunity_status_history_opportunity_id_fkey', 'FOREIGN KEY (opportunity_id) REFERENCES shopreel_opportunities(id) ON DELETE CASCADE'),
      ('shopreel_opportunity_status_history', 'shopreel_opportunity_status_history_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('shopreel_publications', 'shopreel_publications_connection_id_fkey', 'FOREIGN KEY (connection_id) REFERENCES shopreel_social_connections(id) ON DELETE SET NULL'),
      ('shopreel_publications', 'shopreel_publications_created_by_fkey', 'FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL'),
      ('shopreel_publications', 'shopreel_publications_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('shopreel_publications', 'shopreel_publications_video_id_fkey', 'FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE SET NULL'),
      ('shopreel_publish_jobs', 'shopreel_publish_jobs_publication_id_fkey', 'FOREIGN KEY (publication_id) REFERENCES content_publications(id) ON DELETE CASCADE'),
      ('shopreel_publish_jobs', 'shopreel_publish_jobs_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('shopreel_story_sources', 'shopreel_story_sources_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('staff_certifications', 'staff_certifications_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('staff_certifications', 'staff_certifications_user_id_fkey', 'FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE'),
      ('staff_invite_candidates', 'staff_invite_candidates_created_profile_id_fkey', 'FOREIGN KEY (created_profile_id) REFERENCES profiles(id) ON DELETE SET NULL'),
      ('staff_invite_candidates', 'staff_invite_candidates_intake_id_fkey', 'FOREIGN KEY (intake_id) REFERENCES shop_boost_intakes(id) ON DELETE SET NULL'),
      ('staff_invite_candidates', 'staff_invite_candidates_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('staff_invite_suggestions', 'staff_invite_suggestions_intake_id_fkey', 'FOREIGN KEY (intake_id) REFERENCES shop_boost_intakes(id) ON DELETE SET NULL'),
      ('staff_invite_suggestions', 'staff_invite_suggestions_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('supplier_quote_batch_rows', 'supplier_quote_batch_rows_batch_id_fkey', 'FOREIGN KEY (batch_id) REFERENCES supplier_quote_batches(id) ON DELETE CASCADE'),
      ('supplier_quote_batches', 'supplier_quote_batches_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('supplier_quote_batches', 'supplier_quote_batches_supplier_id_fkey', 'FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL'),
      ('supplier_quote_batches', 'supplier_quote_batches_uploaded_by_fkey', 'FOREIGN KEY (uploaded_by) REFERENCES auth.users(id) ON DELETE SET NULL'),
      ('user_theme_preferences', 'user_theme_preferences_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('user_theme_preferences', 'user_theme_preferences_user_id_fkey', 'FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE'),
      ('vehicle_menus', 'vehicle_menus_service_code_fkey', 'FOREIGN KEY (service_code) REFERENCES maintenance_services(code)'),
      ('videos', 'videos_created_by_fkey', 'FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL'),
      ('videos', 'videos_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('videos', 'videos_source_asset_id_fkey', 'FOREIGN KEY (source_asset_id) REFERENCES assets(id) ON DELETE SET NULL'),
      ('videos', 'videos_template_id_fkey', 'FOREIGN KEY (template_id) REFERENCES content_templates(id) ON DELETE SET NULL'),
      ('work_order_invoice_reviews', 'work_order_invoice_reviews_created_by_fkey', 'FOREIGN KEY (created_by) REFERENCES auth.users(id)'),
      ('work_order_invoice_reviews', 'work_order_invoice_reviews_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('work_order_invoice_reviews', 'work_order_invoice_reviews_work_order_id_fkey', 'FOREIGN KEY (work_order_id) REFERENCES work_orders(id) ON DELETE CASCADE'),
      ('work_order_line_ai', 'work_order_line_ai_intake_id_fkey', 'FOREIGN KEY (intake_id) REFERENCES shop_boost_intakes(id) ON DELETE SET NULL'),
      ('work_order_line_ai', 'work_order_line_ai_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('work_order_line_ai', 'work_order_line_ai_work_order_fk', 'FOREIGN KEY (work_order_id) REFERENCES work_orders(id) ON DELETE SET NULL'),
      ('work_order_line_ai', 'work_order_line_ai_work_order_line_fk', 'FOREIGN KEY (work_order_line_id) REFERENCES work_order_lines(id) ON DELETE SET NULL'),
      ('work_order_line_dtc_threads', 'work_order_line_dtc_threads_created_by_fkey', 'FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL'),
      ('work_order_line_dtc_threads', 'work_order_line_dtc_threads_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('work_order_line_dtc_threads', 'work_order_line_dtc_threads_updated_by_fkey', 'FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL'),
      ('work_order_line_dtc_threads', 'work_order_line_dtc_threads_vehicle_id_fkey', 'FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL'),
      ('work_order_line_dtc_threads', 'work_order_line_dtc_threads_work_order_id_fkey', 'FOREIGN KEY (work_order_id) REFERENCES work_orders(id) ON DELETE CASCADE'),
      ('work_order_line_dtc_threads', 'work_order_line_dtc_threads_work_order_line_id_fkey', 'FOREIGN KEY (work_order_line_id) REFERENCES work_order_lines(id) ON DELETE CASCADE'),
      ('workforce_document_requirements', 'workforce_document_requirements_created_by_fkey', 'FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL'),
      ('workforce_document_requirements', 'workforce_document_requirements_shop_id_fkey', 'FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE'),
      ('workforce_document_requirements', 'workforce_document_requirements_updated_by_fkey', 'FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL')
    ) AS definitions(table_name, constraint_name, definition)
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = format('public.%I', item.table_name)::regclass
        AND conname = item.constraint_name
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I %s',
        item.table_name,
        item.constraint_name,
        item.definition
      );
    END IF;
  END LOOP;
END
$p0_008$;

CREATE INDEX IF NOT EXISTS agent_actions_pick_idx ON public.agent_actions USING btree (status, run_after, risk, created_at);
CREATE INDEX IF NOT EXISTS agent_actions_request_idx ON public.agent_actions USING btree (request_id, created_at);
CREATE INDEX IF NOT EXISTS agent_actions_status_idx ON public.agent_actions USING btree (status, run_after, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_actions_request_kind_status ON public.agent_actions USING btree (request_id, kind, status);
CREATE INDEX IF NOT EXISTS idx_agent_attachments_request ON public.agent_attachments USING btree (agent_request_id);
CREATE INDEX IF NOT EXISTS idx_agent_attachments_request_id ON public.agent_attachments USING btree (agent_request_id);
CREATE INDEX IF NOT EXISTS agent_jobs_kind_idx ON public.agent_jobs USING btree (kind);
CREATE INDEX IF NOT EXISTS agent_jobs_kind_pick_idx ON public.agent_jobs USING btree (kind, status, run_after, priority DESC, created_at) WHERE (status = 'queued'::agent_job_status);
CREATE INDEX IF NOT EXISTS agent_jobs_locked_idx ON public.agent_jobs USING btree (locked_by, locked_at) WHERE (status = 'running'::agent_job_status);
CREATE INDEX IF NOT EXISTS agent_jobs_pick_idx ON public.agent_jobs USING btree (status, run_after, priority, created_at);
CREATE INDEX IF NOT EXISTS agent_jobs_request_idx ON public.agent_jobs USING btree (request_id);
CREATE INDEX IF NOT EXISTS idx_agent_jobs_claim ON public.agent_jobs USING btree (status, run_after, kind, priority, created_at);
CREATE INDEX IF NOT EXISTS idx_agent_jobs_request_id ON public.agent_jobs USING btree (request_id);
CREATE INDEX IF NOT EXISTS idx_agent_jobs_status_kind ON public.agent_jobs USING btree (status, kind);
CREATE INDEX IF NOT EXISTS agent_requests_run_id_idx ON public.agent_requests USING btree (run_id);
CREATE INDEX IF NOT EXISTS idx_agent_requests__shop_id ON public.agent_requests USING btree (shop_id);
CREATE INDEX IF NOT EXISTS idx_agent_requests_reporter_id ON public.agent_requests USING btree (reporter_id);
CREATE INDEX IF NOT EXISTS idx_agent_requests_shop_id ON public.agent_requests USING btree (shop_id);
CREATE INDEX IF NOT EXISTS idx_ai_action_previews_expires ON public.ai_action_previews USING btree (shop_id, expires_at) WHERE (expires_at IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_action_previews_idempotency ON public.ai_action_previews USING btree (shop_id, idempotency_key) WHERE (idempotency_key IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_ai_action_previews_recommendation ON public.ai_action_previews USING btree (recommendation_id);
CREATE INDEX IF NOT EXISTS idx_ai_action_previews_shop_domain ON public.ai_action_previews USING btree (shop_id, domain, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_action_previews_shop_status ON public.ai_action_previews USING btree (shop_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_action_previews_subject ON public.ai_action_previews USING btree (shop_id, subject_type, subject_id);
CREATE INDEX IF NOT EXISTS ai_events_entity_idx ON public.ai_events USING btree (entity_table, entity_id);
CREATE INDEX IF NOT EXISTS ai_events_shop_id_idx ON public.ai_events USING btree (shop_id);
CREATE INDEX IF NOT EXISTS ai_events_shop_idx ON public.ai_events USING btree (shop_id);
CREATE INDEX IF NOT EXISTS ai_events_type_idx ON public.ai_events USING btree (event_type);
CREATE INDEX IF NOT EXISTS idx_ai_events__shop_id ON public.ai_events USING btree (shop_id);
CREATE INDEX IF NOT EXISTS idx_ai_events__user_id ON public.ai_events USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_ai_events_shop_source_created ON public.ai_events USING btree (shop_id, training_source, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_events_source_id ON public.ai_events USING btree (source_id);
CREATE INDEX IF NOT EXISTS idx_ai_evidence_snapshots_created ON public.ai_evidence_snapshots USING btree (shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_evidence_snapshots_domain ON public.ai_evidence_snapshots USING btree (shop_id, domain, evidence_kind);
CREATE INDEX IF NOT EXISTS idx_ai_evidence_snapshots_shop ON public.ai_evidence_snapshots USING btree (shop_id);
CREATE INDEX IF NOT EXISTS idx_ai_evidence_snapshots_subject ON public.ai_evidence_snapshots USING btree (shop_id, subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_ai_recommendations_evidence ON public.ai_recommendations USING btree (evidence_snapshot_id);
CREATE INDEX IF NOT EXISTS idx_ai_recommendations_expires ON public.ai_recommendations USING btree (shop_id, expires_at) WHERE (expires_at IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_ai_recommendations_shop_domain ON public.ai_recommendations USING btree (shop_id, domain, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_recommendations_shop_status ON public.ai_recommendations USING btree (shop_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_recommendations_subject ON public.ai_recommendations USING btree (shop_id, subject_type, subject_id);
CREATE INDEX IF NOT EXISTS ai_suggestion_feedback_accepted_idx ON public.ai_suggestion_feedback USING btree (accepted);
CREATE INDEX IF NOT EXISTS ai_suggestion_feedback_line_id_idx ON public.ai_suggestion_feedback USING btree (work_order_line_id);
CREATE INDEX IF NOT EXISTS ai_suggestion_feedback_shop_id_idx ON public.ai_suggestion_feedback USING btree (shop_id);
CREATE INDEX IF NOT EXISTS ai_suggestion_feedback_work_order_id_idx ON public.ai_suggestion_feedback USING btree (work_order_id);
CREATE INDEX IF NOT EXISTS idx_ai_suggestion_feedback_shop_id ON public.ai_suggestion_feedback USING btree (shop_id);
CREATE INDEX IF NOT EXISTS idx_ai_suggestion_feedback_shop_work_order ON public.ai_suggestion_feedback USING btree (shop_id, work_order_id);
CREATE INDEX IF NOT EXISTS idx_ai_suggestion_feedback_work_order_id ON public.ai_suggestion_feedback USING btree (work_order_id);
CREATE INDEX IF NOT EXISTS idx_ai_suggestion_feedback_work_order_line ON public.ai_suggestion_feedback USING btree (work_order_line_id);
CREATE INDEX IF NOT EXISTS idx_ai_suggestion_feedback_work_order_line_id ON public.ai_suggestion_feedback USING btree (work_order_line_id);
CREATE INDEX IF NOT EXISTS ai_training_embedding_hnsw_idx ON public.ai_training_data USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS ai_training_embedding_idx ON public.ai_training_data USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS ai_training_shop_idx ON public.ai_training_data USING btree (shop_id);
CREATE INDEX IF NOT EXISTS idx_ai_training_data__shop_id ON public.ai_training_data USING btree (shop_id);
CREATE INDEX IF NOT EXISTS idx_ai_training_data_shop_created ON public.ai_training_data USING btree (shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_training_data_source_event ON public.ai_training_data USING btree (source_event_id);
CREATE INDEX IF NOT EXISTS idx_assets_shop_id ON public.assets USING btree (shop_id);
CREATE INDEX IF NOT EXISTS idx_assets_shop_storage ON public.assets USING btree (shop_id, storage_bucket, storage_path);
CREATE INDEX IF NOT EXISTS idx_assets_source ON public.assets USING btree (source);
CREATE INDEX IF NOT EXISTS assistant_daily_summaries_shop_date_idx ON public.assistant_daily_summaries USING btree (shop_id, summary_date DESC);
CREATE INDEX IF NOT EXISTS assistant_daily_summaries_user_date_idx ON public.assistant_daily_summaries USING btree (user_id, summary_date DESC);
CREATE INDEX IF NOT EXISTS idx_assistant_daily_summaries_shop_date ON public.assistant_daily_summaries USING btree (shop_id, summary_date);
CREATE UNIQUE INDEX IF NOT EXISTS uq_assistant_daily_summaries_shop_user_date ON public.assistant_daily_summaries USING btree (shop_id, user_id, summary_date);
CREATE INDEX IF NOT EXISTS idx_content_assets_asset_id ON public.content_assets USING btree (asset_id);
CREATE INDEX IF NOT EXISTS idx_content_assets_asset_type ON public.content_assets USING btree (asset_type);
CREATE INDEX IF NOT EXISTS idx_content_assets_content_event_id ON public.content_assets USING btree (content_event_id);
CREATE INDEX IF NOT EXISTS idx_content_assets_event_id ON public.content_assets USING btree (content_event_id);
CREATE INDEX IF NOT EXISTS idx_content_assets_shop_id ON public.content_assets USING btree (shop_id);
CREATE INDEX IF NOT EXISTS idx_content_events_ai_event_id ON public.content_events USING btree (ai_event_id);
CREATE INDEX IF NOT EXISTS idx_content_events_content_type ON public.content_events USING btree (content_type);
CREATE INDEX IF NOT EXISTS idx_content_events_inspection_id ON public.content_events USING btree (inspection_id);
CREATE INDEX IF NOT EXISTS idx_content_events_metadata_gin ON public.content_events USING gin (metadata jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_content_events_shop_id ON public.content_events USING btree (shop_id);
CREATE INDEX IF NOT EXISTS idx_content_events_shop_id_created_at ON public.content_events USING btree (shop_id, created_at);
CREATE INDEX IF NOT EXISTS idx_content_events_shop_work_order ON public.content_events USING btree (shop_id, work_order_id);
CREATE INDEX IF NOT EXISTS idx_content_events_source ON public.content_events USING btree (source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_content_events_status ON public.content_events USING btree (status);
CREATE INDEX IF NOT EXISTS idx_content_events_work_order_id ON public.content_events USING btree (work_order_id);
CREATE INDEX IF NOT EXISTS idx_content_events_work_order_line_id ON public.content_events USING btree (work_order_line_id);
CREATE INDEX IF NOT EXISTS idx_content_pieces_event_id ON public.content_pieces USING btree (content_event_id);
CREATE INDEX IF NOT EXISTS idx_content_pieces_piece_type ON public.content_pieces USING btree (piece_type);
CREATE INDEX IF NOT EXISTS idx_content_pieces_platform ON public.content_pieces USING btree (platform);
CREATE INDEX IF NOT EXISTS idx_content_pieces_shop_id ON public.content_pieces USING btree (shop_id);
CREATE INDEX IF NOT EXISTS idx_content_pieces_slug ON public.content_pieces USING btree (slug);
CREATE UNIQUE INDEX IF NOT EXISTS uq_content_pieces_current_version_not_null ON public.content_pieces USING btree (content_event_id, piece_type, platform, version_no) WHERE (platform IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS uq_content_pieces_current_version_null ON public.content_pieces USING btree (content_event_id, piece_type, version_no) WHERE (platform IS NULL);
CREATE INDEX IF NOT EXISTS idx_content_platform_accounts_shop_id ON public.content_platform_accounts USING btree (shop_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cpa_shop_platform_account_not_null ON public.content_platform_accounts USING btree (shop_id, platform, platform_account_id) WHERE (platform_account_id IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cpa_shop_platform_account_null ON public.content_platform_accounts USING btree (shop_id, platform) WHERE (platform_account_id IS NULL);
CREATE INDEX IF NOT EXISTS idx_content_publications_event_id ON public.content_publications USING btree (content_event_id);
CREATE INDEX IF NOT EXISTS idx_content_publications_platform_status ON public.content_publications USING btree (platform, status);
CREATE INDEX IF NOT EXISTS idx_content_publications_scheduled_for ON public.content_publications USING btree (scheduled_for);
CREATE INDEX IF NOT EXISTS idx_content_publications_shop_id ON public.content_publications USING btree (shop_id);
CREATE INDEX IF NOT EXISTS idx_content_templates_shop_id ON public.content_templates USING btree (shop_id);
CREATE UNIQUE INDEX IF NOT EXISTS dashboard_layouts_shop_default_unique ON public.dashboard_layouts USING btree (shop_id) WHERE (user_id IS NULL);
CREATE INDEX IF NOT EXISTS dashboard_layouts_shop_idx ON public.dashboard_layouts USING btree (shop_id);
CREATE UNIQUE INDEX IF NOT EXISTS dashboard_layouts_shop_user_unique ON public.dashboard_layouts USING btree (shop_id, user_id) WHERE (user_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS dashboard_layouts_user_idx ON public.dashboard_layouts USING btree (user_id);
CREATE INDEX IF NOT EXISTS dashboard_user_layouts_shop_id_idx ON public.dashboard_user_layouts USING btree (shop_id);
CREATE INDEX IF NOT EXISTS dashboard_user_layouts_user_id_idx ON public.dashboard_user_layouts USING btree (user_id);
CREATE INDEX IF NOT EXISTS expenses_shop_category_idx ON public.expenses USING btree (shop_id, category);
CREATE INDEX IF NOT EXISTS expenses_shop_created_idx ON public.expenses USING btree (shop_id, created_at);
CREATE INDEX IF NOT EXISTS expenses_shop_date_idx ON public.expenses USING btree (shop_id, expense_date);
CREATE INDEX IF NOT EXISTS expenses_shop_expense_date_idx ON public.expenses USING btree (shop_id, expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses__shop_id ON public.expenses USING btree (shop_id);
CREATE INDEX IF NOT EXISTS fleet_dispatch_assignments_driver_idx ON public.fleet_dispatch_assignments USING btree (driver_profile_id);
CREATE INDEX IF NOT EXISTS fleet_dispatch_assignments_shop_idx ON public.fleet_dispatch_assignments USING btree (shop_id);
CREATE INDEX IF NOT EXISTS fleet_dispatch_assignments_shop_state_idx ON public.fleet_dispatch_assignments USING btree (shop_id, state);
CREATE INDEX IF NOT EXISTS fleet_dispatch_assignments_vehicle_idx ON public.fleet_dispatch_assignments USING btree (vehicle_id);
CREATE INDEX IF NOT EXISTS idx_fleet_dispatch_assignments__shop_id ON public.fleet_dispatch_assignments USING btree (shop_id);
CREATE INDEX IF NOT EXISTS idx_fleet_dispatch_assignments_fleet_id ON public.fleet_dispatch_assignments USING btree (fleet_id);
CREATE INDEX IF NOT EXISTS fleet_inspection_schedules_next_due_idx ON public.fleet_inspection_schedules USING btree (next_inspection_date);
CREATE INDEX IF NOT EXISTS fleet_inspection_schedules_shop_idx ON public.fleet_inspection_schedules USING btree (shop_id);
CREATE INDEX IF NOT EXISTS fleet_inspection_schedules_shop_vehicle_idx ON public.fleet_inspection_schedules USING btree (shop_id, vehicle_id);
CREATE INDEX IF NOT EXISTS idx_fis_shop ON public.fleet_inspection_schedules USING btree (shop_id);
CREATE INDEX IF NOT EXISTS idx_fis_shop_next_date ON public.fleet_inspection_schedules USING btree (shop_id, next_inspection_date);
CREATE INDEX IF NOT EXISTS idx_fis_vehicle ON public.fleet_inspection_schedules USING btree (vehicle_id);
CREATE INDEX IF NOT EXISTS idx_fleet_inspection_schedules__shop_id ON public.fleet_inspection_schedules USING btree (shop_id);
CREATE INDEX IF NOT EXISTS idx_fleet_inspection_schedules_fleet_id ON public.fleet_inspection_schedules USING btree (fleet_id);
CREATE INDEX IF NOT EXISTS fleet_pretrip_reports_shop_date_idx ON public.fleet_pretrip_reports USING btree (shop_id, inspection_date DESC);
CREATE INDEX IF NOT EXISTS fleet_pretrip_reports_shop_vehicle_date_idx ON public.fleet_pretrip_reports USING btree (shop_id, vehicle_id, inspection_date DESC);
CREATE INDEX IF NOT EXISTS idx_fleet_pretrip_reports__shop_id ON public.fleet_pretrip_reports USING btree (shop_id);
CREATE INDEX IF NOT EXISTS idx_fleet_pretrip_reports_fleet_id ON public.fleet_pretrip_reports USING btree (fleet_id);
CREATE INDEX IF NOT EXISTS fleet_service_requests_shop_status_idx ON public.fleet_service_requests USING btree (shop_id, status);
CREATE INDEX IF NOT EXISTS fleet_service_requests_vehicle_idx ON public.fleet_service_requests USING btree (vehicle_id);
CREATE INDEX IF NOT EXISTS idx_fleet_service_requests__shop_id ON public.fleet_service_requests USING btree (shop_id);
CREATE INDEX IF NOT EXISTS idx_fleet_service_requests_fleet_id ON public.fleet_service_requests USING btree (fleet_id);
CREATE INDEX IF NOT EXISTS fleet_vehicles_shop_id_idx ON public.fleet_vehicles USING btree (shop_id);
CREATE INDEX IF NOT EXISTS idx_fleet_vehicles__shop_id ON public.fleet_vehicles USING btree (shop_id);
CREATE INDEX IF NOT EXISTS idx_fleet_vehicles_fleet_id ON public.fleet_vehicles USING btree (fleet_id);
CREATE INDEX IF NOT EXISTS idx_fleet_vehicles_vehicle_id ON public.fleet_vehicles USING btree (vehicle_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_fleet_vehicles_vehicle_id ON public.fleet_vehicles USING btree (vehicle_id);
CREATE INDEX IF NOT EXISTS guided_onboarding_events_event_type_idx ON public.guided_onboarding_events USING btree (event_type);
CREATE INDEX IF NOT EXISTS guided_onboarding_events_session_id_idx ON public.guided_onboarding_events USING btree (session_id);
CREATE INDEX IF NOT EXISTS guided_onboarding_events_shop_id_idx ON public.guided_onboarding_events USING btree (shop_id);
CREATE INDEX IF NOT EXISTS guided_onboarding_events_shop_session_idx ON public.guided_onboarding_events USING btree (shop_id, session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS guided_onboarding_events_shop_step_idx ON public.guided_onboarding_events USING btree (shop_id, step_key, created_at DESC);
CREATE INDEX IF NOT EXISTS guided_onboarding_events_step_key_idx ON public.guided_onboarding_events USING btree (step_key);
CREATE INDEX IF NOT EXISTS guided_onboarding_sessions_current_step_key_idx ON public.guided_onboarding_sessions USING btree (current_step_key);
CREATE INDEX IF NOT EXISTS guided_onboarding_sessions_shop_id_idx ON public.guided_onboarding_sessions USING btree (shop_id);
CREATE INDEX IF NOT EXISTS guided_onboarding_sessions_shop_status_idx ON public.guided_onboarding_sessions USING btree (shop_id, status);
CREATE INDEX IF NOT EXISTS guided_onboarding_sessions_shop_updated_idx ON public.guided_onboarding_sessions USING btree (shop_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS guided_onboarding_sessions_status_idx ON public.guided_onboarding_sessions USING btree (status);
CREATE INDEX IF NOT EXISTS guided_onboarding_steps_session_id_idx ON public.guided_onboarding_steps USING btree (session_id);
CREATE INDEX IF NOT EXISTS guided_onboarding_steps_shop_id_idx ON public.guided_onboarding_steps USING btree (shop_id);
CREATE INDEX IF NOT EXISTS guided_onboarding_steps_shop_session_idx ON public.guided_onboarding_steps USING btree (shop_id, session_id);
CREATE INDEX IF NOT EXISTS guided_onboarding_steps_shop_status_idx ON public.guided_onboarding_steps USING btree (shop_id, status);
CREATE INDEX IF NOT EXISTS guided_onboarding_steps_status_idx ON public.guided_onboarding_steps USING btree (status);
CREATE INDEX IF NOT EXISTS guided_onboarding_steps_step_key_idx ON public.guided_onboarding_steps USING btree (step_key);
CREATE INDEX IF NOT EXISTS idx_inspection_result_items_result ON public.inspection_result_items USING btree (result_id);
CREATE INDEX IF NOT EXISTS idx_result_items_label ON public.inspection_result_items USING btree (item_label);
CREATE INDEX IF NOT EXISTS idx_inspection_results_session ON public.inspection_results USING btree (session_id);
CREATE INDEX IF NOT EXISTS idx_inspection_results_wol ON public.inspection_results USING btree (work_order_line_id);
CREATE INDEX IF NOT EXISTS idx_inspection_smart_match_feedback_shop_created ON public.inspection_smart_match_feedback USING btree (shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_smart_match_history_shop_created ON public.inspection_smart_match_history USING btree (shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_smart_match_history_shop_vehicle ON public.inspection_smart_match_history USING btree (shop_id, vehicle_year, vehicle_make, vehicle_model);
DO $p0_008$
DECLARE
  v_pg_trgm_schema name;
BEGIN
  SELECT n.nspname
  INTO v_pg_trgm_schema
  FROM pg_extension e
  JOIN pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'pg_trgm';

  IF v_pg_trgm_schema IS NULL THEN
    RAISE EXCEPTION 'P0-008 requires the pg_trgm extension';
  END IF;

  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS idx_smart_match_note_trgm ON public.inspection_smart_match_history USING gin (note %I.gin_trgm_ops)',
    v_pg_trgm_schema
  );
END
$p0_008$;
CREATE INDEX IF NOT EXISTS idx_smart_match_shop_note ON public.inspection_smart_match_history USING btree (shop_id, note);
CREATE INDEX IF NOT EXISTS idx_inspection_template_suggestions__shop_id ON public.inspection_template_suggestions USING btree (shop_id);
CREATE INDEX IF NOT EXISTS inspection_template_suggestions_intake_id_idx ON public.inspection_template_suggestions USING btree (intake_id);
CREATE INDEX IF NOT EXISTS inspection_template_suggestions_items_gin_idx ON public.inspection_template_suggestions USING gin (items);
CREATE INDEX IF NOT EXISTS inspection_template_suggestions_shop_id_idx ON public.inspection_template_suggestions USING btree (shop_id);
CREATE INDEX IF NOT EXISTS idx_invoice_documents__shop_id ON public.invoice_documents USING btree (shop_id);
CREATE INDEX IF NOT EXISTS invoice_documents_invoice_id_ix ON public.invoice_documents USING btree (invoice_id);
CREATE UNIQUE INDEX IF NOT EXISTS invoice_documents_invoice_kind_ux ON public.invoice_documents USING btree (invoice_id, kind);
CREATE INDEX IF NOT EXISTS idx_maintenance_rules_target ON public.maintenance_rules USING btree (make, model, year_from, year_to, engine_family);
CREATE INDEX IF NOT EXISTS idx_maintenance_suggestions_status ON public.maintenance_suggestions USING btree (status);
CREATE INDEX IF NOT EXISTS idx_menu_item_suggestions__shop_id ON public.menu_item_suggestions USING btree (shop_id);
CREATE INDEX IF NOT EXISTS idx_menu_item_suggestions_inspection_template_suggestion_id ON public.menu_item_suggestions USING btree (inspection_template_suggestion_id);
CREATE INDEX IF NOT EXISTS menu_item_suggestions_intake_id_idx ON public.menu_item_suggestions USING btree (intake_id);
CREATE INDEX IF NOT EXISTS menu_item_suggestions_shop_id_idx ON public.menu_item_suggestions USING btree (shop_id);
CREATE INDEX IF NOT EXISTS idx_menu_repair_item_parts_menu_repair_item_id ON public.menu_repair_item_parts USING btree (menu_repair_item_id);
CREATE INDEX IF NOT EXISTS idx_menu_repair_item_parts_shop_id ON public.menu_repair_item_parts USING btree (shop_id);
CREATE INDEX IF NOT EXISTS idx_mripp_part_id ON public.menu_repair_item_pricing_parts USING btree (menu_repair_item_part_id);
CREATE INDEX IF NOT EXISTS idx_mripp_snapshot_id ON public.menu_repair_item_pricing_parts USING btree (pricing_snapshot_id);
CREATE INDEX IF NOT EXISTS idx_menu_repair_pricing_snapshots_shop_source_quote_line ON public.menu_repair_item_pricing_snapshots USING btree (shop_id, source_quote_line_id) WHERE (source_quote_line_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_menu_repair_pricing_snapshots_shop_source_wol ON public.menu_repair_item_pricing_snapshots USING btree (shop_id, source_work_order_line_id) WHERE (source_work_order_line_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_mrips_menu_repair_item_id ON public.menu_repair_item_pricing_snapshots USING btree (menu_repair_item_id);
CREATE INDEX IF NOT EXISTS idx_mrips_shop_id ON public.menu_repair_item_pricing_snapshots USING btree (shop_id);
CREATE INDEX IF NOT EXISTS idx_mrips_status ON public.menu_repair_item_pricing_snapshots USING btree (status);
CREATE INDEX IF NOT EXISTS idx_menu_repair_items_shop_active ON public.menu_repair_items USING btree (shop_id, is_active);
CREATE INDEX IF NOT EXISTS idx_menu_repair_items_shop_name ON public.menu_repair_items USING btree (shop_id, lower(name));
CREATE INDEX IF NOT EXISTS idx_menu_repair_items_shop_source_quote_line ON public.menu_repair_items USING btree (shop_id, source_quote_line_id) WHERE (source_quote_line_id IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS idx_menu_repair_items_shop_template_key ON public.menu_repair_items USING btree (shop_id, template_key);
CREATE INDEX IF NOT EXISTS idx_menu_repair_items_shop_vehicle ON public.menu_repair_items USING btree (shop_id, vehicle_year, vehicle_make, vehicle_model, engine, drivetrain, transmission);
CREATE INDEX IF NOT EXISTS optimization_actions_shop_created_idx ON public.optimization_actions USING btree (shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS optimization_actions_shop_opportunity_idx ON public.optimization_actions USING btree (shop_id, opportunity_id);
CREATE UNIQUE INDEX IF NOT EXISTS organizations_slug_uq ON public.organizations USING btree (slug);
CREATE INDEX IF NOT EXISTS idx_payroll_timecards__shop_id ON public.payroll_timecards USING btree (shop_id);
CREATE INDEX IF NOT EXISTS idx_payroll_timecards__user_id ON public.payroll_timecards USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_payroll_timecards_user_shop_clock_in ON public.payroll_timecards USING btree (user_id, shop_id, clock_in);
CREATE INDEX IF NOT EXISTS idx_timecards_shop_user_clockin ON public.payroll_timecards USING btree (shop_id, user_id, clock_in);
CREATE INDEX IF NOT EXISTS idx_people_workforce_shop_status ON public.people_workforce_profiles USING btree (shop_id, employment_status);
CREATE INDEX IF NOT EXISTS idx_planner_events_run_step ON public.planner_events USING btree (run_id, step);
CREATE INDEX IF NOT EXISTS idx_planner_runs__shop_id ON public.planner_runs USING btree (shop_id);
CREATE INDEX IF NOT EXISTS idx_planner_runs__user_id ON public.planner_runs USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_planner_runs_idempotency ON public.planner_runs USING btree (user_id, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_planner_runs_shop_user ON public.planner_runs USING btree (shop_id, user_id);
CREATE INDEX IF NOT EXISTS idx_property_assets_next_service_date ON public.property_assets USING btree (shop_id, next_service_date);
CREATE INDEX IF NOT EXISTS idx_property_assets_property_id ON public.property_assets USING btree (property_id);
CREATE INDEX IF NOT EXISTS idx_property_assets_shop_id ON public.property_assets USING btree (shop_id);
CREATE INDEX IF NOT EXISTS idx_property_assets_unit_id ON public.property_assets USING btree (unit_id);
CREATE INDEX IF NOT EXISTS property_inspection_signatures_inspection_id_idx ON public.property_inspection_signatures USING btree (inspection_id);
CREATE INDEX IF NOT EXISTS property_inspection_signatures_shop_id_idx ON public.property_inspection_signatures USING btree (shop_id);
CREATE INDEX IF NOT EXISTS property_inspection_signatures_signed_at_idx ON public.property_inspection_signatures USING btree (signed_at DESC);
CREATE INDEX IF NOT EXISTS property_inspection_signatures_signer_profile_id_idx ON public.property_inspection_signatures USING btree (signer_profile_id);
CREATE INDEX IF NOT EXISTS property_inspection_signatures_signer_role_idx ON public.property_inspection_signatures USING btree (signer_role);
CREATE INDEX IF NOT EXISTS idx_property_inspections_property_id ON public.property_inspections USING btree (property_id);
CREATE INDEX IF NOT EXISTS idx_property_inspections_shop_id ON public.property_inspections USING btree (shop_id);
CREATE INDEX IF NOT EXISTS idx_property_inspections_shop_status ON public.property_inspections USING btree (shop_id, status);
CREATE INDEX IF NOT EXISTS idx_property_inspections_unit_id ON public.property_inspections USING btree (unit_id);
CREATE INDEX IF NOT EXISTS idx_property_maintenance_requests_asset_id ON public.property_maintenance_requests USING btree (asset_id);
CREATE INDEX IF NOT EXISTS idx_property_maintenance_requests_property_id ON public.property_maintenance_requests USING btree (property_id);
CREATE INDEX IF NOT EXISTS idx_property_maintenance_requests_shop_id ON public.property_maintenance_requests USING btree (shop_id);
CREATE INDEX IF NOT EXISTS idx_property_maintenance_requests_status_severity ON public.property_maintenance_requests USING btree (shop_id, status, severity);
CREATE INDEX IF NOT EXISTS idx_property_maintenance_requests_unit_id ON public.property_maintenance_requests USING btree (unit_id);
CREATE INDEX IF NOT EXISTS idx_property_maintenance_requests_work_order_id ON public.property_maintenance_requests USING btree (work_order_id);
CREATE INDEX IF NOT EXISTS idx_property_members_portfolio_id ON public.property_members USING btree (portfolio_id);
CREATE INDEX IF NOT EXISTS idx_property_members_property_id ON public.property_members USING btree (property_id);
CREATE INDEX IF NOT EXISTS idx_property_members_shop_id ON public.property_members USING btree (shop_id);
CREATE INDEX IF NOT EXISTS idx_property_members_unit_id ON public.property_members USING btree (unit_id);
CREATE INDEX IF NOT EXISTS idx_property_members_user_id ON public.property_members USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_property_members_user_shop_role ON public.property_members USING btree (user_id, shop_id, role);
CREATE INDEX IF NOT EXISTS property_portal_invites_expires_at_idx ON public.property_portal_invites USING btree (expires_at);
CREATE INDEX IF NOT EXISTS property_portal_invites_invited_email_lower_idx ON public.property_portal_invites USING btree (lower(invited_email));
CREATE INDEX IF NOT EXISTS property_portal_invites_property_id_idx ON public.property_portal_invites USING btree (property_id);
CREATE INDEX IF NOT EXISTS property_portal_invites_shop_id_idx ON public.property_portal_invites USING btree (shop_id);
CREATE INDEX IF NOT EXISTS property_portal_invites_status_idx ON public.property_portal_invites USING btree (status);
CREATE UNIQUE INDEX IF NOT EXISTS property_portal_invites_token_hash_key ON public.property_portal_invites USING btree (token_hash);
CREATE INDEX IF NOT EXISTS property_portal_invites_unit_id_idx ON public.property_portal_invites USING btree (unit_id);
CREATE INDEX IF NOT EXISTS idx_property_portfolios_shop_id ON public.property_portfolios USING btree (shop_id);
CREATE INDEX IF NOT EXISTS idx_property_properties_portfolio_id ON public.property_properties USING btree (portfolio_id);
CREATE INDEX IF NOT EXISTS idx_property_properties_shop_id ON public.property_properties USING btree (shop_id);
CREATE INDEX IF NOT EXISTS idx_property_properties_shop_status ON public.property_properties USING btree (shop_id, status);
CREATE INDEX IF NOT EXISTS property_request_attachments_created_at_idx ON public.property_request_attachments USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS property_request_attachments_event_id_idx ON public.property_request_attachments USING btree (event_id);
CREATE INDEX IF NOT EXISTS property_request_attachments_request_id_created_at_idx ON public.property_request_attachments USING btree (request_id, created_at DESC);
CREATE INDEX IF NOT EXISTS property_request_attachments_request_id_idx ON public.property_request_attachments USING btree (request_id);
CREATE INDEX IF NOT EXISTS property_request_attachments_shop_id_idx ON public.property_request_attachments USING btree (shop_id);
CREATE INDEX IF NOT EXISTS property_request_events_actor_profile_id_idx ON public.property_request_events USING btree (actor_profile_id);
CREATE INDEX IF NOT EXISTS property_request_events_created_at_idx ON public.property_request_events USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS property_request_events_request_id_created_at_idx ON public.property_request_events USING btree (request_id, created_at DESC);
CREATE INDEX IF NOT EXISTS property_request_events_request_id_idx ON public.property_request_events USING btree (request_id);
CREATE INDEX IF NOT EXISTS property_request_events_shop_id_idx ON public.property_request_events USING btree (shop_id);
CREATE INDEX IF NOT EXISTS idx_property_units_property_id ON public.property_units USING btree (property_id);
CREATE INDEX IF NOT EXISTS idx_property_units_shop_id ON public.property_units USING btree (shop_id);
CREATE INDEX IF NOT EXISTS idx_property_units_shop_property ON public.property_units USING btree (shop_id, property_id);
CREATE INDEX IF NOT EXISTS idx_property_vendor_assignments_request_id ON public.property_vendor_assignments USING btree (request_id);
CREATE INDEX IF NOT EXISTS idx_property_vendor_assignments_shop_id ON public.property_vendor_assignments USING btree (shop_id);
CREATE INDEX IF NOT EXISTS idx_property_vendor_assignments_shop_status ON public.property_vendor_assignments USING btree (shop_id, status);
CREATE INDEX IF NOT EXISTS idx_property_vendor_assignments_vendor_id ON public.property_vendor_assignments USING btree (vendor_id);
CREATE INDEX IF NOT EXISTS idx_property_vendor_assignments_work_order_id ON public.property_vendor_assignments USING btree (work_order_id);
CREATE INDEX IF NOT EXISTS idx_property_vendors_shop_id ON public.property_vendors USING btree (shop_id);
CREATE INDEX IF NOT EXISTS idx_property_vendors_shop_status ON public.property_vendors USING btree (shop_id, status);
CREATE INDEX IF NOT EXISTS idx_property_vendors_shop_trade ON public.property_vendors USING btree (shop_id, trade);
CREATE INDEX IF NOT EXISTS quickbooks_connections_active_idx ON public.quickbooks_connections USING btree (shop_id, is_active);
CREATE INDEX IF NOT EXISTS quickbooks_connections_shop_idx ON public.quickbooks_connections USING btree (shop_id);
CREATE INDEX IF NOT EXISTS quickbooks_customer_links_customer_idx ON public.quickbooks_customer_links USING btree (customer_id);
CREATE INDEX IF NOT EXISTS quickbooks_customer_links_shop_idx ON public.quickbooks_customer_links USING btree (shop_id);
CREATE INDEX IF NOT EXISTS quickbooks_sync_events_entity_idx ON public.quickbooks_sync_events USING btree (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS quickbooks_sync_events_shop_idx ON public.quickbooks_sync_events USING btree (shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shop_ai_profiles__shop_id ON public.shop_ai_profiles USING btree (shop_id);
CREATE INDEX IF NOT EXISTS idx_shop_boost_import_provenance_scope ON public.shop_boost_import_provenance USING btree (shop_id, intake_id, domain, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shop_boost_import_reset_audit_scope ON public.shop_boost_import_reset_audit_events USING btree (shop_id, intake_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shop_boost_intakes__shop_id ON public.shop_boost_intakes USING btree (shop_id);
CREATE INDEX IF NOT EXISTS shop_boost_intakes_created_at_idx ON public.shop_boost_intakes USING btree (created_at);
CREATE INDEX IF NOT EXISTS shop_boost_intakes_created_by_idx ON public.shop_boost_intakes USING btree (created_by);
CREATE INDEX IF NOT EXISTS shop_boost_intakes_shop_id_idx ON public.shop_boost_intakes USING btree (shop_id);
CREATE INDEX IF NOT EXISTS shop_boost_intakes_status_idx ON public.shop_boost_intakes USING btree (status);
CREATE INDEX IF NOT EXISTS idx_shop_boost_integrity_reports_lookup ON public.shop_boost_integrity_reports USING btree (shop_id, intake_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shop_boost_review_audit_lookup ON public.shop_boost_review_audit_events USING btree (shop_id, intake_id, review_item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shop_boost_review_items_cluster ON public.shop_boost_review_items USING btree (shop_id, intake_id, cluster_key);
CREATE INDEX IF NOT EXISTS idx_shop_boost_review_items_domain ON public.shop_boost_review_items USING btree (shop_id, domain);
CREATE INDEX IF NOT EXISTS idx_shop_boost_review_items_ignore_reason ON public.shop_boost_review_items USING btree (shop_id, intake_id, ignore_reason_code) WHERE (status = 'ignored'::text);
CREATE INDEX IF NOT EXISTS idx_shop_boost_review_items_intake ON public.shop_boost_review_items USING btree (intake_id);
CREATE INDEX IF NOT EXISTS idx_shop_boost_review_items_materialization ON public.shop_boost_review_items USING btree (shop_id, intake_id, status, materialized_at);
CREATE INDEX IF NOT EXISTS idx_shop_boost_review_items_recommendation ON public.shop_boost_review_items USING btree (shop_id, intake_id, recommended_action, recommendation_confidence);
CREATE INDEX IF NOT EXISTS idx_shop_boost_review_items_shop_status ON public.shop_boost_review_items USING btree (shop_id, status);
CREATE INDEX IF NOT EXISTS idx_shop_boost_row_results_cluster ON public.shop_boost_row_results USING btree (shop_id, intake_id, cluster_key);
CREATE INDEX IF NOT EXISTS idx_shop_boost_row_results_intake ON public.shop_boost_row_results USING btree (intake_id);
CREATE INDEX IF NOT EXISTS idx_shop_boost_row_results_review ON public.shop_boost_row_results USING btree (shop_id, review_required);
CREATE INDEX IF NOT EXISTS idx_shop_boost_row_results_shop_domain ON public.shop_boost_row_results USING btree (shop_id, target_domain);
CREATE UNIQUE INDEX IF NOT EXISTS shop_brand_assets_one_active_per_kind_idx ON public.shop_brand_assets USING btree (shop_id, kind) WHERE (is_active = true);
CREATE INDEX IF NOT EXISTS shop_brand_assets_shop_id_idx ON public.shop_brand_assets USING btree (shop_id);
CREATE INDEX IF NOT EXISTS shop_brand_assets_shop_kind_active_idx ON public.shop_brand_assets USING btree (shop_id, kind, is_active);
CREATE INDEX IF NOT EXISTS shop_brand_assets_shop_kind_archived_idx ON public.shop_brand_assets USING btree (shop_id, kind, archived_at);
CREATE INDEX IF NOT EXISTS shop_brand_assets_shop_kind_favorite_idx ON public.shop_brand_assets USING btree (shop_id, kind, is_favorite);
CREATE INDEX IF NOT EXISTS shop_brand_assets_shop_kind_idx ON public.shop_brand_assets USING btree (shop_id, kind);
CREATE INDEX IF NOT EXISTS idx_shop_health_snapshots__shop_id ON public.shop_health_snapshots USING btree (shop_id);
CREATE INDEX IF NOT EXISTS shop_health_snapshots_created_at_idx ON public.shop_health_snapshots USING btree (created_at);
CREATE INDEX IF NOT EXISTS shop_health_snapshots_intake_id_idx ON public.shop_health_snapshots USING btree (intake_id);
CREATE INDEX IF NOT EXISTS shop_health_snapshots_metrics_gin_idx ON public.shop_health_snapshots USING gin (metrics);
CREATE INDEX IF NOT EXISTS shop_health_snapshots_scores_gin_idx ON public.shop_health_snapshots USING gin (scores);
CREATE INDEX IF NOT EXISTS shop_health_snapshots_shop_id_idx ON public.shop_health_snapshots USING btree (shop_id);
CREATE INDEX IF NOT EXISTS shop_import_files_intake_id_idx ON public.shop_import_files USING btree (intake_id);
CREATE INDEX IF NOT EXISTS shop_import_files_kind_idx ON public.shop_import_files USING btree (kind);
CREATE INDEX IF NOT EXISTS shop_import_files_sha256_idx ON public.shop_import_files USING btree (sha256);
CREATE INDEX IF NOT EXISTS idx_shop_import_rows_parse_status ON public.shop_import_rows USING btree (parse_status);
CREATE INDEX IF NOT EXISTS idx_shop_import_rows_shop_id ON public.shop_import_rows USING btree (shop_id);
CREATE INDEX IF NOT EXISTS shop_import_rows_entity_type_idx ON public.shop_import_rows USING btree (entity_type);
CREATE INDEX IF NOT EXISTS shop_import_rows_file_id_idx ON public.shop_import_rows USING btree (file_id);
CREATE INDEX IF NOT EXISTS shop_import_rows_intake_id_idx ON public.shop_import_rows USING btree (intake_id);
CREATE INDEX IF NOT EXISTS shop_import_rows_normalized_gin_idx ON public.shop_import_rows USING gin (normalized);
CREATE INDEX IF NOT EXISTS shop_import_rows_raw_gin_idx ON public.shop_import_rows USING gin (raw);
CREATE INDEX IF NOT EXISTS shop_maintenance_service_map_menu_item_idx ON public.shop_maintenance_service_map USING btree (menu_item_id) WHERE (menu_item_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS shop_maintenance_service_map_menu_repair_idx ON public.shop_maintenance_service_map USING btree (menu_repair_item_id) WHERE (menu_repair_item_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS shop_maintenance_service_map_shop_idx ON public.shop_maintenance_service_map USING btree (shop_id);
CREATE INDEX IF NOT EXISTS idx_shop_members__shop_id ON public.shop_members USING btree (shop_id);
CREATE INDEX IF NOT EXISTS idx_shop_members__user_id ON public.shop_members USING btree (user_id);
CREATE INDEX IF NOT EXISTS shop_members_shop_role_idx ON public.shop_members USING btree (shop_id, role);
CREATE INDEX IF NOT EXISTS shop_members_user_shop_idx ON public.shop_members USING btree (user_id, shop_id);
CREATE INDEX IF NOT EXISTS idx_shop_onboarding_attempts_job ON public.shop_onboarding_attempts USING btree (job_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_shop_onboarding_attempts_run ON public.shop_onboarding_attempts USING btree (run_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_shop_onboarding_jobs_queue ON public.shop_onboarding_jobs USING btree (status, priority, retry_after NULLS FIRST, created_at);
CREATE INDEX IF NOT EXISTS idx_shop_onboarding_jobs_run_status ON public.shop_onboarding_jobs USING btree (run_id, status, priority, created_at);
CREATE INDEX IF NOT EXISTS idx_shop_onboarding_jobs_shop_intake ON public.shop_onboarding_jobs USING btree (shop_id, intake_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shop_onboarding_runs_retry_after ON public.shop_onboarding_runs USING btree (state, retry_after);
CREATE INDEX IF NOT EXISTS idx_shop_onboarding_runs_shop_state ON public.shop_onboarding_runs USING btree (shop_id, state, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_shop_parts_import_match_candidates_shop ON public.shop_parts_import_match_candidates USING btree (shop_id);
CREATE INDEX IF NOT EXISTS idx_shop_parts_import_match_candidates_staging ON public.shop_parts_import_match_candidates USING btree (staging_row_id);
CREATE INDEX IF NOT EXISTS idx_shop_parts_import_staging_intake ON public.shop_parts_import_staging USING btree (intake_id);
CREATE INDEX IF NOT EXISTS idx_shop_parts_import_staging_part_number ON public.shop_parts_import_staging USING btree (shop_id, normalized_part_number);
CREATE INDEX IF NOT EXISTS idx_shop_parts_import_staging_shop_status ON public.shop_parts_import_staging USING btree (shop_id, status);
CREATE INDEX IF NOT EXISTS idx_shop_parts_import_staging_sku ON public.shop_parts_import_staging USING btree (shop_id, normalized_sku);
CREATE INDEX IF NOT EXISTS idx_shop_parts_source_aliases_lookup ON public.shop_parts_source_aliases USING btree (shop_id, legacy_part_number, legacy_sku);
CREATE INDEX IF NOT EXISTS idx_shop_parts_source_aliases_shop_part ON public.shop_parts_source_aliases USING btree (shop_id, part_id);
CREATE INDEX IF NOT EXISTS idx_shop_vehicle_menu_items__shop_id ON public.shop_vehicle_menu_items USING btree (shop_id);
CREATE INDEX IF NOT EXISTS shop_vehicle_menu_items_menu_item_idx ON public.shop_vehicle_menu_items USING btree (menu_item_id);
CREATE INDEX IF NOT EXISTS shop_vehicle_menu_items_shop_idx ON public.shop_vehicle_menu_items USING btree (shop_id);
CREATE INDEX IF NOT EXISTS idx_shopreel_drafts_shop_status ON public.shopreel_drafts USING btree (shop_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_shopreel_event_deliveries_event_key ON public.shopreel_event_deliveries USING btree (event_key);
CREATE INDEX IF NOT EXISTS idx_shopreel_event_deliveries_shop_id ON public.shopreel_event_deliveries USING btree (shop_id);
CREATE INDEX IF NOT EXISTS idx_shopreel_event_deliveries_status ON public.shopreel_event_deliveries USING btree (status);
CREATE INDEX IF NOT EXISTS idx_shopreel_integrations_shop_id ON public.shopreel_integrations USING btree (shop_id);
CREATE INDEX IF NOT EXISTS idx_shopreel_manual_assets_created_at ON public.shopreel_manual_assets USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shopreel_manual_assets_shop_id ON public.shopreel_manual_assets USING btree (shop_id);
CREATE INDEX IF NOT EXISTS idx_shopreel_manual_assets_status ON public.shopreel_manual_assets USING btree (status);
CREATE INDEX IF NOT EXISTS idx_shopreel_opportunities_shop_status ON public.shopreel_opportunities USING btree (shop_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shopreel_opportunity_history_shop ON public.shopreel_opportunity_status_history USING btree (shop_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS shopreel_publications_connection_idx ON public.shopreel_publications USING btree (connection_id);
CREATE INDEX IF NOT EXISTS shopreel_publications_platform_idx ON public.shopreel_publications USING btree (platform);
CREATE INDEX IF NOT EXISTS shopreel_publications_scheduled_for_idx ON public.shopreel_publications USING btree (scheduled_for);
CREATE INDEX IF NOT EXISTS shopreel_publications_shop_idx ON public.shopreel_publications USING btree (shop_id);
CREATE INDEX IF NOT EXISTS shopreel_publications_status_idx ON public.shopreel_publications USING btree (status);
CREATE INDEX IF NOT EXISTS shopreel_publications_video_idx ON public.shopreel_publications USING btree (video_id);
CREATE INDEX IF NOT EXISTS idx_shopreel_publish_jobs_publication_id ON public.shopreel_publish_jobs USING btree (publication_id);
CREATE INDEX IF NOT EXISTS idx_shopreel_publish_jobs_status_run_after ON public.shopreel_publish_jobs USING btree (status, run_after);
CREATE INDEX IF NOT EXISTS shopreel_social_connections_platform_idx ON public.shopreel_social_connections USING btree (platform);
CREATE INDEX IF NOT EXISTS shopreel_social_connections_shop_idx ON public.shopreel_social_connections USING btree (shop_id);
CREATE UNIQUE INDEX IF NOT EXISTS shopreel_social_connections_shop_platform_uidx ON public.shopreel_social_connections USING btree (shop_id, platform);
CREATE INDEX IF NOT EXISTS idx_shopreel_story_sources_event_type ON public.shopreel_story_sources USING btree (shop_id, event_type);
CREATE INDEX IF NOT EXISTS idx_shopreel_story_sources_shop_ingested ON public.shopreel_story_sources USING btree (shop_id, ingested_at DESC);
CREATE INDEX IF NOT EXISTS idx_staff_certifications_expiry ON public.staff_certifications USING btree (shop_id, expiry_date);
CREATE INDEX IF NOT EXISTS idx_staff_certifications_shop_user ON public.staff_certifications USING btree (shop_id, user_id);
CREATE INDEX IF NOT EXISTS idx_staff_invite_candidates__shop_id ON public.staff_invite_candidates USING btree (shop_id);
CREATE INDEX IF NOT EXISTS staff_invite_candidates_created_at_idx ON public.staff_invite_candidates USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS staff_invite_candidates_intake_id_idx ON public.staff_invite_candidates USING btree (intake_id);
CREATE INDEX IF NOT EXISTS staff_invite_candidates_shop_id_idx ON public.staff_invite_candidates USING btree (shop_id);
CREATE INDEX IF NOT EXISTS staff_invite_candidates_shop_status_idx ON public.staff_invite_candidates USING btree (shop_id, status);
CREATE INDEX IF NOT EXISTS idx_staff_invite_suggestions__shop_id ON public.staff_invite_suggestions USING btree (shop_id);
CREATE INDEX IF NOT EXISTS staff_invite_suggestions_intake_id_idx ON public.staff_invite_suggestions USING btree (intake_id);
CREATE UNIQUE INDEX IF NOT EXISTS staff_invite_suggestions_shop_external_id_uidx ON public.staff_invite_suggestions USING btree (shop_id, external_id);
CREATE INDEX IF NOT EXISTS staff_invite_suggestions_shop_id_idx ON public.staff_invite_suggestions USING btree (shop_id);
CREATE INDEX IF NOT EXISTS idx_sqbr_batch_id ON public.supplier_quote_batch_rows USING btree (batch_id);
CREATE INDEX IF NOT EXISTS idx_supplier_quote_batch_rows_batch_review ON public.supplier_quote_batch_rows USING btree (batch_id, review_status);
CREATE INDEX IF NOT EXISTS idx_supplier_quote_batches_shop_id ON public.supplier_quote_batches USING btree (shop_id);
CREATE INDEX IF NOT EXISTS idx_supplier_quote_batches_shop_status ON public.supplier_quote_batches USING btree (shop_id, status);
CREATE INDEX IF NOT EXISTS idx_supplier_quote_batches_supplier_id ON public.supplier_quote_batches USING btree (supplier_id);
CREATE INDEX IF NOT EXISTS idx_user_theme_preferences_shop_id ON public.user_theme_preferences USING btree (shop_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_menus_lookup ON public.vehicle_menus USING btree (lower(make), lower(model), year_from, year_to, service_code);
CREATE INDEX IF NOT EXISTS vehicle_menus_engine_idx ON public.vehicle_menus USING btree (make, model, COALESCE(engine_family, ''::text), service_code);
CREATE INDEX IF NOT EXISTS vehicle_menus_lookup_idx ON public.vehicle_menus USING btree (make, model, service_code, year_from, year_to);
CREATE UNIQUE INDEX IF NOT EXISTS vehicle_menus_unique_fitment ON public.vehicle_menus USING btree (make, model, year_from, year_to, COALESCE(engine_family, ''::text), service_code);
CREATE INDEX IF NOT EXISTS idx_videos_content_type ON public.videos USING btree (content_type);
CREATE INDEX IF NOT EXISTS idx_videos_published_at ON public.videos USING btree (published_at);
CREATE INDEX IF NOT EXISTS idx_videos_shop_id ON public.videos USING btree (shop_id);
CREATE INDEX IF NOT EXISTS idx_videos_status ON public.videos USING btree (status);
CREATE INDEX IF NOT EXISTS idx_work_order_invoice_reviews__shop_id ON public.work_order_invoice_reviews USING btree (shop_id);
CREATE INDEX IF NOT EXISTS wor_created_at_idx ON public.work_order_invoice_reviews USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS wor_shop_id_idx ON public.work_order_invoice_reviews USING btree (shop_id);
CREATE INDEX IF NOT EXISTS wor_work_order_created_idx ON public.work_order_invoice_reviews USING btree (work_order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_work_order_line_ai__shop_id ON public.work_order_line_ai USING btree (shop_id);
CREATE INDEX IF NOT EXISTS idx_work_order_line_ai_shop_id ON public.work_order_line_ai USING btree (shop_id);
CREATE INDEX IF NOT EXISTS idx_work_order_line_ai_work_order_id ON public.work_order_line_ai USING btree (work_order_id);
CREATE INDEX IF NOT EXISTS idx_work_order_line_ai_work_order_line_id ON public.work_order_line_ai USING btree (work_order_line_id);
CREATE INDEX IF NOT EXISTS work_order_line_ai_intake_id_idx ON public.work_order_line_ai USING btree (intake_id);
CREATE INDEX IF NOT EXISTS work_order_line_ai_shop_id_idx ON public.work_order_line_ai USING btree (shop_id);
CREATE INDEX IF NOT EXISTS work_order_line_ai_work_order_id_idx ON public.work_order_line_ai USING btree (work_order_id);
CREATE INDEX IF NOT EXISTS work_order_line_ai_work_order_line_id_idx ON public.work_order_line_ai USING btree (work_order_line_id);
CREATE INDEX IF NOT EXISTS idx_work_order_line_dtc_threads_shop_id ON public.work_order_line_dtc_threads USING btree (shop_id);
CREATE INDEX IF NOT EXISTS idx_work_order_line_dtc_threads_work_order_id ON public.work_order_line_dtc_threads USING btree (work_order_id);
CREATE INDEX IF NOT EXISTS work_order_line_dtc_threads_shop_idx ON public.work_order_line_dtc_threads USING btree (shop_id);
CREATE INDEX IF NOT EXISTS work_order_line_dtc_threads_work_order_idx ON public.work_order_line_dtc_threads USING btree (work_order_id);
CREATE INDEX IF NOT EXISTS idx_workforce_doc_requirements_shop_active ON public.workforce_document_requirements USING btree (shop_id, is_active);
CREATE INDEX IF NOT EXISTS idx_workforce_doc_requirements_shop_doc_active ON public.workforce_document_requirements USING btree (shop_id, doc_type, is_active);
CREATE INDEX IF NOT EXISTS idx_workforce_doc_requirements_target_doc_active ON public.workforce_document_requirements USING btree (shop_id, workforce_role, workforce_category, doc_type, is_active);
CREATE UNIQUE INDEX IF NOT EXISTS workforce_doc_requirements_active_target_doc_uniq ON public.workforce_document_requirements USING btree (shop_id, COALESCE(workforce_role, ''::text), COALESCE(workforce_category, ''::text), doc_type) WHERE (is_active = true);

COMMIT;
