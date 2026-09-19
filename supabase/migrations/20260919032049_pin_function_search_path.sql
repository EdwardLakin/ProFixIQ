-- Pin search_path on SECURITY DEFINER / trigger helper functions flagged as
-- "function_search_path_mutable" by the Supabase security advisor.
-- Pinning to a fixed, non-inherited search_path closes the classic search_path
-- hijack vector without changing how these functions currently resolve names,
-- since they already run against objects in public/extensions.
--
-- Many of these functions predate this repo's tracked migration history (created
-- directly in production, not via any supabase/migrations/*.sql file), matching
-- the same production-only-legacy-object situation already documented in
-- 20260818160000_harden_security_definer_views.sql. Each ALTER is guarded with
-- to_regprocedure() so a from-scratch clean-replay (which only has the tracked
-- subset) skips objects that don't exist there instead of failing, while still
-- applying against the real production schema where they do exist.

do $$
declare
  sig text;
begin
  foreach sig in array array[
    'public._ensure_same_shop(uuid)',
    'public.agent_approve_action(uuid,uuid)',
    'public.agent_can_start()',
    'public.agent_claim_next_message(text,text[])',
    'public.agent_create_action(uuid,text,agent_action_risk,text,jsonb,boolean)',
    'public.agent_job_heartbeat(uuid,text)',
    'public.agent_mark_job_canceled(uuid,text)',
    'public.agent_mark_job_failed(uuid,text,integer)',
    'public.agent_mark_job_succeeded(uuid)',
    'public.agent_mark_message_failed(uuid,text,integer)',
    'public.agent_mark_message_succeeded(uuid,text)',
    'public.agent_reject_action(uuid,uuid,text)',
    'public.assign_default_shop()',
    'public.assign_unassigned_lines(uuid,uuid)',
    'public.auto_release_line()',
    'public.chat_participants_key(uuid,uuid[])',
    'public.check_plan_limit(text)',
    'public.clear_auth()',
    'public.clear_other_active_brand_assets()',
    'public.compute_timecard_hours()',
    'public.customers_set_updated_at()',
    'public.decrement_user_count()',
    'public.decrement_user_count_on_delete()',
    'public.enforce_ai_suggestion_feedback_consistency()',
    'public.enforce_assistant_daily_summary_consistency()',
    'public.enforce_chat_participant_consistency()',
    'public.enforce_content_asset_consistency()',
    'public.enforce_content_event_consistency()',
    'public.enforce_conversation_participant_consistency()',
    'public.enforce_part_allocation_limits()',
    'public.enforce_portal_notification_consistency()',
    'public.enforce_property_inspection_signature_shop_id()',
    'public.enforce_shop_user_limit()',
    'public.enforce_supplier_quote_batch_row_consistency()',
    'public.enforce_vehicle_shop_matches_customer()',
    'public.enforce_work_order_approval_consistency()',
    'public.enforce_work_order_customer_vehicle_consistency()',
    'public.enforce_work_order_lifecycle()',
    'public.enforce_work_order_line_ai_consistency()',
    'public.ensure_self_owned_policies(regclass,text)',
    'public.ensure_user_with_profile(uuid,uuid,text,text)',
    'public.ensure_wo_shop_policies(regclass,text)',
    'public.find_menu_item_for_vehicle_service(uuid,integer,text,text,text,text)',
    'public.first_segment_uuid(text)',
    'public.fleet_fill_fleet_id()',
    'public.fn_tech_sessions_guard()',
    'public.get_default_stock_location(uuid)',
    'public.get_or_create_vehicle_signature(uuid,uuid)',
    'public.get_or_create_vehicle_signature(uuid,uuid,integer,text,text,text,text,text,text,text)',
    'public.handle_approval_to_work_order()',
    'public.handle_new_user()',
    'public.has_column(regclass,text)',
    'public.increment_user_count()',
    'public.is_admin()',
    'public.is_customer(uuid)',
    'public.is_shop_member(uuid)',
    'public.is_staff_for_shop(uuid)',
    'public.match_learned_job_templates(uuid,vector,integer)',
    'public.match_work_order_intelligence(uuid,vector,integer)',
    'public.menu_items_compute_totals()',
    'public.menu_repair_items_set_updated_at()',
    'public.normalize_work_order_line_status()',
    'public.payroll_timecards_set_hours()',
    'public.phase1_touch_updated_at()',
    'public.property_portal_invites_set_updated_at()',
    'public.property_portal_invites_validate_hierarchy()',
    'public.punch_events_set_user_from_shift()',
    'public.punch_out(uuid)',
    'public.recalc_menu_items_for_shop()',
    'public.recalc_shop_active_user_count(uuid)',
    'public.recompute_wo_status_trigger_func()',
    'public.recompute_work_order_status(uuid)',
    'public.resolve_fleet_id_from_vehicle(uuid)',
    'public.seed_default_hours(uuid)',
    'public.set_authenticated(uuid)',
    'public.set_current_shop_id_from_row()',
    'public.set_import_job_updated_at()',
    'public.set_last_active_now()',
    'public.set_message_edited_at()',
    'public.set_quickbooks_updated_at()',
    'public.set_shop_maintenance_service_map_updated_at()',
    'public.set_shop_profiles_updated_at()',
    'public.set_shop_ratings_updated_at()',
    'public.set_updated_at()',
    'public.set_updated_at_now()',
    'public.set_updated_at_shopreel_event_deliveries()',
    'public.set_updated_at_shopreel_integrations()',
    'public.set_updated_at_timestamp()',
    'public.set_updated_at_work_order_quote_lines()',
    'public.set_user_theme_preferences_updated_at()',
    'public.set_wol_shop_id()',
    'public.set_wol_shop_id_from_wo()',
    'public.set_work_order_intelligence_updated_at()',
    'public.set_work_order_line_dtc_threads_updated_at()',
    'public.set_work_order_line_labor_segments_updated_at()',
    'public.shop_id_for(uuid)',
    'public.shop_reel_settings_set_updated_at()',
    'public.shop_staff_user_count(uuid)',
    'public.shopreel_manual_assets_set_updated_at()',
    'public.snapshot_wol_on_wo_complete()',
    'public.sync_profiles_user_id()',
    'public.sync_shop_brand_logo_to_profile()',
    'public.tg_notify_quote_request()',
    'public.tg_profiles_enforce_shop_user_limit()',
    'public.tg_profiles_recalc_shop_user_count()',
    'public.tg_recompute_shop_rating()',
    'public.tg_set_created_by()',
    'public.tg_set_quoted_at()',
    'public.tg_set_timestamps()',
    'public.tg_set_updated_at()',
    'public.tg_set_work_orders_shop()',
    'public.tg_shop_reviews_set_updated_at()',
    'public.tg_shops_set_owner_and_creator()',
    'public.update_part_quote(uuid,uuid,text,numeric)',
    'public.update_pricing_snapshot_status()',
    'public.update_updated_at_column()',
    'public.validate_property_approval_thresholds_tenant_consistency()',
    'public.validate_property_assets_tenant_consistency()',
    'public.validate_property_inspections_tenant_consistency()',
    'public.validate_property_maintenance_requests_tenant_consistency()',
    'public.validate_property_members_tenant_consistency()',
    'public.validate_property_properties_tenant_consistency()',
    'public.validate_property_request_attachment_scope()',
    'public.validate_property_request_event_scope()',
    'public.validate_property_request_receipt_scope()',
    'public.validate_property_units_tenant_consistency()',
    'public.validate_property_vendor_assignments_tenant_consistency()',
    'public.wol_assign_line_no()',
    'public.wol_backfill_template_from_menu()',
    'public.wopa_sync_work_order_id()',
    'public.work_orders_set_shop_id()'
  ]
  loop
    if to_regprocedure(sig) is not null then
      execute format('alter routine %s set search_path = %L', sig, 'public, extensions, pg_temp');
    end if;
  end loop;
end
$$;

do $$
declare
  sig text;
begin
  foreach sig in array array[
    'onboarding_agent.append_onboarding_event(uuid,uuid,uuid,uuid,uuid,text,text,text,jsonb)',
    'onboarding_agent.claim_onboarding_jobs(uuid,uuid,text,integer)'
  ]
  loop
    if to_regprocedure(sig) is not null then
      execute format('alter routine %s set search_path = %L', sig, 'onboarding_agent, public, extensions, pg_temp');
    end if;
  end loop;
end
$$;
