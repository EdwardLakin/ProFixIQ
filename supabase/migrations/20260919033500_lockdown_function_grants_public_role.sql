-- Follow-up to 20260919033258_lockdown_function_grants.sql.
--
-- That migration revoked EXECUTE on anon/authenticated for a set of internal
-- trigger and helper functions, but Postgres grants EXECUTE to the PUBLIC
-- pseudo-role by default when a function is created, and that migration
-- did not touch PUBLIC. Since every role (anon and authenticated included)
-- implicitly holds whatever PUBLIC holds, the earlier revoke was a no-op for
-- any function that still had its default PUBLIC grant -- verified live:
-- 164 of the ~186 functions revoked there still had EXECUTE via PUBLIC.
--
-- Every function below was verified to also have its own explicit
-- service_role grant, so revoking PUBLIC does not affect service-role-driven
-- backend code paths; the function owner (postgres) is unaffected by grants
-- entirely. Same function/procedure list as the prior migration, same three
-- functions (is_admin, field_storage_path_uuid, realtime_conversation_id)
-- excluded for the same reason (referenced by storage/realtime RLS policies).

-- Category 1: trigger functions (safe -- table-owner execution, not directly callable)
revoke execute on function public.ai_automation_touch_updated_at() from public;
revoke execute on function public.apply_stock_move_to_snapshot() from public;
revoke execute on function public.assign_default_shop() from public;
revoke execute on function public.bump_profile_last_active_on_message() from public;
revoke execute on function public.capture_ai_automation_observation() from public;
revoke execute on function public.customers_set_shop_id() from public;
revoke execute on function public.customers_set_updated_at() from public;
revoke execute on function public.enforce_assistant_notification_consistency() from public;
revoke execute on function public.enforce_chat_participant_consistency() from public;
revoke execute on function public.enforce_conversation_participant_consistency() from public;
revoke execute on function public.enforce_part_allocation_limits() from public;
revoke execute on function public.enforce_portal_notification_consistency() from public;
revoke execute on function public.enforce_shop_user_limit() from public;
revoke execute on function public.enforce_single_active_tech_shift() from public;
revoke execute on function public.enforce_vehicle_shop_matches_customer() from public;
revoke execute on function public.enforce_work_order_approval_consistency() from public;
revoke execute on function public.enforce_work_order_customer_vehicle_consistency() from public;
revoke execute on function public.enforce_work_order_lifecycle() from public;
revoke execute on function public.finalize_shift_from_end_punch() from public;
revoke execute on function public.fn_tech_sessions_guard() from public;
revoke execute on function public.guard_financially_locked_work_order() from public;
revoke execute on function public.guard_financially_locked_work_order_child() from public;
revoke execute on function public.guard_invoice_version_reissue() from public;
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.increment_portal_campaign_verified() from public;
revoke execute on function public.inspections_set_shop_id() from public;
revoke execute on function public.log_ai_event() from public;
revoke execute on function public.log_audit() from public;
revoke execute on function public.menu_item_parts_set_defaults() from public;
revoke execute on function public.menu_items_compute_totals() from public;
revoke execute on function public.normalize_work_order_line_status() from public;
revoke execute on function public.on_work_order_line_active_parts_flow() from public;
revoke execute on function public.on_work_order_line_became_active_create_parts() from public;
revoke execute on function public.owner_report_summaries_touch_updated_at() from public;
revoke execute on function public.parts_validate_replacement_links() from public;
revoke execute on function public.phase1_touch_updated_at() from public;
revoke execute on function public.prevent_finalized_inspection_mutation() from public;
revoke execute on function public.prevent_inspection_canonical_marker_mutation() from public;
revoke execute on function public.prevent_inspection_signature_evidence_mutation() from public;
revoke execute on function public.prevent_part_request_item_anchor_changes() from public;
revoke execute on function public.prevent_profile_authorization_self_write() from public;
revoke execute on function public.prevent_technician_signature_mutation() from public;
revoke execute on function public.punch_events_set_user_from_shift() from public;
revoke execute on function public.register_job_photo_storage_object() from public;
revoke execute on function public.set_current_shop_id_from_row() from public;
revoke execute on function public.set_import_job_updated_at() from public;
revoke execute on function public.set_message_edited_at() from public;
revoke execute on function public.set_owner_shop_id() from public;
revoke execute on function public.set_shop_profiles_updated_at() from public;
revoke execute on function public.set_shop_ratings_updated_at() from public;
revoke execute on function public.set_updated_at() from public;
revoke execute on function public.set_updated_at_work_order_quote_lines() from public;
revoke execute on function public.set_work_order_intelligence_updated_at() from public;
revoke execute on function public.set_work_order_line_labor_segments_updated_at() from public;
revoke execute on function public.shop_assistant_set_updated_at() from public;
revoke execute on function public.shop_assistant_touch_thread_after_message() from public;
revoke execute on function public.shop_assistant_validate_action_thread() from public;
revoke execute on function public.shop_assistant_validate_message_thread() from public;
revoke execute on function public.shop_reel_settings_set_updated_at() from public;
revoke execute on function public.sync_profiles_user_id() from public;
revoke execute on function public.tg_log_part_fitment_event_from_allocation() from public;
revoke execute on function public.tg_log_part_fitment_event_from_consumption() from public;
revoke execute on function public.tg_notify_quote_request() from public;
revoke execute on function public.tg_profiles_enforce_shop_user_limit() from public;
revoke execute on function public.tg_profiles_recalc_shop_user_count() from public;
revoke execute on function public.tg_recompute_shop_rating() from public;
revoke execute on function public.tg_set_quoted_at() from public;
revoke execute on function public.tg_set_timestamps() from public;
revoke execute on function public.tg_shop_reviews_set_updated_at() from public;
revoke execute on function public.tg_work_orders_sync_vehicle_snapshot() from public;
revoke execute on function public.touch_conversation_from_message() from public;
revoke execute on function public.trg_parts_auto_release_approved_line() from public;
revoke execute on function public.trg_parts_auto_release_approved_line_part() from public;
revoke execute on function public.trg_parts_protect_handoff_boundary() from public;
revoke execute on function public.trg_parts_reconcile_line_approval() from public;
revoke execute on function public.trg_parts_reconcile_quote_decision() from public;
revoke execute on function public.trg_parts_reconcile_request_from_item() from public;
revoke execute on function public.trg_parts_reconcile_request_from_parent() from public;
revoke execute on function public.trg_parts_require_request_release_for_allocation() from public;
revoke execute on function public.trg_parts_require_request_release_for_item_operation() from public;
revoke execute on function public.trg_parts_require_request_release_for_po_line() from public;
revoke execute on function public.trg_parts_require_request_release_for_wop() from public;
revoke execute on function public.trg_parts_sync_technician_ready_from_item() from public;
revoke execute on function public.trg_parts_sync_technician_ready_from_request() from public;
revoke execute on function public.trg_sync_flat_rate_credits() from public;
revoke execute on function public.trg_sync_flat_rate_credits_from_assignment() from public;
revoke execute on function public.trg_sync_quote_line_pricing_from_parts() from public;
revoke execute on function public.update_updated_at_column() from public;
revoke execute on function public.validate_property_approval_thresholds_tenant_consistency() from public;
revoke execute on function public.validate_property_request_receipt_scope() from public;
revoke execute on function public.validate_work_order_media_scope() from public;
revoke execute on function public.wo_alloc_recompute_invoice_aiu() from public;
revoke execute on function public.wol_assign_line_no() from public;
revoke execute on function public.wol_backfill_template_from_menu() from public;
revoke execute on function public.wol_copy_menu_parts_to_work_order_parts() from public;
revoke execute on function public.wol_delete_staged_parts_on_delete() from public;
revoke execute on function public.wol_recompute_invoice_aiu() from public;
revoke execute on function public.wol_refresh_staged_parts_on_update() from public;
revoke execute on function public.wopa_sync_work_order_id() from public;
revoke execute on function public.work_order_lines_set_shop_id() from public;
revoke execute on function public.work_orders_set_shop_id() from public;

-- Category 2: other custom functions with no direct caller, no RLS/view/check
-- reachability, and no reachable path that requires the caller's own privileges
revoke execute on function public._ensure_same_shop(_wo uuid) from public;
revoke execute on function public.agent_claim_next_message(worker_id text, kinds text[]) from public;
revoke execute on function public.agent_create_action(p_request_id uuid, p_kind text, p_risk agent_action_risk, p_summary text, p_payload jsonb, p_requires_approval boolean) from public;
revoke execute on function public.agent_job_heartbeat(job_id uuid, worker_id text) from public;
revoke execute on function public.agent_mark_job_canceled(job_id uuid, reason text) from public;
revoke execute on function public.agent_mark_job_failed(job_id uuid, err text, retry_in_seconds integer) from public;
revoke execute on function public.agent_mark_job_succeeded(job_id uuid) from public;
revoke execute on function public.agent_mark_message_failed(message_id uuid, err text, retry_in_seconds integer) from public;
revoke execute on function public.agent_mark_message_succeeded(message_id uuid, processed_by_in text) from public;
revoke execute on function public.approve_lines(_wo uuid, _approved_ids uuid[], _declined_ids uuid[], _decline_unchecked boolean, _approver uuid) from public;
revoke execute on function public.assign_unassigned_lines(wo_id uuid, tech_id uuid) from public;
revoke execute on function public.assign_wol_shop_id() from public;
revoke execute on function public.auto_release_line() from public;
revoke execute on function public.can_manage_profile(target_profile_id uuid) from public;
revoke execute on function public.chat_participants_key(_sender uuid, _recipients uuid[]) from public;
revoke execute on function public.check_plan_limit(_feature text) from public;
revoke execute on function public.clear_auth() from public;
revoke execute on function public.compute_labor_cost_for_work_order(p_work_order_id uuid) from public;
revoke execute on function public.compute_parts_cost_for_work_order(p_work_order_id uuid) from public;
revoke execute on function public.consume_part_request_item_on_picked(p_request_item_id uuid) from public;
revoke execute on function public.consume_part_request_item_on_picked(p_request_item_id uuid, p_location_id uuid) from public;
revoke execute on function public.create_fleet_form_upload(_path text, _filename text) from public;
revoke execute on function public.decrement_user_count() from public;
revoke execute on function public.decrement_user_count_on_delete() from public;
revoke execute on function public.delete_part_request(p_request_id uuid) from public;
revoke execute on function public.enforce_invoice_lifecycle() from public;
revoke execute on function public.ensure_same_shop_policies(tab regclass, shop_col text) from public;
revoke execute on procedure public.ensure_self_owned_policies(IN tab regclass, IN owner_col text) from public;
revoke execute on procedure public.ensure_user_with_profile(IN uid uuid, IN shop uuid, IN role text, IN name text) from public;
revoke execute on procedure public.ensure_wo_shop_policies(IN tab regclass, IN wo_col text) from public;
revoke execute on function public.find_menu_item_for_vehicle_service(p_shop_id uuid, p_year integer, p_make text, p_model text, p_engine_family text, p_service_code text) from public;
revoke execute on function public.first_segment_uuid(p text) from public;
revoke execute on function public.generate_next_work_order_custom_id(p_shop_id uuid, p_user_id uuid) from public;
revoke execute on function public.generate_work_order_custom_id(p_shop_id uuid, p_user_id uuid) from public;
revoke execute on function public.get_default_stock_location(p_shop_id uuid) from public;
revoke execute on function public.get_live_invoice_id(p_work_order_id uuid) from public;
revoke execute on function public.get_or_create_vehicle_signature(p_shop_id uuid, p_vehicle_id uuid) from public;
revoke execute on function public.get_or_create_vehicle_signature(p_shop_id uuid, p_vehicle_id uuid, p_year integer, p_make text, p_model text, p_trim text, p_engine text, p_drivetrain text, p_transmission text, p_fuel_type text) from public;
revoke execute on function public.handle_approval_to_work_order() from public;
revoke execute on function public.increment_user_count() from public;
revoke execute on function public.invoice_is_locked(s text, issued_at timestamp with time zone) from public;
revoke execute on function public.is_customer(_customer uuid) from public;
revoke execute on function public.log_work_order_line_history() from public;
revoke execute on function public.mark_active() from public;
revoke execute on function public.maybe_release_line_hold_for_parts(p_work_order_line_id uuid) from public;
revoke execute on function public.mobile_actor_is_field_operator(p_shop_id uuid, p_actor_user_id uuid) from public;
revoke execute on function public.on_part_request_item_approved_reserve_stock() from public;
revoke execute on function public.on_part_request_item_reserved_autopick() from public;
revoke execute on function public.on_part_request_items_recheck_line_hold() from public;
revoke execute on function public.parts_get_operation_result(p_shop_id uuid, p_idempotency_key text) from public;
revoke execute on function public.parts_record_operation(p_shop_id uuid, p_idempotency_key text, p_operation_type text, p_request_item_id uuid, p_work_order_part_id uuid, p_result jsonb) from public;
revoke execute on function public.parts_request_jwt_role() from public;
revoke execute on function public.portal_approve_line(p_line_id uuid) from public;
revoke execute on function public.portal_approve_part_request_item(p_item_id uuid) from public;
revoke execute on function public.portal_decline_line(p_line_id uuid) from public;
revoke execute on function public.portal_decline_part_request_item(p_item_id uuid) from public;
revoke execute on function public.portal_list_approvals() from public;
revoke execute on function public.profixiq_workforce_role() from public;
revoke execute on function public.punch_in(p_line_id uuid) from public;
revoke execute on function public.punch_out(line_id uuid) from public;
revoke execute on function public.recalc_shop_active_user_count(p_shop_id uuid) from public;
revoke execute on function public.recompute_wo_status_trigger_func() from public;
revoke execute on function public.recompute_work_order_status(p_wo uuid) from public;
revoke execute on function public.record_video_metric(p_shop_id uuid, p_video_id uuid, p_platform text, p_metric_date date, p_impressions integer, p_views integer, p_watch_time_seconds numeric, p_avg_watch_seconds numeric, p_likes integer, p_comments integer, p_shares integer, p_saves integer, p_clicks integer, p_leads integer, p_bookings integer, p_revenue numeric, p_meta jsonb) from public;
revoke execute on function public.reserve_part_request_items_for_line(p_work_order_line_id uuid) from public;
revoke execute on function public.reserve_part_request_items_for_line(p_work_order_line_id uuid, p_location_id uuid) from public;
revoke execute on function public.restock_consumed_part_request_item(p_request_item_id uuid, p_qty numeric) from public;
revoke execute on function public.restock_consumed_part_request_item(p_request_item_id uuid, p_qty numeric, p_location_id uuid) from public;
revoke execute on function public.seed_default_hours(shop_id uuid) from public;
revoke execute on function public.set_authenticated(uid uuid) from public;
revoke execute on function public.set_last_active_now() from public;
revoke execute on function public.set_wol_shop_id() from public;
revoke execute on function public.set_wol_shop_id_from_wo() from public;
revoke execute on function public.shop_staff_user_count(p_shop_id uuid) from public;
revoke execute on function public.snapshot_line_on_complete() from public;
revoke execute on function public.snapshot_wol_on_wo_complete() from public;
revoke execute on function public.tg_invoices_compute_totals() from public;
revoke execute on function public.tg_invoices_sync_work_orders() from public;
revoke execute on function public.tg_set_created_by() from public;
revoke execute on function public.tg_set_work_orders_shop() from public;
revoke execute on function public.tg_shops_set_owner_and_creator() from public;
revoke execute on function public.transition_booking_status_by_staff(p_booking_id uuid, p_status text) from public;
revoke execute on function public.trg_part_request_item_picked_consume() from public;
revoke execute on function public.unreserve_part_request_item(p_request_item_id uuid, p_qty numeric) from public;
revoke execute on function public.unreserve_part_request_item(p_request_item_id uuid, p_qty numeric, p_location_id uuid) from public;
revoke execute on function public.update_part_quote(p_request uuid, p_item uuid, p_vendor text, p_price numeric) from public;
revoke execute on function public.vehicles_set_shop_id() from public;
revoke execute on function public.wol_set_shop_id() from public;
revoke execute on function public.work_order_in_my_shop(p_work_order_id uuid) from public;
