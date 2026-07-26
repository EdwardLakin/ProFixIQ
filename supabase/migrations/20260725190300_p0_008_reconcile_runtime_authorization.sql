-- P0-008: restore row-level policies and explicit API grants.
-- Every recovered table has RLS enabled. Anonymous/authenticated privileges are
-- derived from its reviewed policy commands; service_role remains the backend path.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15min';

ALTER TABLE public."agent_actions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."agent_attachments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."agent_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."agent_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ai_action_previews" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ai_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ai_evidence_snapshots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ai_recommendations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ai_suggestion_feedback" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ai_training_data" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."assets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."assistant_daily_summaries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."content_assets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."content_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."content_pieces" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."content_platform_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."content_publications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."content_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."dashboard_layouts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."dashboard_user_layouts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."expenses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."fleet_dispatch_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."fleet_inspection_schedules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."fleet_pretrip_reports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."fleet_program_tasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."fleet_programs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."fleet_service_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."fleet_vehicles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."guided_onboarding_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."guided_onboarding_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."guided_onboarding_steps" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."inspection_result_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."inspection_results" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."inspection_smart_match_feedback" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."inspection_smart_match_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."inspection_template_suggestions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."invoice_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."maintenance_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."maintenance_services" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."maintenance_suggestions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."menu_item_suggestions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."menu_repair_item_parts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."menu_repair_item_pricing_parts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."menu_repair_item_pricing_snapshots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."menu_repair_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."optimization_actions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."org_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."organizations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."payroll_timecards" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."people_workforce_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."planner_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."planner_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."property_assets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."property_inspection_signatures" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."property_inspections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."property_maintenance_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."property_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."property_portal_invites" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."property_portfolios" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."property_properties" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."property_request_attachments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."property_request_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."property_units" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."property_vendor_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."property_vendors" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."quickbooks_connections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."quickbooks_customer_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."quickbooks_sync_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."shop_ai_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."shop_boost_import_provenance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."shop_boost_import_reset_audit_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."shop_boost_intakes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."shop_boost_integrity_reports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."shop_boost_review_audit_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."shop_boost_review_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."shop_boost_row_results" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."shop_brand_assets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."shop_brand_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."shop_health_snapshots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."shop_import_files" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."shop_import_rows" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."shop_maintenance_service_map" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."shop_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."shop_onboarding_activation_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."shop_onboarding_attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."shop_onboarding_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."shop_onboarding_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."shop_parts_import_match_candidates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."shop_parts_import_staging" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."shop_parts_source_aliases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."shop_vehicle_menu_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."shopreel_drafts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."shopreel_event_deliveries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."shopreel_integrations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."shopreel_manual_assets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."shopreel_opportunities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."shopreel_opportunity_status_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."shopreel_publications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."shopreel_publish_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."shopreel_social_connections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."shopreel_story_sources" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."staff_certifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."staff_invite_candidates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."staff_invite_suggestions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."supplier_catalog_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."supplier_quote_batch_rows" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."supplier_quote_batches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."user_theme_preferences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."vehicle_menus" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."videos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."work_order_invoice_reviews" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."work_order_line_ai" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."work_order_line_dtc_threads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."workforce_document_requirements" ENABLE ROW LEVEL SECURITY;

DO $p0_008$
DECLARE
  item record;
BEGIN
  FOR item IN
    SELECT *
    FROM (VALUES
      ('agent_actions', 'agent_actions_deny_all', 'CREATE POLICY "agent_actions_deny_all" ON public."agent_actions" AS PERMISSIVE FOR ALL TO "anon", "authenticated" USING (false) WITH CHECK (false);'),
      ('agent_attachments', 'agent_attachments_delete_own_submitted', 'CREATE POLICY "agent_attachments_delete_own_submitted" ON public."agent_attachments" AS PERMISSIVE FOR DELETE TO "authenticated" USING (((created_by = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM agent_requests r
  WHERE ((r.id = agent_attachments.agent_request_id) AND (r.status = ''submitted''::agent_request_status))))));'),
      ('agent_attachments', 'agent_attachments_insert', 'CREATE POLICY "agent_attachments_insert" ON public."agent_attachments" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((created_by = auth.uid()) AND (EXISTS ( SELECT 1
   FROM agent_requests ar
  WHERE ((ar.id = agent_attachments.agent_request_id) AND (ar.shop_id = ( SELECT profiles.shop_id
           FROM profiles
          WHERE (profiles.id = auth.uid()))))))));'),
      ('agent_attachments', 'agent_attachments_insert_own', 'CREATE POLICY "agent_attachments_insert_own" ON public."agent_attachments" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((created_by = ( SELECT auth.uid() AS uid)));'),
      ('agent_attachments', 'agent_attachments_select', 'CREATE POLICY "agent_attachments_select" ON public."agent_attachments" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM agent_requests ar
  WHERE ((ar.id = agent_attachments.agent_request_id) AND (ar.shop_id = ( SELECT profiles.shop_id
           FROM profiles
          WHERE (profiles.id = auth.uid())))))));'),
      ('agent_attachments', 'agent_attachments_select_own_or_approvers', 'CREATE POLICY "agent_attachments_select_own_or_approvers" ON public."agent_attachments" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((created_by = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY[''owner''::text, ''admin''::text, ''manager''::text])))))));'),
      ('agent_requests', 'agent_requests_delete_shop', 'CREATE POLICY "agent_requests_delete_shop" ON public."agent_requests" AS PERMISSIVE FOR DELETE TO "authenticated" USING (is_shop_member(shop_id));'),
      ('agent_requests', 'agent_requests_insert', 'CREATE POLICY "agent_requests_insert" ON public."agent_requests" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((reporter_id = auth.uid()));'),
      ('agent_requests', 'agent_requests_insert_own', 'CREATE POLICY "agent_requests_insert_own" ON public."agent_requests" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT auth.uid() AS uid) = reporter_id));'),
      ('agent_requests', 'agent_requests_insert_shop', 'CREATE POLICY "agent_requests_insert_shop" ON public."agent_requests" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (is_shop_member(shop_id));'),
      ('agent_requests', 'agent_requests_select', 'CREATE POLICY "agent_requests_select" ON public."agent_requests" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((shop_id = ( SELECT profiles.shop_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));'),
      ('agent_requests', 'agent_requests_select_own', 'CREATE POLICY "agent_requests_select_own" ON public."agent_requests" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((reporter_id = auth.uid()));'),
      ('agent_requests', 'agent_requests_select_own_or_approvers', 'CREATE POLICY "agent_requests_select_own_or_approvers" ON public."agent_requests" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((reporter_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.agent_role = ''developer''::text))))));'),
      ('agent_requests', 'agent_requests_select_shop', 'CREATE POLICY "agent_requests_select_shop" ON public."agent_requests" AS PERMISSIVE FOR SELECT TO "authenticated" USING (is_shop_member(shop_id));'),
      ('agent_requests', 'agent_requests_select_shop_admins', 'CREATE POLICY "agent_requests_select_shop_admins" ON public."agent_requests" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = agent_requests.shop_id) AND (p.role = ANY (ARRAY[''owner''::text, ''manager''::text, ''advisor''::text, ''admin''::text]))))));'),
      ('agent_requests', 'agent_requests_update_own_submitted', 'CREATE POLICY "agent_requests_update_own_submitted" ON public."agent_requests" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((( SELECT auth.uid() AS uid) = reporter_id) AND (status = ''submitted''::agent_request_status))) WITH CHECK (((( SELECT auth.uid() AS uid) = reporter_id) AND (status = ''submitted''::agent_request_status)));'),
      ('agent_requests', 'agent_requests_update_reporter_or_dev', 'CREATE POLICY "agent_requests_update_reporter_or_dev" ON public."agent_requests" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((shop_id = ( SELECT profiles.shop_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND ((reporter_id = auth.uid()) OR is_agent_developer()))) WITH CHECK (((shop_id = ( SELECT profiles.shop_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND ((reporter_id = auth.uid()) OR is_agent_developer())));'),
      ('agent_requests', 'agent_requests_update_shop', 'CREATE POLICY "agent_requests_update_shop" ON public."agent_requests" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (is_shop_member(shop_id)) WITH CHECK (is_shop_member(shop_id));'),
      ('ai_action_previews', 'ai_action_previews_shop_insert', 'CREATE POLICY "ai_action_previews_shop_insert" ON public."ai_action_previews" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((shop_id = current_shop_id()));'),
      ('ai_action_previews', 'ai_action_previews_shop_select', 'CREATE POLICY "ai_action_previews_shop_select" ON public."ai_action_previews" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((shop_id = current_shop_id()));'),
      ('ai_action_previews', 'ai_action_previews_shop_update', 'CREATE POLICY "ai_action_previews_shop_update" ON public."ai_action_previews" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((shop_id = current_shop_id())) WITH CHECK ((shop_id = current_shop_id()));'),
      ('ai_action_previews', 'service-role-manage-ai-action-previews', 'CREATE POLICY "service-role-manage-ai-action-previews" ON public."ai_action_previews" AS PERMISSIVE FOR ALL TO "service_role" USING ((auth.role() = ''service_role''::text)) WITH CHECK ((auth.role() = ''service_role''::text));'),
      ('ai_events', 'ai_events_delete_none', 'CREATE POLICY "ai_events_delete_none" ON public."ai_events" AS PERMISSIVE FOR DELETE TO "authenticated" USING (false);'),
      ('ai_events', 'ai_events_insert_in_shop', 'CREATE POLICY "ai_events_insert_in_shop" ON public."ai_events" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((shop_id IS NULL) OR (shop_id = current_shop_id())));'),
      ('ai_events', 'ai_events_select_in_shop', 'CREATE POLICY "ai_events_select_in_shop" ON public."ai_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((shop_id IS NULL) OR (shop_id = current_shop_id())));'),
      ('ai_events', 'ai_events_update_none', 'CREATE POLICY "ai_events_update_none" ON public."ai_events" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (false);'),
      ('ai_evidence_snapshots', 'ai_evidence_snapshots_shop_insert', 'CREATE POLICY "ai_evidence_snapshots_shop_insert" ON public."ai_evidence_snapshots" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((shop_id = current_shop_id()));'),
      ('ai_evidence_snapshots', 'ai_evidence_snapshots_shop_select', 'CREATE POLICY "ai_evidence_snapshots_shop_select" ON public."ai_evidence_snapshots" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((shop_id = current_shop_id()));'),
      ('ai_evidence_snapshots', 'service-role-manage-ai-evidence-snapshots', 'CREATE POLICY "service-role-manage-ai-evidence-snapshots" ON public."ai_evidence_snapshots" AS PERMISSIVE FOR ALL TO "service_role" USING ((auth.role() = ''service_role''::text)) WITH CHECK ((auth.role() = ''service_role''::text));'),
      ('ai_recommendations', 'ai_recommendations_shop_insert', 'CREATE POLICY "ai_recommendations_shop_insert" ON public."ai_recommendations" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((shop_id = current_shop_id()));'),
      ('ai_recommendations', 'ai_recommendations_shop_select', 'CREATE POLICY "ai_recommendations_shop_select" ON public."ai_recommendations" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((shop_id = current_shop_id()));'),
      ('ai_recommendations', 'ai_recommendations_shop_update', 'CREATE POLICY "ai_recommendations_shop_update" ON public."ai_recommendations" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((shop_id = current_shop_id())) WITH CHECK ((shop_id = current_shop_id()));'),
      ('ai_recommendations', 'service-role-manage-ai-recommendations', 'CREATE POLICY "service-role-manage-ai-recommendations" ON public."ai_recommendations" AS PERMISSIVE FOR ALL TO "service_role" USING ((auth.role() = ''service_role''::text)) WITH CHECK ((auth.role() = ''service_role''::text));'),
      ('ai_suggestion_feedback', 'ai_suggestion_feedback_insert', 'CREATE POLICY "ai_suggestion_feedback_insert" ON public."ai_suggestion_feedback" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK (is_shop_member(shop_id));'),
      ('ai_suggestion_feedback', 'ai_suggestion_feedback_select', 'CREATE POLICY "ai_suggestion_feedback_select" ON public."ai_suggestion_feedback" AS PERMISSIVE FOR SELECT TO PUBLIC USING (is_shop_member(shop_id));'),
      ('ai_suggestion_feedback', 'ai_suggestion_feedback_update', 'CREATE POLICY "ai_suggestion_feedback_update" ON public."ai_suggestion_feedback" AS PERMISSIVE FOR UPDATE TO PUBLIC USING (is_shop_member(shop_id)) WITH CHECK (is_shop_member(shop_id));'),
      ('ai_training_data', 'ai_training_data_service_only', 'CREATE POLICY "ai_training_data_service_only" ON public."ai_training_data" AS PERMISSIVE FOR ALL TO "service_role" USING (true) WITH CHECK (true);'),
      ('assets', 'assets_all_member', 'CREATE POLICY "assets_all_member" ON public."assets" AS PERMISSIVE FOR ALL TO "authenticated" USING (user_is_in_shop(shop_id)) WITH CHECK (user_is_in_shop(shop_id));'),
      ('assistant_daily_summaries', 'assistant_daily_summaries_insert_same_shop', 'CREATE POLICY "assistant_daily_summaries_insert_same_shop" ON public."assistant_daily_summaries" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = assistant_daily_summaries.shop_id)))));'),
      ('assistant_daily_summaries', 'assistant_daily_summaries_select_same_shop', 'CREATE POLICY "assistant_daily_summaries_select_same_shop" ON public."assistant_daily_summaries" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = assistant_daily_summaries.shop_id)))));'),
      ('assistant_daily_summaries', 'assistant_daily_summaries_update_same_shop', 'CREATE POLICY "assistant_daily_summaries_update_same_shop" ON public."assistant_daily_summaries" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = assistant_daily_summaries.shop_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = assistant_daily_summaries.shop_id)))));'),
      ('content_assets', 'content_assets_delete_shop', 'CREATE POLICY "content_assets_delete_shop" ON public."content_assets" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((shop_id = current_shop_id()));'),
      ('content_assets', 'content_assets_insert_shop', 'CREATE POLICY "content_assets_insert_shop" ON public."content_assets" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((shop_id = current_shop_id()));'),
      ('content_assets', 'content_assets_select_shop', 'CREATE POLICY "content_assets_select_shop" ON public."content_assets" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((shop_id = current_shop_id()));'),
      ('content_assets', 'content_assets_update_shop', 'CREATE POLICY "content_assets_update_shop" ON public."content_assets" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((shop_id = current_shop_id())) WITH CHECK ((shop_id = current_shop_id()));'),
      ('content_events', 'content_events_delete_shop', 'CREATE POLICY "content_events_delete_shop" ON public."content_events" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((shop_id = current_shop_id()));'),
      ('content_events', 'content_events_insert_shop', 'CREATE POLICY "content_events_insert_shop" ON public."content_events" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((shop_id = current_shop_id()));'),
      ('content_events', 'content_events_select_shop', 'CREATE POLICY "content_events_select_shop" ON public."content_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((shop_id = current_shop_id()));'),
      ('content_events', 'content_events_update_shop', 'CREATE POLICY "content_events_update_shop" ON public."content_events" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((shop_id = current_shop_id())) WITH CHECK ((shop_id = current_shop_id()));'),
      ('content_pieces', 'content_pieces_delete_shop', 'CREATE POLICY "content_pieces_delete_shop" ON public."content_pieces" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((shop_id = current_shop_id()));'),
      ('content_pieces', 'content_pieces_insert_shop', 'CREATE POLICY "content_pieces_insert_shop" ON public."content_pieces" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((shop_id = current_shop_id()));'),
      ('content_pieces', 'content_pieces_select_shop', 'CREATE POLICY "content_pieces_select_shop" ON public."content_pieces" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((shop_id = current_shop_id()));'),
      ('content_pieces', 'content_pieces_update_shop', 'CREATE POLICY "content_pieces_update_shop" ON public."content_pieces" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((shop_id = current_shop_id())) WITH CHECK ((shop_id = current_shop_id()));'),
      ('content_platform_accounts', 'content_platform_accounts_delete_shop', 'CREATE POLICY "content_platform_accounts_delete_shop" ON public."content_platform_accounts" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((shop_id = current_shop_id()));'),
      ('content_platform_accounts', 'content_platform_accounts_insert_shop', 'CREATE POLICY "content_platform_accounts_insert_shop" ON public."content_platform_accounts" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((shop_id = current_shop_id()));'),
      ('content_platform_accounts', 'content_platform_accounts_select_shop', 'CREATE POLICY "content_platform_accounts_select_shop" ON public."content_platform_accounts" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((shop_id = current_shop_id()));'),
      ('content_platform_accounts', 'content_platform_accounts_update_shop', 'CREATE POLICY "content_platform_accounts_update_shop" ON public."content_platform_accounts" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((shop_id = current_shop_id())) WITH CHECK ((shop_id = current_shop_id()));'),
      ('content_publications', 'content_publications_delete_shop', 'CREATE POLICY "content_publications_delete_shop" ON public."content_publications" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((shop_id = current_shop_id()));'),
      ('content_publications', 'content_publications_insert_shop', 'CREATE POLICY "content_publications_insert_shop" ON public."content_publications" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((shop_id = current_shop_id()));'),
      ('content_publications', 'content_publications_select_shop', 'CREATE POLICY "content_publications_select_shop" ON public."content_publications" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((shop_id = current_shop_id()));'),
      ('content_publications', 'content_publications_update_shop', 'CREATE POLICY "content_publications_update_shop" ON public."content_publications" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((shop_id = current_shop_id())) WITH CHECK ((shop_id = current_shop_id()));'),
      ('content_templates', 'content_templates_all_member', 'CREATE POLICY "content_templates_all_member" ON public."content_templates" AS PERMISSIVE FOR ALL TO "authenticated" USING (user_is_in_shop(shop_id)) WITH CHECK (user_is_in_shop(shop_id));'),
      ('dashboard_layouts', 'dashboard_layouts_insert', 'CREATE POLICY "dashboard_layouts_insert" ON public."dashboard_layouts" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((shop_id = current_shop_id()) AND ((user_id IS NULL) OR (user_id = auth.uid()))));'),
      ('dashboard_layouts', 'dashboard_layouts_select', 'CREATE POLICY "dashboard_layouts_select" ON public."dashboard_layouts" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((shop_id = current_shop_id()) AND ((user_id IS NULL) OR (user_id = auth.uid()))));'),
      ('dashboard_layouts', 'dashboard_layouts_update', 'CREATE POLICY "dashboard_layouts_update" ON public."dashboard_layouts" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((shop_id = current_shop_id()) AND ((user_id IS NULL) OR (user_id = auth.uid())))) WITH CHECK (((shop_id = current_shop_id()) AND ((user_id IS NULL) OR (user_id = auth.uid()))));'),
      ('dashboard_user_layouts', 'dashboard layouts delete own', 'CREATE POLICY "dashboard layouts delete own" ON public."dashboard_user_layouts" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((auth.uid() = user_id));'),
      ('dashboard_user_layouts', 'dashboard layouts insert own', 'CREATE POLICY "dashboard layouts insert own" ON public."dashboard_user_layouts" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((auth.uid() = user_id));'),
      ('dashboard_user_layouts', 'dashboard layouts select own', 'CREATE POLICY "dashboard layouts select own" ON public."dashboard_user_layouts" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((auth.uid() = user_id));'),
      ('dashboard_user_layouts', 'dashboard layouts update own', 'CREATE POLICY "dashboard layouts update own" ON public."dashboard_user_layouts" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));'),
      ('expenses', 'expenses_modify_by_shop', 'CREATE POLICY "expenses_modify_by_shop" ON public."expenses" AS PERMISSIVE FOR ALL TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = expenses.shop_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = expenses.shop_id)))));'),
      ('expenses', 'expenses_select_by_shop', 'CREATE POLICY "expenses_select_by_shop" ON public."expenses" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = expenses.shop_id)))));'),
      ('fleet_dispatch_assignments', 'Fleet dispatch visible to driver', 'CREATE POLICY "Fleet dispatch visible to driver" ON public."fleet_dispatch_assignments" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((driver_profile_id = ( SELECT auth.uid() AS uid)));'),
      ('fleet_dispatch_assignments', 'fleet_dispatch_assignments.delete.management', 'CREATE POLICY "fleet_dispatch_assignments.delete.management" ON public."fleet_dispatch_assignments" AS PERMISSIVE FOR DELETE TO "authenticated" USING (((fleet_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM fleet_members m
  WHERE ((m.fleet_id = fleet_dispatch_assignments.fleet_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.role = ANY (ARRAY[''owner''::text, ''admin''::text, ''manager''::text, ''fleet_manager''::text, ''dispatcher''::text])))))));'),
      ('fleet_dispatch_assignments', 'fleet_dispatch_assignments.insert.management', 'CREATE POLICY "fleet_dispatch_assignments.insert.management" ON public."fleet_dispatch_assignments" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((fleet_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM fleet_members m
  WHERE ((m.fleet_id = fleet_dispatch_assignments.fleet_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.role = ANY (ARRAY[''owner''::text, ''admin''::text, ''manager''::text, ''fleet_manager''::text, ''dispatcher''::text])))))));'),
      ('fleet_dispatch_assignments', 'fleet_dispatch_assignments.select.member', 'CREATE POLICY "fleet_dispatch_assignments.select.member" ON public."fleet_dispatch_assignments" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((fleet_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM fleet_members m
  WHERE ((m.fleet_id = fleet_dispatch_assignments.fleet_id) AND (m.user_id = ( SELECT auth.uid() AS uid)))))));'),
      ('fleet_dispatch_assignments', 'fleet_dispatch_assignments.staff.same_shop_all', 'CREATE POLICY "fleet_dispatch_assignments.staff.same_shop_all" ON public."fleet_dispatch_assignments" AS PERMISSIVE FOR ALL TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = fleet_dispatch_assignments.shop_id) AND (p.role = ANY (ARRAY[''owner''::text, ''admin''::text, ''manager''::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = fleet_dispatch_assignments.shop_id) AND (p.role = ANY (ARRAY[''owner''::text, ''admin''::text, ''manager''::text]))))));'),
      ('fleet_dispatch_assignments', 'fleet_dispatch_assignments.update.management', 'CREATE POLICY "fleet_dispatch_assignments.update.management" ON public."fleet_dispatch_assignments" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((fleet_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM fleet_members m
  WHERE ((m.fleet_id = fleet_dispatch_assignments.fleet_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY[''owner''::text, ''admin''::text, ''manager''::text, ''fleet_manager''::text, ''dispatcher''::text]))))))) WITH CHECK (((fleet_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM fleet_members m
  WHERE ((m.fleet_id = fleet_dispatch_assignments.fleet_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY[''owner''::text, ''admin''::text, ''manager''::text, ''fleet_manager''::text, ''dispatcher''::text])))))));'),
      ('fleet_inspection_schedules', 'fleet_inspection_schedules.delete.management', 'CREATE POLICY "fleet_inspection_schedules.delete.management" ON public."fleet_inspection_schedules" AS PERMISSIVE FOR DELETE TO "authenticated" USING (((fleet_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM fleet_members m
  WHERE ((m.fleet_id = fleet_inspection_schedules.fleet_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.role = ANY (ARRAY[''owner''::text, ''admin''::text, ''manager''::text, ''fleet_manager''::text, ''dispatcher''::text])))))));'),
      ('fleet_inspection_schedules', 'fleet_inspection_schedules.insert.management', 'CREATE POLICY "fleet_inspection_schedules.insert.management" ON public."fleet_inspection_schedules" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((fleet_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM fleet_members m
  WHERE ((m.fleet_id = fleet_inspection_schedules.fleet_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.role = ANY (ARRAY[''owner''::text, ''admin''::text, ''manager''::text, ''fleet_manager''::text, ''dispatcher''::text])))))));'),
      ('fleet_inspection_schedules', 'fleet_inspection_schedules.select.member', 'CREATE POLICY "fleet_inspection_schedules.select.member" ON public."fleet_inspection_schedules" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((fleet_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM fleet_members m
  WHERE ((m.fleet_id = fleet_inspection_schedules.fleet_id) AND (m.user_id = ( SELECT auth.uid() AS uid)))))));'),
      ('fleet_inspection_schedules', 'fleet_inspection_schedules.staff.same_shop_all', 'CREATE POLICY "fleet_inspection_schedules.staff.same_shop_all" ON public."fleet_inspection_schedules" AS PERMISSIVE FOR ALL TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = fleet_inspection_schedules.shop_id) AND (p.role = ANY (ARRAY[''owner''::text, ''admin''::text, ''manager''::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = fleet_inspection_schedules.shop_id) AND (p.role = ANY (ARRAY[''owner''::text, ''admin''::text, ''manager''::text]))))));'),
      ('fleet_inspection_schedules', 'fleet_inspection_schedules.update.management', 'CREATE POLICY "fleet_inspection_schedules.update.management" ON public."fleet_inspection_schedules" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((fleet_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM fleet_members m
  WHERE ((m.fleet_id = fleet_inspection_schedules.fleet_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY[''owner''::text, ''admin''::text, ''manager''::text, ''fleet_manager''::text, ''dispatcher''::text]))))))) WITH CHECK (((fleet_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM fleet_members m
  WHERE ((m.fleet_id = fleet_inspection_schedules.fleet_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY[''owner''::text, ''admin''::text, ''manager''::text, ''fleet_manager''::text, ''dispatcher''::text])))))));'),
      ('fleet_pretrip_reports', 'fleet_pretrip_reports.delete.management', 'CREATE POLICY "fleet_pretrip_reports.delete.management" ON public."fleet_pretrip_reports" AS PERMISSIVE FOR DELETE TO "authenticated" USING (((fleet_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM fleet_members m
  WHERE ((m.fleet_id = fleet_pretrip_reports.fleet_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.role = ANY (ARRAY[''owner''::text, ''admin''::text, ''manager''::text, ''fleet_manager''::text, ''dispatcher''::text])))))));'),
      ('fleet_pretrip_reports', 'fleet_pretrip_reports.insert.member', 'CREATE POLICY "fleet_pretrip_reports.insert.member" ON public."fleet_pretrip_reports" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((fleet_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM fleet_members m
  WHERE ((m.fleet_id = fleet_pretrip_reports.fleet_id) AND (m.user_id = ( SELECT auth.uid() AS uid)))))));'),
      ('fleet_pretrip_reports', 'fleet_pretrip_reports.select.member', 'CREATE POLICY "fleet_pretrip_reports.select.member" ON public."fleet_pretrip_reports" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((fleet_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM fleet_members m
  WHERE ((m.fleet_id = fleet_pretrip_reports.fleet_id) AND (m.user_id = ( SELECT auth.uid() AS uid)))))));'),
      ('fleet_pretrip_reports', 'fleet_pretrip_reports.staff.same_shop_all', 'CREATE POLICY "fleet_pretrip_reports.staff.same_shop_all" ON public."fleet_pretrip_reports" AS PERMISSIVE FOR ALL TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = fleet_pretrip_reports.shop_id) AND (p.role = ANY (ARRAY[''owner''::text, ''admin''::text, ''manager''::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = fleet_pretrip_reports.shop_id) AND (p.role = ANY (ARRAY[''owner''::text, ''admin''::text, ''manager''::text]))))));'),
      ('fleet_pretrip_reports', 'fleet_pretrip_reports.update.management', 'CREATE POLICY "fleet_pretrip_reports.update.management" ON public."fleet_pretrip_reports" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((fleet_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM fleet_members m
  WHERE ((m.fleet_id = fleet_pretrip_reports.fleet_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY[''owner''::text, ''admin''::text, ''manager''::text, ''fleet_manager''::text, ''dispatcher''::text]))))))) WITH CHECK (((fleet_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM fleet_members m
  WHERE ((m.fleet_id = fleet_pretrip_reports.fleet_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY[''owner''::text, ''admin''::text, ''manager''::text, ''fleet_manager''::text, ''dispatcher''::text])))))));'),
      ('fleet_program_tasks', 'fleet_program_tasks__program_shop_all', 'CREATE POLICY "fleet_program_tasks__program_shop_all" ON public."fleet_program_tasks" AS PERMISSIVE FOR ALL TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM (fleet_programs fp
     JOIN fleets f ON ((f.id = fp.fleet_id)))
  WHERE ((fp.id = fleet_program_tasks.program_id) AND is_shop_member_v2(f.shop_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (fleet_programs fp
     JOIN fleets f ON ((f.id = fp.fleet_id)))
  WHERE ((fp.id = fleet_program_tasks.program_id) AND is_shop_member_v2(f.shop_id)))));'),
      ('fleet_programs', 'fleet_programs__fleet_shop_all', 'CREATE POLICY "fleet_programs__fleet_shop_all" ON public."fleet_programs" AS PERMISSIVE FOR ALL TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM fleets f
  WHERE ((f.id = fleet_programs.fleet_id) AND is_shop_member_v2(f.shop_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM fleets f
  WHERE ((f.id = fleet_programs.fleet_id) AND is_shop_member_v2(f.shop_id)))));'),
      ('fleet_service_requests', 'fleet_service_requests.delete.management', 'CREATE POLICY "fleet_service_requests.delete.management" ON public."fleet_service_requests" AS PERMISSIVE FOR DELETE TO "authenticated" USING (((fleet_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM fleet_members m
  WHERE ((m.fleet_id = fleet_service_requests.fleet_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.role = ANY (ARRAY[''owner''::text, ''admin''::text, ''manager''::text, ''fleet_manager''::text, ''dispatcher''::text])))))));'),
      ('fleet_service_requests', 'fleet_service_requests.insert.management', 'CREATE POLICY "fleet_service_requests.insert.management" ON public."fleet_service_requests" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((fleet_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM fleet_members m
  WHERE ((m.fleet_id = fleet_service_requests.fleet_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.role = ANY (ARRAY[''owner''::text, ''admin''::text, ''manager''::text, ''fleet_manager''::text, ''dispatcher''::text])))))));'),
      ('fleet_service_requests', 'fleet_service_requests.select.member', 'CREATE POLICY "fleet_service_requests.select.member" ON public."fleet_service_requests" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((fleet_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM fleet_members m
  WHERE ((m.fleet_id = fleet_service_requests.fleet_id) AND (m.user_id = ( SELECT auth.uid() AS uid)))))));'),
      ('fleet_service_requests', 'fleet_service_requests.staff.same_shop_all', 'CREATE POLICY "fleet_service_requests.staff.same_shop_all" ON public."fleet_service_requests" AS PERMISSIVE FOR ALL TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = fleet_service_requests.shop_id) AND (p.role = ANY (ARRAY[''owner''::text, ''admin''::text, ''manager''::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = fleet_service_requests.shop_id) AND (p.role = ANY (ARRAY[''owner''::text, ''admin''::text, ''manager''::text]))))));'),
      ('fleet_service_requests', 'fleet_service_requests.update.management', 'CREATE POLICY "fleet_service_requests.update.management" ON public."fleet_service_requests" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((fleet_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM fleet_members m
  WHERE ((m.fleet_id = fleet_service_requests.fleet_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY[''owner''::text, ''admin''::text, ''manager''::text, ''fleet_manager''::text, ''dispatcher''::text]))))))) WITH CHECK (((fleet_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM fleet_members m
  WHERE ((m.fleet_id = fleet_service_requests.fleet_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY[''owner''::text, ''admin''::text, ''manager''::text, ''fleet_manager''::text, ''dispatcher''::text])))))));'),
      ('fleet_vehicles', 'fleet_vehicles.management.all', 'CREATE POLICY "fleet_vehicles.management.all" ON public."fleet_vehicles" AS PERMISSIVE FOR ALL TO "authenticated" USING (((fleet_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM fleet_members m
  WHERE ((m.fleet_id = fleet_vehicles.fleet_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY[''owner''::text, ''admin''::text, ''manager''::text, ''fleet_manager''::text, ''dispatcher''::text]))))))) WITH CHECK (((fleet_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM fleet_members m
  WHERE ((m.fleet_id = fleet_vehicles.fleet_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY[''owner''::text, ''admin''::text, ''manager''::text, ''fleet_manager''::text, ''dispatcher''::text])))))));'),
      ('fleet_vehicles', 'fleet_vehicles.select.member', 'CREATE POLICY "fleet_vehicles.select.member" ON public."fleet_vehicles" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((fleet_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM fleet_members m
  WHERE ((m.fleet_id = fleet_vehicles.fleet_id) AND (m.user_id = auth.uid()))))));'),
      ('fleet_vehicles', 'fleet_vehicles.staff.same_shop_all', 'CREATE POLICY "fleet_vehicles.staff.same_shop_all" ON public."fleet_vehicles" AS PERMISSIVE FOR ALL TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = fleet_vehicles.shop_id) AND (p.role = ANY (ARRAY[''owner''::text, ''admin''::text, ''manager''::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = fleet_vehicles.shop_id) AND (p.role = ANY (ARRAY[''owner''::text, ''admin''::text, ''manager''::text]))))));'),
      ('guided_onboarding_events', 'guided_onboarding_events_shop_insert', 'CREATE POLICY "guided_onboarding_events_shop_insert" ON public."guided_onboarding_events" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((shop_id = current_shop_id()) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = guided_onboarding_events.shop_id) AND (lower(COALESCE(p.role, ''''::text)) = ANY (ARRAY[''owner''::text, ''admin''::text])))))));'),
      ('guided_onboarding_events', 'guided_onboarding_events_shop_select', 'CREATE POLICY "guided_onboarding_events_shop_select" ON public."guided_onboarding_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((shop_id = current_shop_id()) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = guided_onboarding_events.shop_id) AND (lower(COALESCE(p.role, ''''::text)) = ANY (ARRAY[''owner''::text, ''admin''::text])))))));'),
      ('guided_onboarding_events', 'guided_onboarding_owner_admin_insert_guided_onboarding_events', 'CREATE POLICY "guided_onboarding_owner_admin_insert_guided_onboarding_events" ON public."guided_onboarding_events" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((shop_id = current_shop_id()) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = guided_onboarding_events.shop_id) AND (lower(COALESCE(p.role, ''''::text)) = ANY (ARRAY[''owner''::text, ''admin''::text])))))));'),
      ('guided_onboarding_events', 'guided_onboarding_owner_admin_select_guided_onboarding_events', 'CREATE POLICY "guided_onboarding_owner_admin_select_guided_onboarding_events" ON public."guided_onboarding_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((shop_id = current_shop_id()) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = guided_onboarding_events.shop_id) AND (lower(COALESCE(p.role, ''''::text)) = ANY (ARRAY[''owner''::text, ''admin''::text])))))));'),
      ('guided_onboarding_events', 'guided_onboarding_owner_admin_update_guided_onboarding_events', 'CREATE POLICY "guided_onboarding_owner_admin_update_guided_onboarding_events" ON public."guided_onboarding_events" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((shop_id = current_shop_id()) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = guided_onboarding_events.shop_id) AND (lower(COALESCE(p.role, ''''::text)) = ANY (ARRAY[''owner''::text, ''admin''::text]))))))) WITH CHECK (((shop_id = current_shop_id()) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = guided_onboarding_events.shop_id) AND (lower(COALESCE(p.role, ''''::text)) = ANY (ARRAY[''owner''::text, ''admin''::text])))))));'),
      ('guided_onboarding_events', 'service_role_manage_guided_onboarding_events', 'CREATE POLICY "service_role_manage_guided_onboarding_events" ON public."guided_onboarding_events" AS PERMISSIVE FOR ALL TO "service_role" USING ((auth.role() = ''service_role''::text)) WITH CHECK ((auth.role() = ''service_role''::text));'),
      ('guided_onboarding_sessions', 'guided_onboarding_owner_admin_insert_guided_onboarding_sessions', 'CREATE POLICY "guided_onboarding_owner_admin_insert_guided_onboarding_sessions" ON public."guided_onboarding_sessions" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((shop_id = current_shop_id()) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = guided_onboarding_sessions.shop_id) AND (lower(COALESCE(p.role, ''''::text)) = ANY (ARRAY[''owner''::text, ''admin''::text])))))));'),
      ('guided_onboarding_sessions', 'guided_onboarding_owner_admin_select_guided_onboarding_sessions', 'CREATE POLICY "guided_onboarding_owner_admin_select_guided_onboarding_sessions" ON public."guided_onboarding_sessions" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((shop_id = current_shop_id()) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = guided_onboarding_sessions.shop_id) AND (lower(COALESCE(p.role, ''''::text)) = ANY (ARRAY[''owner''::text, ''admin''::text])))))));'),
      ('guided_onboarding_sessions', 'guided_onboarding_owner_admin_update_guided_onboarding_sessions', 'CREATE POLICY "guided_onboarding_owner_admin_update_guided_onboarding_sessions" ON public."guided_onboarding_sessions" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((shop_id = current_shop_id()) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = guided_onboarding_sessions.shop_id) AND (lower(COALESCE(p.role, ''''::text)) = ANY (ARRAY[''owner''::text, ''admin''::text]))))))) WITH CHECK (((shop_id = current_shop_id()) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = guided_onboarding_sessions.shop_id) AND (lower(COALESCE(p.role, ''''::text)) = ANY (ARRAY[''owner''::text, ''admin''::text])))))));'),
      ('guided_onboarding_sessions', 'guided_onboarding_sessions_shop_insert', 'CREATE POLICY "guided_onboarding_sessions_shop_insert" ON public."guided_onboarding_sessions" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((shop_id = current_shop_id()) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = guided_onboarding_sessions.shop_id) AND (lower(COALESCE(p.role, ''''::text)) = ANY (ARRAY[''owner''::text, ''admin''::text])))))));'),
      ('guided_onboarding_sessions', 'guided_onboarding_sessions_shop_select', 'CREATE POLICY "guided_onboarding_sessions_shop_select" ON public."guided_onboarding_sessions" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((shop_id = current_shop_id()) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = guided_onboarding_sessions.shop_id) AND (lower(COALESCE(p.role, ''''::text)) = ANY (ARRAY[''owner''::text, ''admin''::text])))))));'),
      ('guided_onboarding_sessions', 'guided_onboarding_sessions_shop_update', 'CREATE POLICY "guided_onboarding_sessions_shop_update" ON public."guided_onboarding_sessions" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((shop_id = current_shop_id()) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = guided_onboarding_sessions.shop_id) AND (lower(COALESCE(p.role, ''''::text)) = ANY (ARRAY[''owner''::text, ''admin''::text]))))))) WITH CHECK (((shop_id = current_shop_id()) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = guided_onboarding_sessions.shop_id) AND (lower(COALESCE(p.role, ''''::text)) = ANY (ARRAY[''owner''::text, ''admin''::text])))))));'),
      ('guided_onboarding_sessions', 'service_role_manage_guided_onboarding_sessions', 'CREATE POLICY "service_role_manage_guided_onboarding_sessions" ON public."guided_onboarding_sessions" AS PERMISSIVE FOR ALL TO "service_role" USING ((auth.role() = ''service_role''::text)) WITH CHECK ((auth.role() = ''service_role''::text));'),
      ('guided_onboarding_steps', 'guided_onboarding_owner_admin_insert_guided_onboarding_steps', 'CREATE POLICY "guided_onboarding_owner_admin_insert_guided_onboarding_steps" ON public."guided_onboarding_steps" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((shop_id = current_shop_id()) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = guided_onboarding_steps.shop_id) AND (lower(COALESCE(p.role, ''''::text)) = ANY (ARRAY[''owner''::text, ''admin''::text])))))));'),
      ('guided_onboarding_steps', 'guided_onboarding_owner_admin_select_guided_onboarding_steps', 'CREATE POLICY "guided_onboarding_owner_admin_select_guided_onboarding_steps" ON public."guided_onboarding_steps" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((shop_id = current_shop_id()) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = guided_onboarding_steps.shop_id) AND (lower(COALESCE(p.role, ''''::text)) = ANY (ARRAY[''owner''::text, ''admin''::text])))))));'),
      ('guided_onboarding_steps', 'guided_onboarding_owner_admin_update_guided_onboarding_steps', 'CREATE POLICY "guided_onboarding_owner_admin_update_guided_onboarding_steps" ON public."guided_onboarding_steps" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((shop_id = current_shop_id()) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = guided_onboarding_steps.shop_id) AND (lower(COALESCE(p.role, ''''::text)) = ANY (ARRAY[''owner''::text, ''admin''::text]))))))) WITH CHECK (((shop_id = current_shop_id()) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = guided_onboarding_steps.shop_id) AND (lower(COALESCE(p.role, ''''::text)) = ANY (ARRAY[''owner''::text, ''admin''::text])))))));'),
      ('guided_onboarding_steps', 'guided_onboarding_steps_shop_insert', 'CREATE POLICY "guided_onboarding_steps_shop_insert" ON public."guided_onboarding_steps" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((shop_id = current_shop_id()) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = guided_onboarding_steps.shop_id) AND (lower(COALESCE(p.role, ''''::text)) = ANY (ARRAY[''owner''::text, ''admin''::text])))))));'),
      ('guided_onboarding_steps', 'guided_onboarding_steps_shop_select', 'CREATE POLICY "guided_onboarding_steps_shop_select" ON public."guided_onboarding_steps" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((shop_id = current_shop_id()) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = guided_onboarding_steps.shop_id) AND (lower(COALESCE(p.role, ''''::text)) = ANY (ARRAY[''owner''::text, ''admin''::text])))))));'),
      ('guided_onboarding_steps', 'guided_onboarding_steps_shop_update', 'CREATE POLICY "guided_onboarding_steps_shop_update" ON public."guided_onboarding_steps" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((shop_id = current_shop_id()) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = guided_onboarding_steps.shop_id) AND (lower(COALESCE(p.role, ''''::text)) = ANY (ARRAY[''owner''::text, ''admin''::text]))))))) WITH CHECK (((shop_id = current_shop_id()) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = guided_onboarding_steps.shop_id) AND (lower(COALESCE(p.role, ''''::text)) = ANY (ARRAY[''owner''::text, ''admin''::text])))))));'),
      ('guided_onboarding_steps', 'service_role_manage_guided_onboarding_steps', 'CREATE POLICY "service_role_manage_guided_onboarding_steps" ON public."guided_onboarding_steps" AS PERMISSIVE FOR ALL TO "service_role" USING ((auth.role() = ''service_role''::text)) WITH CHECK ((auth.role() = ''service_role''::text));'),
      ('inspection_result_items', 'result_items_same_shop_ro', 'CREATE POLICY "result_items_same_shop_ro" ON public."inspection_result_items" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM (((inspection_results r
     JOIN inspection_sessions s ON ((s.id = r.session_id)))
     JOIN work_orders w ON ((w.id = s.work_order_id)))
     JOIN profiles p ON ((p.id = auth.uid())))
  WHERE ((r.id = inspection_result_items.result_id) AND (p.shop_id = w.shop_id)))));'),
      ('inspection_result_items', 'result_items_same_shop_rw', 'CREATE POLICY "result_items_same_shop_rw" ON public."inspection_result_items" AS PERMISSIVE FOR ALL TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM (((inspection_results r
     JOIN inspection_sessions s ON ((s.id = r.session_id)))
     JOIN work_orders w ON ((w.id = s.work_order_id)))
     JOIN profiles p ON ((p.id = auth.uid())))
  WHERE ((r.id = inspection_result_items.result_id) AND (p.shop_id = w.shop_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (((inspection_results r
     JOIN inspection_sessions s ON ((s.id = r.session_id)))
     JOIN work_orders w ON ((w.id = s.work_order_id)))
     JOIN profiles p ON ((p.id = auth.uid())))
  WHERE ((r.id = inspection_result_items.result_id) AND (p.shop_id = w.shop_id)))));'),
      ('inspection_results', 'results_same_shop_rw', 'CREATE POLICY "results_same_shop_rw" ON public."inspection_results" AS PERMISSIVE FOR ALL TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ((inspection_sessions s
     JOIN work_orders w ON ((w.id = s.work_order_id)))
     JOIN profiles p ON ((p.id = auth.uid())))
  WHERE ((s.id = inspection_results.session_id) AND (p.shop_id = w.shop_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ((inspection_sessions s
     JOIN work_orders w ON ((w.id = s.work_order_id)))
     JOIN profiles p ON ((p.id = auth.uid())))
  WHERE ((s.id = inspection_results.session_id) AND (p.shop_id = w.shop_id)))));'),
      ('inspection_smart_match_feedback', 'inspection_smart_match_feedback_insert', 'CREATE POLICY "inspection_smart_match_feedback_insert" ON public."inspection_smart_match_feedback" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (is_shop_member(shop_id));'),
      ('inspection_smart_match_feedback', 'inspection_smart_match_feedback_select', 'CREATE POLICY "inspection_smart_match_feedback_select" ON public."inspection_smart_match_feedback" AS PERMISSIVE FOR SELECT TO "authenticated" USING (is_shop_member(shop_id));'),
      ('inspection_smart_match_history', 'inspection_smart_match_history_delete_shop', 'CREATE POLICY "inspection_smart_match_history_delete_shop" ON public."inspection_smart_match_history" AS PERMISSIVE FOR DELETE TO PUBLIC USING ((shop_id = current_shop_id()));'),
      ('inspection_smart_match_history', 'inspection_smart_match_history_insert_shop', 'CREATE POLICY "inspection_smart_match_history_insert_shop" ON public."inspection_smart_match_history" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((shop_id = current_shop_id()));'),
      ('inspection_smart_match_history', 'inspection_smart_match_history_select_shop', 'CREATE POLICY "inspection_smart_match_history_select_shop" ON public."inspection_smart_match_history" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((shop_id = current_shop_id()));'),
      ('inspection_smart_match_history', 'inspection_smart_match_history_update_shop', 'CREATE POLICY "inspection_smart_match_history_update_shop" ON public."inspection_smart_match_history" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((shop_id = current_shop_id())) WITH CHECK ((shop_id = current_shop_id()));'),
      ('inspection_template_suggestions', 'service-role-manage-inspection-template-suggestions', 'CREATE POLICY "service-role-manage-inspection-template-suggestions" ON public."inspection_template_suggestions" AS PERMISSIVE FOR ALL TO "service_role" USING ((auth.role() = ''service_role''::text)) WITH CHECK ((auth.role() = ''service_role''::text));'),
      ('inspection_template_suggestions', 'shop-users-read-inspection-template-suggestions', 'CREATE POLICY "shop-users-read-inspection-template-suggestions" ON public."inspection_template_suggestions" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = inspection_template_suggestions.shop_id)))));'),
      ('invoice_documents', 'invoice_documents_delete', 'CREATE POLICY "invoice_documents_delete" ON public."invoice_documents" AS PERMISSIVE FOR DELETE TO "authenticated" USING (is_shop_member_v2(shop_id));'),
      ('invoice_documents', 'invoice_documents_select', 'CREATE POLICY "invoice_documents_select" ON public."invoice_documents" AS PERMISSIVE FOR SELECT TO "authenticated" USING (is_shop_member_v2(shop_id));'),
      ('invoice_documents', 'invoice_documents_update', 'CREATE POLICY "invoice_documents_update" ON public."invoice_documents" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (is_shop_member_v2(shop_id)) WITH CHECK (is_shop_member_v2(shop_id));'),
      ('invoice_documents', 'invoice_documents_write', 'CREATE POLICY "invoice_documents_write" ON public."invoice_documents" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (is_shop_member_v2(shop_id));'),
      ('maintenance_rules', 'maintenance_rules_read', 'CREATE POLICY "maintenance_rules_read" ON public."maintenance_rules" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);'),
      ('maintenance_services', 'maintenance_services_read', 'CREATE POLICY "maintenance_services_read" ON public."maintenance_services" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);'),
      ('maintenance_suggestions', 'maint_suggestions_rw', 'CREATE POLICY "maint_suggestions_rw" ON public."maintenance_suggestions" AS PERMISSIVE FOR ALL TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM work_orders w
  WHERE ((w.id = maintenance_suggestions.work_order_id) AND is_shop_member_v2(w.shop_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM work_orders w
  WHERE ((w.id = maintenance_suggestions.work_order_id) AND is_shop_member_v2(w.shop_id)))));'),
      ('menu_item_suggestions', 'service-role-manage-menu-item-suggestions', 'CREATE POLICY "service-role-manage-menu-item-suggestions" ON public."menu_item_suggestions" AS PERMISSIVE FOR ALL TO "service_role" USING ((auth.role() = ''service_role''::text)) WITH CHECK ((auth.role() = ''service_role''::text));'),
      ('menu_item_suggestions', 'shop-users-read-menu-item-suggestions', 'CREATE POLICY "shop-users-read-menu-item-suggestions" ON public."menu_item_suggestions" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = menu_item_suggestions.shop_id)))));'),
      ('menu_repair_item_parts', 'menu_repair_item_parts_delete_shop', 'CREATE POLICY "menu_repair_item_parts_delete_shop" ON public."menu_repair_item_parts" AS PERMISSIVE FOR DELETE TO PUBLIC USING ((shop_id = current_shop_id()));'),
      ('menu_repair_item_parts', 'menu_repair_item_parts_insert_shop', 'CREATE POLICY "menu_repair_item_parts_insert_shop" ON public."menu_repair_item_parts" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((shop_id = current_shop_id()));'),
      ('menu_repair_item_parts', 'menu_repair_item_parts_select_shop', 'CREATE POLICY "menu_repair_item_parts_select_shop" ON public."menu_repair_item_parts" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((shop_id = current_shop_id()));'),
      ('menu_repair_item_parts', 'menu_repair_item_parts_update_shop', 'CREATE POLICY "menu_repair_item_parts_update_shop" ON public."menu_repair_item_parts" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((shop_id = current_shop_id())) WITH CHECK ((shop_id = current_shop_id()));'),
      ('menu_repair_item_pricing_parts', 'menu_repair_item_pricing_parts_deny_all', 'CREATE POLICY "menu_repair_item_pricing_parts_deny_all" ON public."menu_repair_item_pricing_parts" AS PERMISSIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);'),
      ('menu_repair_item_pricing_snapshots', 'menu_repair_item_pricing_snapshots_delete_shop', 'CREATE POLICY "menu_repair_item_pricing_snapshots_delete_shop" ON public."menu_repair_item_pricing_snapshots" AS PERMISSIVE FOR DELETE TO PUBLIC USING ((shop_id = current_shop_id()));'),
      ('menu_repair_item_pricing_snapshots', 'menu_repair_item_pricing_snapshots_insert_shop', 'CREATE POLICY "menu_repair_item_pricing_snapshots_insert_shop" ON public."menu_repair_item_pricing_snapshots" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((shop_id = current_shop_id()));'),
      ('menu_repair_item_pricing_snapshots', 'menu_repair_item_pricing_snapshots_select_shop', 'CREATE POLICY "menu_repair_item_pricing_snapshots_select_shop" ON public."menu_repair_item_pricing_snapshots" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((shop_id = current_shop_id()));'),
      ('menu_repair_item_pricing_snapshots', 'menu_repair_item_pricing_snapshots_update_shop', 'CREATE POLICY "menu_repair_item_pricing_snapshots_update_shop" ON public."menu_repair_item_pricing_snapshots" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((shop_id = current_shop_id())) WITH CHECK ((shop_id = current_shop_id()));'),
      ('menu_repair_items', 'menu_repair_items_delete', 'CREATE POLICY "menu_repair_items_delete" ON public."menu_repair_items" AS PERMISSIVE FOR DELETE TO "authenticated" USING (is_shop_member(shop_id));'),
      ('menu_repair_items', 'menu_repair_items_insert', 'CREATE POLICY "menu_repair_items_insert" ON public."menu_repair_items" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (is_shop_member(shop_id));'),
      ('menu_repair_items', 'menu_repair_items_select', 'CREATE POLICY "menu_repair_items_select" ON public."menu_repair_items" AS PERMISSIVE FOR SELECT TO "authenticated" USING (is_shop_member(shop_id));'),
      ('menu_repair_items', 'menu_repair_items_update', 'CREATE POLICY "menu_repair_items_update" ON public."menu_repair_items" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (is_shop_member(shop_id)) WITH CHECK (is_shop_member(shop_id));'),
      ('optimization_actions', 'optimization_actions_insert', 'CREATE POLICY "optimization_actions_insert" ON public."optimization_actions" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((shop_id = current_shop_id()) AND ((created_by IS NULL) OR (created_by = auth.uid()))));'),
      ('optimization_actions', 'optimization_actions_select', 'CREATE POLICY "optimization_actions_select" ON public."optimization_actions" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((shop_id = current_shop_id()));'),
      ('optimization_actions', 'optimization_actions_update', 'CREATE POLICY "optimization_actions_update" ON public."optimization_actions" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((shop_id = current_shop_id())) WITH CHECK ((shop_id = current_shop_id()));'),
      ('org_members', 'org_members_select_self', 'CREATE POLICY "org_members_select_self" ON public."org_members" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((user_id = auth.uid()));'),
      ('organizations', 'organizations_select_by_membership', 'CREATE POLICY "organizations_select_by_membership" ON public."organizations" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM org_members om
  WHERE ((om.org_id = organizations.id) AND (om.user_id = auth.uid())))));'),
      ('payroll_timecards', 'timecards_manager_select', 'CREATE POLICY "timecards_manager_select" ON public."payroll_timecards" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = p.shop_id) AND (p.role = ANY (ARRAY[''owner''::text, ''admin''::text, ''manager''::text]))))));'),
      ('payroll_timecards', 'timecards_own_select', 'CREATE POLICY "timecards_own_select" ON public."payroll_timecards" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.id = p.user_id) AND (p.shop_id = p.shop_id)))));'),
      ('people_workforce_profiles', 'people_workforce_profiles_shop_all', 'CREATE POLICY "people_workforce_profiles_shop_all" ON public."people_workforce_profiles" AS PERMISSIVE FOR ALL TO "authenticated" USING ((shop_id = current_shop_id())) WITH CHECK ((shop_id = current_shop_id()));'),
      ('planner_events', 'planner_events_insert', 'CREATE POLICY "planner_events_insert" ON public."planner_events" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM planner_runs r
  WHERE ((r.id = planner_events.run_id) AND (r.shop_id = ( SELECT profiles.shop_id
           FROM profiles
          WHERE (profiles.id = auth.uid()))) AND (r.user_id = auth.uid())))));'),
      ('planner_events', 'planner_events_select', 'CREATE POLICY "planner_events_select" ON public."planner_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM planner_runs r
  WHERE ((r.id = planner_events.run_id) AND (r.shop_id = ( SELECT profiles.shop_id
           FROM profiles
          WHERE (profiles.id = auth.uid())))))));'),
      ('planner_runs', 'planner_runs_insert', 'CREATE POLICY "planner_runs_insert" ON public."planner_runs" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((shop_id = ( SELECT profiles.shop_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (user_id = auth.uid())));'),
      ('planner_runs', 'planner_runs_select', 'CREATE POLICY "planner_runs_select" ON public."planner_runs" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((shop_id = ( SELECT profiles.shop_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));'),
      ('planner_runs', 'planner_runs_update', 'CREATE POLICY "planner_runs_update" ON public."planner_runs" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((shop_id = ( SELECT profiles.shop_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (user_id = auth.uid()))) WITH CHECK (((shop_id = ( SELECT profiles.shop_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (user_id = auth.uid())));'),
      ('property_assets', 'property_assets_internal_staff_delete', 'CREATE POLICY "property_assets_internal_staff_delete" ON public."property_assets" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = property_assets.shop_id)))));'),
      ('property_assets', 'property_assets_internal_staff_insert', 'CREATE POLICY "property_assets_internal_staff_insert" ON public."property_assets" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = property_assets.shop_id)))));'),
      ('property_assets', 'property_assets_internal_staff_select', 'CREATE POLICY "property_assets_internal_staff_select" ON public."property_assets" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = property_assets.shop_id)))));'),
      ('property_assets', 'property_assets_internal_staff_update', 'CREATE POLICY "property_assets_internal_staff_update" ON public."property_assets" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = property_assets.shop_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = property_assets.shop_id)))));'),
      ('property_assets', 'property_assets_member_select', 'CREATE POLICY "property_assets_member_select" ON public."property_assets" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM (property_members pm
     JOIN property_properties pp ON ((pp.id = property_assets.property_id)))
  WHERE ((pm.user_id = auth.uid()) AND (pm.shop_id = property_assets.shop_id) AND ((pm.unit_id = property_assets.unit_id) OR (pm.property_id = property_assets.property_id) OR ((pm.portfolio_id IS NOT NULL) AND (pm.portfolio_id = pp.portfolio_id)))))));'),
      ('property_inspection_signatures', 'Internal staff can delete property inspection signatures', 'CREATE POLICY "Internal staff can delete property inspection signatures" ON public."property_inspection_signatures" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = property_inspection_signatures.shop_id)))));'),
      ('property_inspection_signatures', 'Internal staff can insert property inspection signatures', 'CREATE POLICY "Internal staff can insert property inspection signatures" ON public."property_inspection_signatures" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = property_inspection_signatures.shop_id)))));'),
      ('property_inspection_signatures', 'Internal staff can select property inspection signatures', 'CREATE POLICY "Internal staff can select property inspection signatures" ON public."property_inspection_signatures" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = property_inspection_signatures.shop_id)))));'),
      ('property_inspection_signatures', 'Internal staff can update property inspection signatures', 'CREATE POLICY "Internal staff can update property inspection signatures" ON public."property_inspection_signatures" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = property_inspection_signatures.shop_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = property_inspection_signatures.shop_id)))));'),
      ('property_inspection_signatures', 'Property members can insert own scoped property inspection sign', 'CREATE POLICY "Property members can insert own scoped property inspection sign" ON public."property_inspection_signatures" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((signer_profile_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM (property_inspections pi
     JOIN property_members pm ON ((pm.shop_id = pi.shop_id)))
  WHERE ((pi.id = property_inspection_signatures.inspection_id) AND (pi.shop_id = property_inspection_signatures.shop_id) AND (pm.user_id = auth.uid()) AND (pm.shop_id = property_inspection_signatures.shop_id) AND ((pm.unit_id = pi.unit_id) OR (pm.property_id = pi.property_id) OR ((pm.portfolio_id IS NOT NULL) AND (EXISTS ( SELECT 1
           FROM property_properties pp
          WHERE ((pp.id = pi.property_id) AND (pp.portfolio_id = pm.portfolio_id)))))))))));'),
      ('property_inspection_signatures', 'Property members can select scoped property inspection signatur', 'CREATE POLICY "Property members can select scoped property inspection signatur" ON public."property_inspection_signatures" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM (property_inspections pi
     JOIN property_members pm ON ((pm.shop_id = pi.shop_id)))
  WHERE ((pi.id = property_inspection_signatures.inspection_id) AND (pi.shop_id = property_inspection_signatures.shop_id) AND (pm.user_id = auth.uid()) AND (pm.shop_id = property_inspection_signatures.shop_id) AND ((pm.unit_id = pi.unit_id) OR (pm.property_id = pi.property_id) OR ((pm.portfolio_id IS NOT NULL) AND (EXISTS ( SELECT 1
           FROM property_properties pp
          WHERE ((pp.id = pi.property_id) AND (pp.portfolio_id = pm.portfolio_id))))))))));'),
      ('property_inspections', 'property_inspections_internal_staff_delete', 'CREATE POLICY "property_inspections_internal_staff_delete" ON public."property_inspections" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = property_inspections.shop_id)))));'),
      ('property_inspections', 'property_inspections_internal_staff_insert', 'CREATE POLICY "property_inspections_internal_staff_insert" ON public."property_inspections" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = property_inspections.shop_id)))));'),
      ('property_inspections', 'property_inspections_internal_staff_select', 'CREATE POLICY "property_inspections_internal_staff_select" ON public."property_inspections" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = property_inspections.shop_id)))));'),
      ('property_inspections', 'property_inspections_internal_staff_update', 'CREATE POLICY "property_inspections_internal_staff_update" ON public."property_inspections" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = property_inspections.shop_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = property_inspections.shop_id)))));'),
      ('property_inspections', 'property_inspections_member_select', 'CREATE POLICY "property_inspections_member_select" ON public."property_inspections" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM (property_members pm
     JOIN property_properties pp ON ((pp.id = property_inspections.property_id)))
  WHERE ((pm.user_id = auth.uid()) AND (pm.shop_id = property_inspections.shop_id) AND ((pm.unit_id = property_inspections.unit_id) OR (pm.property_id = property_inspections.property_id) OR ((pm.portfolio_id IS NOT NULL) AND (pm.portfolio_id = pp.portfolio_id)))))));'),
      ('property_maintenance_requests', 'property_maintenance_requests_internal_staff_delete', 'CREATE POLICY "property_maintenance_requests_internal_staff_delete" ON public."property_maintenance_requests" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = property_maintenance_requests.shop_id)))));'),
      ('property_maintenance_requests', 'property_maintenance_requests_internal_staff_insert', 'CREATE POLICY "property_maintenance_requests_internal_staff_insert" ON public."property_maintenance_requests" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = property_maintenance_requests.shop_id)))));'),
      ('property_maintenance_requests', 'property_maintenance_requests_internal_staff_select', 'CREATE POLICY "property_maintenance_requests_internal_staff_select" ON public."property_maintenance_requests" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = property_maintenance_requests.shop_id)))));'),
      ('property_maintenance_requests', 'property_maintenance_requests_internal_staff_update', 'CREATE POLICY "property_maintenance_requests_internal_staff_update" ON public."property_maintenance_requests" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = property_maintenance_requests.shop_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = property_maintenance_requests.shop_id)))));'),
      ('property_maintenance_requests', 'property_maintenance_requests_member_select', 'CREATE POLICY "property_maintenance_requests_member_select" ON public."property_maintenance_requests" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM (property_members pm
     JOIN property_properties pp ON ((pp.id = property_maintenance_requests.property_id)))
  WHERE ((pm.user_id = auth.uid()) AND (pm.shop_id = property_maintenance_requests.shop_id) AND ((pm.unit_id = property_maintenance_requests.unit_id) OR (pm.property_id = property_maintenance_requests.property_id) OR ((pm.portfolio_id IS NOT NULL) AND (pm.portfolio_id = pp.portfolio_id)))))));'),
      ('property_maintenance_requests', 'property_maintenance_requests_tenant_requester_insert', 'CREATE POLICY "property_maintenance_requests_tenant_requester_insert" ON public."property_maintenance_requests" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((((requester_profile_id IS NULL) OR (requester_profile_id = auth.uid())) AND (EXISTS ( SELECT 1
   FROM (property_members pm
     JOIN property_properties pp ON ((pp.id = property_maintenance_requests.property_id)))
  WHERE ((pm.user_id = auth.uid()) AND (pm.shop_id = property_maintenance_requests.shop_id) AND (pm.role = ''tenant_requester''::text) AND ((pm.unit_id = property_maintenance_requests.unit_id) OR ((pm.unit_id IS NULL) AND (pm.property_id = property_maintenance_requests.property_id)) OR ((pm.unit_id IS NULL) AND (pm.property_id IS NULL) AND (pm.portfolio_id = pp.portfolio_id))))))));'),
      ('property_members', 'property_members_internal_staff_delete', 'CREATE POLICY "property_members_internal_staff_delete" ON public."property_members" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = property_members.shop_id)))));'),
      ('property_members', 'property_members_internal_staff_insert', 'CREATE POLICY "property_members_internal_staff_insert" ON public."property_members" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = property_members.shop_id)))));'),
      ('property_members', 'property_members_internal_staff_select', 'CREATE POLICY "property_members_internal_staff_select" ON public."property_members" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = property_members.shop_id)))));'),
      ('property_members', 'property_members_internal_staff_update', 'CREATE POLICY "property_members_internal_staff_update" ON public."property_members" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = property_members.shop_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = property_members.shop_id)))));'),
      ('property_members', 'property_members_self_select', 'CREATE POLICY "property_members_self_select" ON public."property_members" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((user_id = auth.uid()));'),
      ('property_portal_invites', 'property_portal_invites_internal_delete', 'CREATE POLICY "property_portal_invites_internal_delete" ON public."property_portal_invites" AS PERMISSIVE FOR DELETE TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM profiles me
  WHERE ((me.id = auth.uid()) AND (me.shop_id = property_portal_invites.shop_id)))));'),
      ('property_portal_invites', 'property_portal_invites_internal_insert', 'CREATE POLICY "property_portal_invites_internal_insert" ON public."property_portal_invites" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles me
  WHERE ((me.id = auth.uid()) AND (me.shop_id = property_portal_invites.shop_id)))));'),
      ('property_portal_invites', 'property_portal_invites_internal_select', 'CREATE POLICY "property_portal_invites_internal_select" ON public."property_portal_invites" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM profiles me
  WHERE ((me.id = auth.uid()) AND (me.shop_id = property_portal_invites.shop_id)))));'),
      ('property_portal_invites', 'property_portal_invites_internal_update', 'CREATE POLICY "property_portal_invites_internal_update" ON public."property_portal_invites" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM profiles me
  WHERE ((me.id = auth.uid()) AND (me.shop_id = property_portal_invites.shop_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles me
  WHERE ((me.id = auth.uid()) AND (me.shop_id = property_portal_invites.shop_id)))));'),
      ('property_portfolios', 'property_portfolios_internal_staff_delete', 'CREATE POLICY "property_portfolios_internal_staff_delete" ON public."property_portfolios" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = property_portfolios.shop_id)))));'),
      ('property_portfolios', 'property_portfolios_internal_staff_insert', 'CREATE POLICY "property_portfolios_internal_staff_insert" ON public."property_portfolios" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = property_portfolios.shop_id)))));'),
      ('property_portfolios', 'property_portfolios_internal_staff_select', 'CREATE POLICY "property_portfolios_internal_staff_select" ON public."property_portfolios" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = property_portfolios.shop_id)))));'),
      ('property_portfolios', 'property_portfolios_internal_staff_update', 'CREATE POLICY "property_portfolios_internal_staff_update" ON public."property_portfolios" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = property_portfolios.shop_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = property_portfolios.shop_id)))));'),
      ('property_portfolios', 'property_portfolios_member_select', 'CREATE POLICY "property_portfolios_member_select" ON public."property_portfolios" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM property_members pm
  WHERE ((pm.user_id = auth.uid()) AND (pm.shop_id = property_portfolios.shop_id) AND (pm.portfolio_id = property_portfolios.id)))));'),
      ('property_properties', 'property_properties_internal_staff_delete', 'CREATE POLICY "property_properties_internal_staff_delete" ON public."property_properties" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = property_properties.shop_id)))));'),
      ('property_properties', 'property_properties_internal_staff_insert', 'CREATE POLICY "property_properties_internal_staff_insert" ON public."property_properties" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = property_properties.shop_id)))));'),
      ('property_properties', 'property_properties_internal_staff_select', 'CREATE POLICY "property_properties_internal_staff_select" ON public."property_properties" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = property_properties.shop_id)))));'),
      ('property_properties', 'property_properties_internal_staff_update', 'CREATE POLICY "property_properties_internal_staff_update" ON public."property_properties" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = property_properties.shop_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = property_properties.shop_id)))));'),
      ('property_properties', 'property_properties_member_select', 'CREATE POLICY "property_properties_member_select" ON public."property_properties" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM property_members pm
  WHERE ((pm.user_id = auth.uid()) AND (pm.shop_id = property_properties.shop_id) AND ((pm.property_id = property_properties.id) OR ((pm.portfolio_id IS NOT NULL) AND (pm.portfolio_id = property_properties.portfolio_id)))))));'),
      ('property_request_attachments', 'property_request_attachments_internal_staff_all', 'CREATE POLICY "property_request_attachments_internal_staff_all" ON public."property_request_attachments" AS PERMISSIVE FOR ALL TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = property_request_attachments.shop_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = property_request_attachments.shop_id)))));'),
      ('property_request_attachments', 'property_request_attachments_property_member_select', 'CREATE POLICY "property_request_attachments_property_member_select" ON public."property_request_attachments" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM (property_maintenance_requests pmr
     JOIN property_members pm ON (((pm.shop_id = pmr.shop_id) AND (((pm.property_id IS NOT NULL) AND (pm.property_id = pmr.property_id)) OR ((pm.unit_id IS NOT NULL) AND (pm.unit_id = pmr.unit_id))))))
  WHERE ((pmr.id = property_request_attachments.request_id) AND (pm.user_id = auth.uid())))));'),
      ('property_request_events', 'property_request_events_internal_staff_all', 'CREATE POLICY "property_request_events_internal_staff_all" ON public."property_request_events" AS PERMISSIVE FOR ALL TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = property_request_events.shop_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = property_request_events.shop_id)))));'),
      ('property_request_events', 'property_request_events_property_member_select', 'CREATE POLICY "property_request_events_property_member_select" ON public."property_request_events" AS PERMISSIVE FOR SELECT TO PUBLIC USING (((visibility = ANY (ARRAY[''tenant_visible''::text, ''all_parties''::text])) AND (EXISTS ( SELECT 1
   FROM (property_maintenance_requests pmr
     JOIN property_members pm ON (((pm.shop_id = pmr.shop_id) AND (((pm.property_id IS NOT NULL) AND (pm.property_id = pmr.property_id)) OR ((pm.unit_id IS NOT NULL) AND (pm.unit_id = pmr.unit_id))))))
  WHERE ((pmr.id = property_request_events.request_id) AND (pm.user_id = auth.uid()))))));'),
      ('property_request_events', 'property_request_events_tenant_requester_insert', 'CREATE POLICY "property_request_events_tenant_requester_insert" ON public."property_request_events" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK (((actor_profile_id = auth.uid()) AND (actor_type = ''tenant''::text) AND (event_type = ''comment''::text) AND (visibility = ''tenant_visible''::text) AND (EXISTS ( SELECT 1
   FROM (property_maintenance_requests pmr
     JOIN property_members pm ON (((pm.shop_id = pmr.shop_id) AND (((pm.property_id IS NOT NULL) AND (pm.property_id = pmr.property_id)) OR ((pm.unit_id IS NOT NULL) AND (pm.unit_id = pmr.unit_id))))))
  WHERE ((pmr.id = property_request_events.request_id) AND (pm.user_id = auth.uid()) AND (pmr.shop_id = property_request_events.shop_id))))));'),
      ('property_units', 'property_units_internal_staff_delete', 'CREATE POLICY "property_units_internal_staff_delete" ON public."property_units" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = property_units.shop_id)))));'),
      ('property_units', 'property_units_internal_staff_insert', 'CREATE POLICY "property_units_internal_staff_insert" ON public."property_units" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = property_units.shop_id)))));'),
      ('property_units', 'property_units_internal_staff_select', 'CREATE POLICY "property_units_internal_staff_select" ON public."property_units" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = property_units.shop_id)))));'),
      ('property_units', 'property_units_internal_staff_update', 'CREATE POLICY "property_units_internal_staff_update" ON public."property_units" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = property_units.shop_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = property_units.shop_id)))));'),
      ('property_units', 'property_units_member_select', 'CREATE POLICY "property_units_member_select" ON public."property_units" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM (property_members pm
     JOIN property_properties pp ON ((pp.id = property_units.property_id)))
  WHERE ((pm.user_id = auth.uid()) AND (pm.shop_id = property_units.shop_id) AND ((pm.unit_id = property_units.id) OR (pm.property_id = property_units.property_id) OR ((pm.portfolio_id IS NOT NULL) AND (pm.portfolio_id = pp.portfolio_id)))))));'),
      ('property_vendor_assignments', 'property_vendor_assignments_internal_staff_delete', 'CREATE POLICY "property_vendor_assignments_internal_staff_delete" ON public."property_vendor_assignments" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = property_vendor_assignments.shop_id)))));'),
      ('property_vendor_assignments', 'property_vendor_assignments_internal_staff_insert', 'CREATE POLICY "property_vendor_assignments_internal_staff_insert" ON public."property_vendor_assignments" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = property_vendor_assignments.shop_id)))));'),
      ('property_vendor_assignments', 'property_vendor_assignments_internal_staff_select', 'CREATE POLICY "property_vendor_assignments_internal_staff_select" ON public."property_vendor_assignments" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = property_vendor_assignments.shop_id)))));'),
      ('property_vendor_assignments', 'property_vendor_assignments_internal_staff_update', 'CREATE POLICY "property_vendor_assignments_internal_staff_update" ON public."property_vendor_assignments" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = property_vendor_assignments.shop_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = property_vendor_assignments.shop_id)))));'),
      ('property_vendors', 'property_vendors_internal_staff_delete', 'CREATE POLICY "property_vendors_internal_staff_delete" ON public."property_vendors" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = property_vendors.shop_id)))));'),
      ('property_vendors', 'property_vendors_internal_staff_insert', 'CREATE POLICY "property_vendors_internal_staff_insert" ON public."property_vendors" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = property_vendors.shop_id)))));'),
      ('property_vendors', 'property_vendors_internal_staff_select', 'CREATE POLICY "property_vendors_internal_staff_select" ON public."property_vendors" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = property_vendors.shop_id)))));'),
      ('property_vendors', 'property_vendors_internal_staff_update', 'CREATE POLICY "property_vendors_internal_staff_update" ON public."property_vendors" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = property_vendors.shop_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = property_vendors.shop_id)))));'),
      ('quickbooks_connections', 'quickbooks_connections_select_in_shop', 'CREATE POLICY "quickbooks_connections_select_in_shop" ON public."quickbooks_connections" AS PERMISSIVE FOR SELECT TO PUBLIC USING (user_is_in_shop(shop_id));'),
      ('quickbooks_connections', 'quickbooks_connections_write_shop_admin', 'CREATE POLICY "quickbooks_connections_write_shop_admin" ON public."quickbooks_connections" AS PERMISSIVE FOR ALL TO PUBLIC USING ((COALESCE(shop_role_v2(shop_id), ''''::text) = ANY (ARRAY[''owner''::text, ''admin''::text, ''manager''::text]))) WITH CHECK ((COALESCE(shop_role_v2(shop_id), ''''::text) = ANY (ARRAY[''owner''::text, ''admin''::text, ''manager''::text])));'),
      ('quickbooks_customer_links', 'quickbooks_customer_links_select_in_shop', 'CREATE POLICY "quickbooks_customer_links_select_in_shop" ON public."quickbooks_customer_links" AS PERMISSIVE FOR SELECT TO PUBLIC USING (user_is_in_shop(shop_id));'),
      ('quickbooks_customer_links', 'quickbooks_customer_links_write_shop_admin', 'CREATE POLICY "quickbooks_customer_links_write_shop_admin" ON public."quickbooks_customer_links" AS PERMISSIVE FOR ALL TO PUBLIC USING ((COALESCE(shop_role_v2(shop_id), ''''::text) = ANY (ARRAY[''owner''::text, ''admin''::text, ''manager''::text]))) WITH CHECK ((COALESCE(shop_role_v2(shop_id), ''''::text) = ANY (ARRAY[''owner''::text, ''admin''::text, ''manager''::text])));'),
      ('quickbooks_sync_events', 'quickbooks_sync_events_select_in_shop', 'CREATE POLICY "quickbooks_sync_events_select_in_shop" ON public."quickbooks_sync_events" AS PERMISSIVE FOR SELECT TO PUBLIC USING (user_is_in_shop(shop_id));'),
      ('quickbooks_sync_events', 'quickbooks_sync_events_write_shop_admin', 'CREATE POLICY "quickbooks_sync_events_write_shop_admin" ON public."quickbooks_sync_events" AS PERMISSIVE FOR ALL TO PUBLIC USING ((COALESCE(shop_role_v2(shop_id), ''''::text) = ANY (ARRAY[''owner''::text, ''admin''::text, ''manager''::text]))) WITH CHECK ((COALESCE(shop_role_v2(shop_id), ''''::text) = ANY (ARRAY[''owner''::text, ''admin''::text, ''manager''::text])));'),
      ('shop_ai_profiles', 'shop_ai_profiles__shop_delete', 'CREATE POLICY "shop_ai_profiles__shop_delete" ON public."shop_ai_profiles" AS PERMISSIVE FOR DELETE TO "authenticated" USING (is_shop_member_v2(shop_id));'),
      ('shop_ai_profiles', 'shop_ai_profiles__shop_insert', 'CREATE POLICY "shop_ai_profiles__shop_insert" ON public."shop_ai_profiles" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (is_shop_member_v2(shop_id));'),
      ('shop_ai_profiles', 'shop_ai_profiles__shop_select', 'CREATE POLICY "shop_ai_profiles__shop_select" ON public."shop_ai_profiles" AS PERMISSIVE FOR SELECT TO "authenticated" USING (is_shop_member_v2(shop_id));'),
      ('shop_ai_profiles', 'shop_ai_profiles__shop_update', 'CREATE POLICY "shop_ai_profiles__shop_update" ON public."shop_ai_profiles" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (is_shop_member_v2(shop_id)) WITH CHECK (is_shop_member_v2(shop_id));'),
      ('shop_boost_import_provenance', 'service-role-manage-shop-boost-import-provenance', 'CREATE POLICY "service-role-manage-shop-boost-import-provenance" ON public."shop_boost_import_provenance" AS PERMISSIVE FOR ALL TO PUBLIC USING ((auth.role() = ''service_role''::text)) WITH CHECK ((auth.role() = ''service_role''::text));'),
      ('shop_boost_import_provenance', 'shop-users-read-shop-boost-import-provenance', 'CREATE POLICY "shop-users-read-shop-boost-import-provenance" ON public."shop_boost_import_provenance" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = shop_boost_import_provenance.shop_id)))));'),
      ('shop_boost_import_reset_audit_events', 'service-role-manage-shop-boost-import-reset-audit-events', 'CREATE POLICY "service-role-manage-shop-boost-import-reset-audit-events" ON public."shop_boost_import_reset_audit_events" AS PERMISSIVE FOR ALL TO PUBLIC USING ((auth.role() = ''service_role''::text)) WITH CHECK ((auth.role() = ''service_role''::text));'),
      ('shop_boost_import_reset_audit_events', 'shop-users-read-shop-boost-import-reset-audit-events', 'CREATE POLICY "shop-users-read-shop-boost-import-reset-audit-events" ON public."shop_boost_import_reset_audit_events" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = shop_boost_import_reset_audit_events.shop_id)))));'),
      ('shop_boost_intakes', 'service-role-only-inserts', 'CREATE POLICY "service-role-only-inserts" ON public."shop_boost_intakes" AS PERMISSIVE FOR INSERT TO "service_role" WITH CHECK ((auth.role() = ''service_role''::text));'),
      ('shop_boost_intakes', 'shop-users-read-shop-boost-intakes', 'CREATE POLICY "shop-users-read-shop-boost-intakes" ON public."shop_boost_intakes" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = shop_boost_intakes.shop_id)))));'),
      ('shop_boost_integrity_reports', 'service-role-manage-shop-boost-integrity-reports', 'CREATE POLICY "service-role-manage-shop-boost-integrity-reports" ON public."shop_boost_integrity_reports" AS PERMISSIVE FOR ALL TO "service_role" USING ((auth.role() = ''service_role''::text)) WITH CHECK ((auth.role() = ''service_role''::text));'),
      ('shop_boost_integrity_reports', 'shop-users-read-shop-boost-integrity-reports', 'CREATE POLICY "shop-users-read-shop-boost-integrity-reports" ON public."shop_boost_integrity_reports" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = shop_boost_integrity_reports.shop_id)))));'),
      ('shop_boost_review_audit_events', 'service-role-manage-shop-boost-review-audit-events', 'CREATE POLICY "service-role-manage-shop-boost-review-audit-events" ON public."shop_boost_review_audit_events" AS PERMISSIVE FOR ALL TO "service_role" USING ((auth.role() = ''service_role''::text)) WITH CHECK ((auth.role() = ''service_role''::text));'),
      ('shop_boost_review_audit_events', 'shop-users-read-shop-boost-review-audit-events', 'CREATE POLICY "shop-users-read-shop-boost-review-audit-events" ON public."shop_boost_review_audit_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = shop_boost_review_audit_events.shop_id)))));'),
      ('shop_boost_review_items', 'service-role-manage-shop-boost-review-items', 'CREATE POLICY "service-role-manage-shop-boost-review-items" ON public."shop_boost_review_items" AS PERMISSIVE FOR ALL TO "service_role" USING ((auth.role() = ''service_role''::text)) WITH CHECK ((auth.role() = ''service_role''::text));'),
      ('shop_boost_review_items', 'shop-users-read-shop-boost-review-items', 'CREATE POLICY "shop-users-read-shop-boost-review-items" ON public."shop_boost_review_items" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = shop_boost_review_items.shop_id)))));'),
      ('shop_boost_row_results', 'service-role-manage-shop-boost-row-results', 'CREATE POLICY "service-role-manage-shop-boost-row-results" ON public."shop_boost_row_results" AS PERMISSIVE FOR ALL TO "service_role" USING ((auth.role() = ''service_role''::text)) WITH CHECK ((auth.role() = ''service_role''::text));'),
      ('shop_boost_row_results', 'shop-users-read-shop-boost-row-results', 'CREATE POLICY "shop-users-read-shop-boost-row-results" ON public."shop_boost_row_results" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = shop_boost_row_results.shop_id)))));'),
      ('shop_brand_assets', 'shop_brand_assets_insert_same_shop', 'CREATE POLICY "shop_brand_assets_insert_same_shop" ON public."shop_brand_assets" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = shop_brand_assets.shop_id) AND (lower(COALESCE(p.role, ''''::text)) = ANY (ARRAY[''owner''::text, ''admin''::text, ''manager''::text]))))));'),
      ('shop_brand_assets', 'shop_brand_assets_select_same_shop', 'CREATE POLICY "shop_brand_assets_select_same_shop" ON public."shop_brand_assets" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = shop_brand_assets.shop_id)))));'),
      ('shop_brand_assets', 'shop_brand_assets_update_same_shop', 'CREATE POLICY "shop_brand_assets_update_same_shop" ON public."shop_brand_assets" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = shop_brand_assets.shop_id) AND (lower(COALESCE(p.role, ''''::text)) = ANY (ARRAY[''owner''::text, ''admin''::text, ''manager''::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = shop_brand_assets.shop_id) AND (lower(COALESCE(p.role, ''''::text)) = ANY (ARRAY[''owner''::text, ''admin''::text, ''manager''::text]))))));'),
      ('shop_brand_profiles', 'shop_brand_profiles_insert_same_shop', 'CREATE POLICY "shop_brand_profiles_insert_same_shop" ON public."shop_brand_profiles" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = shop_brand_profiles.shop_id) AND (lower(COALESCE(p.role, ''''::text)) = ANY (ARRAY[''owner''::text, ''admin''::text, ''manager''::text]))))));'),
      ('shop_brand_profiles', 'shop_brand_profiles_select_same_shop', 'CREATE POLICY "shop_brand_profiles_select_same_shop" ON public."shop_brand_profiles" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = shop_brand_profiles.shop_id)))));'),
      ('shop_brand_profiles', 'shop_brand_profiles_update_same_shop', 'CREATE POLICY "shop_brand_profiles_update_same_shop" ON public."shop_brand_profiles" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = shop_brand_profiles.shop_id) AND (lower(COALESCE(p.role, ''''::text)) = ANY (ARRAY[''owner''::text, ''admin''::text, ''manager''::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = shop_brand_profiles.shop_id) AND (lower(COALESCE(p.role, ''''::text)) = ANY (ARRAY[''owner''::text, ''admin''::text, ''manager''::text]))))));'),
      ('shop_health_snapshots', 'service-role-manage-shop-health-snapshots', 'CREATE POLICY "service-role-manage-shop-health-snapshots" ON public."shop_health_snapshots" AS PERMISSIVE FOR ALL TO "service_role" USING ((auth.role() = ''service_role''::text)) WITH CHECK ((auth.role() = ''service_role''::text));'),
      ('shop_health_snapshots', 'shop-users-read-shop-health-snapshots', 'CREATE POLICY "shop-users-read-shop-health-snapshots" ON public."shop_health_snapshots" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = shop_health_snapshots.shop_id)))));'),
      ('shop_import_files', 'service-role-manage-shop-import-files', 'CREATE POLICY "service-role-manage-shop-import-files" ON public."shop_import_files" AS PERMISSIVE FOR ALL TO "service_role" USING ((auth.role() = ''service_role''::text)) WITH CHECK ((auth.role() = ''service_role''::text));'),
      ('shop_import_files', 'shop-users-read-shop-import-files', 'CREATE POLICY "shop-users-read-shop-import-files" ON public."shop_import_files" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM (shop_boost_intakes i
     JOIN profiles p ON (((p.id = auth.uid()) AND (p.shop_id = i.shop_id))))
  WHERE (i.id = shop_import_files.intake_id))));'),
      ('shop_import_rows', 'service-role-manage-shop-import-rows', 'CREATE POLICY "service-role-manage-shop-import-rows" ON public."shop_import_rows" AS PERMISSIVE FOR ALL TO "service_role" USING ((auth.role() = ''service_role''::text)) WITH CHECK ((auth.role() = ''service_role''::text));'),
      ('shop_import_rows', 'shop-users-read-shop-import-rows', 'CREATE POLICY "shop-users-read-shop-import-rows" ON public."shop_import_rows" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM (shop_boost_intakes i
     JOIN profiles p ON (((p.id = auth.uid()) AND (p.shop_id = i.shop_id))))
  WHERE (i.id = shop_import_rows.intake_id))));'),
      ('shop_maintenance_service_map', 'shop_maintenance_service_map_insert', 'CREATE POLICY "shop_maintenance_service_map_insert" ON public."shop_maintenance_service_map" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((shop_id IN ( SELECT p.shop_id
   FROM profiles p
  WHERE ((p.id = auth.uid()) OR (p.user_id = auth.uid())))));'),
      ('shop_maintenance_service_map', 'shop_maintenance_service_map_select', 'CREATE POLICY "shop_maintenance_service_map_select" ON public."shop_maintenance_service_map" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((shop_id IN ( SELECT p.shop_id
   FROM profiles p
  WHERE ((p.id = auth.uid()) OR (p.user_id = auth.uid())))));'),
      ('shop_maintenance_service_map', 'shop_maintenance_service_map_update', 'CREATE POLICY "shop_maintenance_service_map_update" ON public."shop_maintenance_service_map" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((shop_id IN ( SELECT p.shop_id
   FROM profiles p
  WHERE ((p.id = auth.uid()) OR (p.user_id = auth.uid()))))) WITH CHECK ((shop_id IN ( SELECT p.shop_id
   FROM profiles p
  WHERE ((p.id = auth.uid()) OR (p.user_id = auth.uid())))));'),
      ('shop_members', 'shop_members_insert_self', 'CREATE POLICY "shop_members_insert_self" ON public."shop_members" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((user_id = auth.uid()) AND ((created_by IS NULL) OR (created_by = auth.uid()))));'),
      ('shop_members', 'shop_members_select_self', 'CREATE POLICY "shop_members_select_self" ON public."shop_members" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((user_id = auth.uid()));'),
      ('shop_members', 'shop_members_update_self', 'CREATE POLICY "shop_members_update_self" ON public."shop_members" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((user_id = auth.uid())) WITH CHECK (((user_id = auth.uid()) AND ((created_by IS NULL) OR (created_by = auth.uid()))));'),
      ('shop_onboarding_activation_rules', 'service-role-manage-shop-onboarding-activation-rules', 'CREATE POLICY "service-role-manage-shop-onboarding-activation-rules" ON public."shop_onboarding_activation_rules" AS PERMISSIVE FOR ALL TO "service_role" USING ((auth.role() = ''service_role''::text)) WITH CHECK ((auth.role() = ''service_role''::text));'),
      ('shop_onboarding_activation_rules', 'shop-users-read-shop-onboarding-activation-rules', 'CREATE POLICY "shop-users-read-shop-onboarding-activation-rules" ON public."shop_onboarding_activation_rules" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = shop_onboarding_activation_rules.shop_id)))));'),
      ('shop_onboarding_attempts', 'service-role-manage-shop-onboarding-attempts', 'CREATE POLICY "service-role-manage-shop-onboarding-attempts" ON public."shop_onboarding_attempts" AS PERMISSIVE FOR ALL TO "service_role" USING ((auth.role() = ''service_role''::text)) WITH CHECK ((auth.role() = ''service_role''::text));'),
      ('shop_onboarding_attempts', 'shop-users-read-shop-onboarding-attempts', 'CREATE POLICY "shop-users-read-shop-onboarding-attempts" ON public."shop_onboarding_attempts" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM (profiles p
     JOIN shop_onboarding_runs r ON ((r.id = shop_onboarding_attempts.run_id)))
  WHERE ((p.id = auth.uid()) AND (p.shop_id = r.shop_id)))));'),
      ('shop_onboarding_jobs', 'service-role-manage-shop-onboarding-jobs', 'CREATE POLICY "service-role-manage-shop-onboarding-jobs" ON public."shop_onboarding_jobs" AS PERMISSIVE FOR ALL TO "service_role" USING ((auth.role() = ''service_role''::text)) WITH CHECK ((auth.role() = ''service_role''::text));'),
      ('shop_onboarding_jobs', 'shop-users-read-shop-onboarding-jobs', 'CREATE POLICY "shop-users-read-shop-onboarding-jobs" ON public."shop_onboarding_jobs" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = shop_onboarding_jobs.shop_id)))));'),
      ('shop_onboarding_runs', 'service-role-manage-shop-onboarding-runs', 'CREATE POLICY "service-role-manage-shop-onboarding-runs" ON public."shop_onboarding_runs" AS PERMISSIVE FOR ALL TO "service_role" USING ((auth.role() = ''service_role''::text)) WITH CHECK ((auth.role() = ''service_role''::text));'),
      ('shop_onboarding_runs', 'shop-users-read-shop-onboarding-runs', 'CREATE POLICY "shop-users-read-shop-onboarding-runs" ON public."shop_onboarding_runs" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = shop_onboarding_runs.shop_id)))));'),
      ('shop_parts_import_match_candidates', 'service-role-manage-shop-parts-import-match-candidates', 'CREATE POLICY "service-role-manage-shop-parts-import-match-candidates" ON public."shop_parts_import_match_candidates" AS PERMISSIVE FOR ALL TO "service_role" USING ((auth.role() = ''service_role''::text)) WITH CHECK ((auth.role() = ''service_role''::text));'),
      ('shop_parts_import_match_candidates', 'shop-users-read-shop-parts-import-candidates', 'CREATE POLICY "shop-users-read-shop-parts-import-candidates" ON public."shop_parts_import_match_candidates" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = shop_parts_import_match_candidates.shop_id)))));'),
      ('shop_parts_import_staging', 'service-role-manage-shop-parts-import-staging', 'CREATE POLICY "service-role-manage-shop-parts-import-staging" ON public."shop_parts_import_staging" AS PERMISSIVE FOR ALL TO "service_role" USING ((auth.role() = ''service_role''::text)) WITH CHECK ((auth.role() = ''service_role''::text));'),
      ('shop_parts_import_staging', 'shop-users-read-shop-parts-import-staging', 'CREATE POLICY "shop-users-read-shop-parts-import-staging" ON public."shop_parts_import_staging" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = shop_parts_import_staging.shop_id)))));'),
      ('shop_parts_source_aliases', 'service-role-manage-shop-parts-source-aliases', 'CREATE POLICY "service-role-manage-shop-parts-source-aliases" ON public."shop_parts_source_aliases" AS PERMISSIVE FOR ALL TO "service_role" USING ((auth.role() = ''service_role''::text)) WITH CHECK ((auth.role() = ''service_role''::text));'),
      ('shop_parts_source_aliases', 'shop-users-read-shop-parts-source-aliases', 'CREATE POLICY "shop-users-read-shop-parts-source-aliases" ON public."shop_parts_source_aliases" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = shop_parts_source_aliases.shop_id)))));'),
      ('shop_vehicle_menu_items', 'svmi_delete', 'CREATE POLICY "svmi_delete" ON public."shop_vehicle_menu_items" AS PERMISSIVE FOR DELETE TO "authenticated" USING (is_shop_member(shop_id));'),
      ('shop_vehicle_menu_items', 'svmi_insert', 'CREATE POLICY "svmi_insert" ON public."shop_vehicle_menu_items" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (is_shop_member(shop_id));'),
      ('shop_vehicle_menu_items', 'svmi_select', 'CREATE POLICY "svmi_select" ON public."shop_vehicle_menu_items" AS PERMISSIVE FOR SELECT TO "authenticated" USING (is_shop_member(shop_id));'),
      ('shop_vehicle_menu_items', 'svmi_update', 'CREATE POLICY "svmi_update" ON public."shop_vehicle_menu_items" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (is_shop_member(shop_id)) WITH CHECK (is_shop_member(shop_id));'),
      ('shopreel_drafts', 'owner-insert-shopreel-drafts', 'CREATE POLICY "owner-insert-shopreel-drafts" ON public."shopreel_drafts" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM shop_members sm
  WHERE ((sm.shop_id = shopreel_drafts.shop_id) AND (sm.user_id = auth.uid()) AND (sm.role = ''owner''::text)))));'),
      ('shopreel_drafts', 'owner-read-shopreel-drafts', 'CREATE POLICY "owner-read-shopreel-drafts" ON public."shopreel_drafts" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM shop_members sm
  WHERE ((sm.shop_id = shopreel_drafts.shop_id) AND (sm.user_id = auth.uid()) AND (sm.role = ''owner''::text)))));'),
      ('shopreel_drafts', 'owner-update-shopreel-drafts', 'CREATE POLICY "owner-update-shopreel-drafts" ON public."shopreel_drafts" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM shop_members sm
  WHERE ((sm.shop_id = shopreel_drafts.shop_id) AND (sm.user_id = auth.uid()) AND (sm.role = ''owner''::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM shop_members sm
  WHERE ((sm.shop_id = shopreel_drafts.shop_id) AND (sm.user_id = auth.uid()) AND (sm.role = ''owner''::text)))));'),
      ('shopreel_drafts', 'service-role-manage-shopreel-drafts', 'CREATE POLICY "service-role-manage-shopreel-drafts" ON public."shopreel_drafts" AS PERMISSIVE FOR ALL TO "service_role" USING ((auth.role() = ''service_role''::text)) WITH CHECK ((auth.role() = ''service_role''::text));'),
      ('shopreel_event_deliveries', 'shopreel_event_deliveries_insert_member', 'CREATE POLICY "shopreel_event_deliveries_insert_member" ON public."shopreel_event_deliveries" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK (is_shop_member(shop_id));'),
      ('shopreel_event_deliveries', 'shopreel_event_deliveries_select_member', 'CREATE POLICY "shopreel_event_deliveries_select_member" ON public."shopreel_event_deliveries" AS PERMISSIVE FOR SELECT TO PUBLIC USING (is_shop_member(shop_id));'),
      ('shopreel_event_deliveries', 'shopreel_event_deliveries_update_member', 'CREATE POLICY "shopreel_event_deliveries_update_member" ON public."shopreel_event_deliveries" AS PERMISSIVE FOR UPDATE TO PUBLIC USING (is_shop_member(shop_id)) WITH CHECK (is_shop_member(shop_id));'),
      ('shopreel_integrations', 'shopreel_integrations_insert_member', 'CREATE POLICY "shopreel_integrations_insert_member" ON public."shopreel_integrations" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK (is_shop_member(shop_id));'),
      ('shopreel_integrations', 'shopreel_integrations_select_member', 'CREATE POLICY "shopreel_integrations_select_member" ON public."shopreel_integrations" AS PERMISSIVE FOR SELECT TO PUBLIC USING (is_shop_member(shop_id));'),
      ('shopreel_integrations', 'shopreel_integrations_update_member', 'CREATE POLICY "shopreel_integrations_update_member" ON public."shopreel_integrations" AS PERMISSIVE FOR UPDATE TO PUBLIC USING (is_shop_member(shop_id)) WITH CHECK (is_shop_member(shop_id));'),
      ('shopreel_manual_assets', 'shopreel_manual_assets_delete_shop', 'CREATE POLICY "shopreel_manual_assets_delete_shop" ON public."shopreel_manual_assets" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((shop_id = current_shop_id()));'),
      ('shopreel_manual_assets', 'shopreel_manual_assets_insert_shop', 'CREATE POLICY "shopreel_manual_assets_insert_shop" ON public."shopreel_manual_assets" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((shop_id = current_shop_id()));'),
      ('shopreel_manual_assets', 'shopreel_manual_assets_select_shop', 'CREATE POLICY "shopreel_manual_assets_select_shop" ON public."shopreel_manual_assets" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((shop_id = current_shop_id()));'),
      ('shopreel_manual_assets', 'shopreel_manual_assets_update_shop', 'CREATE POLICY "shopreel_manual_assets_update_shop" ON public."shopreel_manual_assets" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((shop_id = current_shop_id())) WITH CHECK ((shop_id = current_shop_id()));'),
      ('shopreel_opportunities', 'owner-read-shopreel-opportunities', 'CREATE POLICY "owner-read-shopreel-opportunities" ON public."shopreel_opportunities" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM shop_members sm
  WHERE ((sm.shop_id = shopreel_opportunities.shop_id) AND (sm.user_id = auth.uid()) AND (sm.role = ''owner''::text)))));'),
      ('shopreel_opportunities', 'owner-update-shopreel-opportunities', 'CREATE POLICY "owner-update-shopreel-opportunities" ON public."shopreel_opportunities" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM shop_members sm
  WHERE ((sm.shop_id = shopreel_opportunities.shop_id) AND (sm.user_id = auth.uid()) AND (sm.role = ''owner''::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM shop_members sm
  WHERE ((sm.shop_id = shopreel_opportunities.shop_id) AND (sm.user_id = auth.uid()) AND (sm.role = ''owner''::text)))));'),
      ('shopreel_opportunities', 'service-role-manage-shopreel-opportunities', 'CREATE POLICY "service-role-manage-shopreel-opportunities" ON public."shopreel_opportunities" AS PERMISSIVE FOR ALL TO "service_role" USING ((auth.role() = ''service_role''::text)) WITH CHECK ((auth.role() = ''service_role''::text));'),
      ('shopreel_opportunity_status_history', 'owner-insert-shopreel-opportunity-history', 'CREATE POLICY "owner-insert-shopreel-opportunity-history" ON public."shopreel_opportunity_status_history" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM shop_members sm
  WHERE ((sm.shop_id = shopreel_opportunity_status_history.shop_id) AND (sm.user_id = auth.uid()) AND (sm.role = ''owner''::text)))));'),
      ('shopreel_opportunity_status_history', 'owner-read-shopreel-opportunity-history', 'CREATE POLICY "owner-read-shopreel-opportunity-history" ON public."shopreel_opportunity_status_history" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM shop_members sm
  WHERE ((sm.shop_id = shopreel_opportunity_status_history.shop_id) AND (sm.user_id = auth.uid()) AND (sm.role = ''owner''::text)))));'),
      ('shopreel_opportunity_status_history', 'service-role-manage-shopreel-opportunity-history', 'CREATE POLICY "service-role-manage-shopreel-opportunity-history" ON public."shopreel_opportunity_status_history" AS PERMISSIVE FOR ALL TO "service_role" USING ((auth.role() = ''service_role''::text)) WITH CHECK ((auth.role() = ''service_role''::text));'),
      ('shopreel_publications', 'shopreel_publications_delete_shop', 'CREATE POLICY "shopreel_publications_delete_shop" ON public."shopreel_publications" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((shop_id = current_shop_id()));'),
      ('shopreel_publications', 'shopreel_publications_insert_shop', 'CREATE POLICY "shopreel_publications_insert_shop" ON public."shopreel_publications" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((shop_id = current_shop_id()));'),
      ('shopreel_publications', 'shopreel_publications_select_shop', 'CREATE POLICY "shopreel_publications_select_shop" ON public."shopreel_publications" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((shop_id = current_shop_id()));'),
      ('shopreel_publications', 'shopreel_publications_update_shop', 'CREATE POLICY "shopreel_publications_update_shop" ON public."shopreel_publications" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((shop_id = current_shop_id())) WITH CHECK ((shop_id = current_shop_id()));'),
      ('shopreel_publish_jobs', 'shopreel_publish_jobs_deny_all', 'CREATE POLICY "shopreel_publish_jobs_deny_all" ON public."shopreel_publish_jobs" AS PERMISSIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);'),
      ('shopreel_social_connections', 'shopreel_social_connections_delete_shop', 'CREATE POLICY "shopreel_social_connections_delete_shop" ON public."shopreel_social_connections" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((shop_id = current_shop_id()));'),
      ('shopreel_social_connections', 'shopreel_social_connections_insert_shop', 'CREATE POLICY "shopreel_social_connections_insert_shop" ON public."shopreel_social_connections" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((shop_id = current_shop_id()));'),
      ('shopreel_social_connections', 'shopreel_social_connections_select_shop', 'CREATE POLICY "shopreel_social_connections_select_shop" ON public."shopreel_social_connections" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((shop_id = current_shop_id()));'),
      ('shopreel_social_connections', 'shopreel_social_connections_update_shop', 'CREATE POLICY "shopreel_social_connections_update_shop" ON public."shopreel_social_connections" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((shop_id = current_shop_id())) WITH CHECK ((shop_id = current_shop_id()));'),
      ('shopreel_story_sources', 'owner-read-shopreel-story-sources', 'CREATE POLICY "owner-read-shopreel-story-sources" ON public."shopreel_story_sources" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM shop_members sm
  WHERE ((sm.shop_id = shopreel_story_sources.shop_id) AND (sm.user_id = auth.uid()) AND (sm.role = ''owner''::text)))));'),
      ('shopreel_story_sources', 'service-role-manage-shopreel-story-sources', 'CREATE POLICY "service-role-manage-shopreel-story-sources" ON public."shopreel_story_sources" AS PERMISSIVE FOR ALL TO "service_role" USING ((auth.role() = ''service_role''::text)) WITH CHECK ((auth.role() = ''service_role''::text));'),
      ('staff_certifications', 'staff_certifications_shop_all', 'CREATE POLICY "staff_certifications_shop_all" ON public."staff_certifications" AS PERMISSIVE FOR ALL TO "authenticated" USING ((shop_id = current_shop_id())) WITH CHECK ((shop_id = current_shop_id()));'),
      ('staff_invite_candidates', 'staff_invite_candidates_delete_owner_admin', 'CREATE POLICY "staff_invite_candidates_delete_owner_admin" ON public."staff_invite_candidates" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = staff_invite_candidates.shop_id) AND (COALESCE(p.role, ''''::text) = ANY (ARRAY[''owner''::text, ''admin''::text]))))));'),
      ('staff_invite_candidates', 'staff_invite_candidates_insert_admin', 'CREATE POLICY "staff_invite_candidates_insert_admin" ON public."staff_invite_candidates" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = staff_invite_candidates.shop_id) AND (COALESCE(p.role, ''''::text) = ANY (ARRAY[''owner''::text, ''admin''::text, ''manager''::text]))))));'),
      ('staff_invite_candidates', 'staff_invite_candidates_select_shop', 'CREATE POLICY "staff_invite_candidates_select_shop" ON public."staff_invite_candidates" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = staff_invite_candidates.shop_id)))));'),
      ('staff_invite_candidates', 'staff_invite_candidates_update_admin', 'CREATE POLICY "staff_invite_candidates_update_admin" ON public."staff_invite_candidates" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = staff_invite_candidates.shop_id) AND (COALESCE(p.role, ''''::text) = ANY (ARRAY[''owner''::text, ''admin''::text, ''manager''::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = staff_invite_candidates.shop_id) AND (COALESCE(p.role, ''''::text) = ANY (ARRAY[''owner''::text, ''admin''::text, ''manager''::text]))))));'),
      ('staff_invite_suggestions', 'service-role-manage-staff-invite-suggestions', 'CREATE POLICY "service-role-manage-staff-invite-suggestions" ON public."staff_invite_suggestions" AS PERMISSIVE FOR ALL TO "service_role" USING ((auth.role() = ''service_role''::text)) WITH CHECK ((auth.role() = ''service_role''::text));'),
      ('staff_invite_suggestions', 'shop-users-read-staff-invite-suggestions', 'CREATE POLICY "shop-users-read-staff-invite-suggestions" ON public."staff_invite_suggestions" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = staff_invite_suggestions.shop_id)))));'),
      ('supplier_catalog_items', 'supplier_catalog_items__supplier_shop_all', 'CREATE POLICY "supplier_catalog_items__supplier_shop_all" ON public."supplier_catalog_items" AS PERMISSIVE FOR ALL TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM suppliers s
  WHERE ((s.id = supplier_catalog_items.supplier_id) AND is_shop_member_v2(s.shop_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM suppliers s
  WHERE ((s.id = supplier_catalog_items.supplier_id) AND is_shop_member_v2(s.shop_id)))));'),
      ('supplier_quote_batch_rows', 'supplier_quote_batch_rows_deny_all', 'CREATE POLICY "supplier_quote_batch_rows_deny_all" ON public."supplier_quote_batch_rows" AS PERMISSIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);'),
      ('supplier_quote_batches', 'supplier_quote_batches_deny_all', 'CREATE POLICY "supplier_quote_batches_deny_all" ON public."supplier_quote_batches" AS PERMISSIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);'),
      ('user_theme_preferences', 'user_theme_preferences_delete_own', 'CREATE POLICY "user_theme_preferences_delete_own" ON public."user_theme_preferences" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((user_id = auth.uid()));'),
      ('user_theme_preferences', 'user_theme_preferences_insert_own', 'CREATE POLICY "user_theme_preferences_insert_own" ON public."user_theme_preferences" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((user_id = auth.uid()));'),
      ('user_theme_preferences', 'user_theme_preferences_select_own', 'CREATE POLICY "user_theme_preferences_select_own" ON public."user_theme_preferences" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((user_id = auth.uid()));'),
      ('user_theme_preferences', 'user_theme_preferences_update_own', 'CREATE POLICY "user_theme_preferences_update_own" ON public."user_theme_preferences" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));'),
      ('vehicle_menus', 'vehicle_menus_read', 'CREATE POLICY "vehicle_menus_read" ON public."vehicle_menus" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);'),
      ('videos', 'videos_all_member', 'CREATE POLICY "videos_all_member" ON public."videos" AS PERMISSIVE FOR ALL TO "authenticated" USING (user_is_in_shop(shop_id)) WITH CHECK (user_is_in_shop(shop_id));'),
      ('work_order_invoice_reviews', 'wor_insert_privileged_profiles', 'CREATE POLICY "wor_insert_privileged_profiles" ON public."work_order_invoice_reviews" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.shop_id = work_order_invoice_reviews.shop_id) AND (lower(COALESCE(p.role, ''''::text)) = ANY (ARRAY[''owner''::text, ''admin''::text, ''manager''::text, ''advisor''::text, ''lead''::text, ''lead_hand''::text, ''leadhand''::text]))))));'),
      ('work_order_invoice_reviews', 'wor_no_deletes', 'CREATE POLICY "wor_no_deletes" ON public."work_order_invoice_reviews" AS PERMISSIVE FOR DELETE TO "authenticated" USING (false);'),
      ('work_order_invoice_reviews', 'wor_no_updates', 'CREATE POLICY "wor_no_updates" ON public."work_order_invoice_reviews" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (false);'),
      ('work_order_invoice_reviews', 'wor_select_profiles', 'CREATE POLICY "wor_select_profiles" ON public."work_order_invoice_reviews" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.shop_id = work_order_invoice_reviews.shop_id)))));'),
      ('work_order_line_ai', 'service-role-manage-work-order-line-ai', 'CREATE POLICY "service-role-manage-work-order-line-ai" ON public."work_order_line_ai" AS PERMISSIVE FOR ALL TO "service_role" USING ((auth.role() = ''service_role''::text)) WITH CHECK ((auth.role() = ''service_role''::text));'),
      ('work_order_line_ai', 'shop-users-read-work-order-line-ai', 'CREATE POLICY "shop-users-read-work-order-line-ai" ON public."work_order_line_ai" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = work_order_line_ai.shop_id)))));'),
      ('work_order_line_dtc_threads', 'dtc_threads_insert_same_shop', 'CREATE POLICY "dtc_threads_insert_same_shop" ON public."work_order_line_dtc_threads" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = work_order_line_dtc_threads.shop_id)))));'),
      ('work_order_line_dtc_threads', 'dtc_threads_select_same_shop', 'CREATE POLICY "dtc_threads_select_same_shop" ON public."work_order_line_dtc_threads" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = work_order_line_dtc_threads.shop_id)))));'),
      ('work_order_line_dtc_threads', 'dtc_threads_update_same_shop', 'CREATE POLICY "dtc_threads_update_same_shop" ON public."work_order_line_dtc_threads" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = work_order_line_dtc_threads.shop_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.shop_id = work_order_line_dtc_threads.shop_id)))));'),
      ('workforce_document_requirements', 'workforce_document_requirements_shop_insert', 'CREATE POLICY "workforce_document_requirements_shop_insert" ON public."workforce_document_requirements" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((shop_id = current_shop_id()));'),
      ('workforce_document_requirements', 'workforce_document_requirements_shop_select', 'CREATE POLICY "workforce_document_requirements_shop_select" ON public."workforce_document_requirements" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((shop_id = current_shop_id()));'),
      ('workforce_document_requirements', 'workforce_document_requirements_shop_update', 'CREATE POLICY "workforce_document_requirements_shop_update" ON public."workforce_document_requirements" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((shop_id = current_shop_id())) WITH CHECK ((shop_id = current_shop_id()));')
    ) AS definitions(table_name, policy_name, definition)
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = item.table_name
        AND p.polname = item.policy_name
    ) THEN
      EXECUTE item.definition;
    END IF;
  END LOOP;
END
$p0_008$;

REVOKE ALL ON TABLE public."agent_actions" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."agent_attachments" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."agent_jobs" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."agent_requests" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."ai_action_previews" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."ai_events" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."ai_evidence_snapshots" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."ai_recommendations" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."ai_suggestion_feedback" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."ai_training_data" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."assets" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."assistant_daily_summaries" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."content_assets" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."content_events" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."content_pieces" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."content_platform_accounts" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."content_publications" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."content_templates" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."dashboard_layouts" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."dashboard_user_layouts" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."expenses" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."fleet_dispatch_assignments" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."fleet_inspection_schedules" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."fleet_pretrip_reports" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."fleet_program_tasks" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."fleet_programs" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."fleet_service_requests" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."fleet_vehicles" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."guided_onboarding_events" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."guided_onboarding_sessions" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."guided_onboarding_steps" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."inspection_result_items" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."inspection_results" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."inspection_smart_match_feedback" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."inspection_smart_match_history" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."inspection_template_suggestions" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."invoice_documents" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."maintenance_rules" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."maintenance_services" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."maintenance_suggestions" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."menu_item_suggestions" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."menu_repair_item_parts" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."menu_repair_item_pricing_parts" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."menu_repair_item_pricing_snapshots" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."menu_repair_items" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."optimization_actions" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."org_members" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."organizations" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."payroll_timecards" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."people_workforce_profiles" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."planner_events" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."planner_runs" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."property_assets" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."property_inspection_signatures" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."property_inspections" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."property_maintenance_requests" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."property_members" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."property_portal_invites" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."property_portfolios" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."property_properties" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."property_request_attachments" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."property_request_events" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."property_units" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."property_vendor_assignments" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."property_vendors" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."quickbooks_connections" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."quickbooks_customer_links" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."quickbooks_sync_events" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."shop_ai_profiles" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."shop_boost_import_provenance" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."shop_boost_import_reset_audit_events" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."shop_boost_intakes" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."shop_boost_integrity_reports" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."shop_boost_review_audit_events" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."shop_boost_review_items" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."shop_boost_row_results" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."shop_brand_assets" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."shop_brand_profiles" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."shop_health_snapshots" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."shop_import_files" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."shop_import_rows" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."shop_maintenance_service_map" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."shop_members" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."shop_onboarding_activation_rules" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."shop_onboarding_attempts" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."shop_onboarding_jobs" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."shop_onboarding_runs" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."shop_parts_import_match_candidates" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."shop_parts_import_staging" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."shop_parts_source_aliases" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."shop_vehicle_menu_items" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."shopreel_drafts" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."shopreel_event_deliveries" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."shopreel_integrations" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."shopreel_manual_assets" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."shopreel_opportunities" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."shopreel_opportunity_status_history" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."shopreel_publications" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."shopreel_publish_jobs" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."shopreel_social_connections" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."shopreel_story_sources" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."staff_certifications" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."staff_invite_candidates" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."staff_invite_suggestions" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."supplier_catalog_items" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."supplier_quote_batch_rows" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."supplier_quote_batches" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."user_theme_preferences" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."vehicle_menus" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."videos" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."work_order_invoice_reviews" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."work_order_line_ai" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."work_order_line_dtc_threads" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."workforce_document_requirements" FROM PUBLIC, anon, authenticated, service_role;

GRANT ALL PRIVILEGES ON TABLE public."agent_actions" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."agent_attachments" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."agent_jobs" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."agent_requests" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."ai_action_previews" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."ai_events" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."ai_evidence_snapshots" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."ai_recommendations" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."ai_suggestion_feedback" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."ai_training_data" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."assets" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."assistant_daily_summaries" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."content_assets" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."content_events" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."content_pieces" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."content_platform_accounts" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."content_publications" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."content_templates" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."dashboard_layouts" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."dashboard_user_layouts" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."expenses" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."fleet_dispatch_assignments" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."fleet_inspection_schedules" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."fleet_pretrip_reports" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."fleet_program_tasks" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."fleet_programs" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."fleet_service_requests" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."fleet_vehicles" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."guided_onboarding_events" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."guided_onboarding_sessions" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."guided_onboarding_steps" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."inspection_result_items" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."inspection_results" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."inspection_smart_match_feedback" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."inspection_smart_match_history" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."inspection_template_suggestions" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."invoice_documents" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."maintenance_rules" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."maintenance_services" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."maintenance_suggestions" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."menu_item_suggestions" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."menu_repair_item_parts" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."menu_repair_item_pricing_parts" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."menu_repair_item_pricing_snapshots" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."menu_repair_items" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."optimization_actions" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."org_members" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."organizations" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."payroll_timecards" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."people_workforce_profiles" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."planner_events" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."planner_runs" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."property_assets" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."property_inspection_signatures" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."property_inspections" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."property_maintenance_requests" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."property_members" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."property_portal_invites" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."property_portfolios" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."property_properties" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."property_request_attachments" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."property_request_events" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."property_units" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."property_vendor_assignments" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."property_vendors" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."quickbooks_connections" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."quickbooks_customer_links" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."quickbooks_sync_events" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."shop_ai_profiles" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."shop_boost_import_provenance" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."shop_boost_import_reset_audit_events" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."shop_boost_intakes" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."shop_boost_integrity_reports" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."shop_boost_review_audit_events" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."shop_boost_review_items" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."shop_boost_row_results" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."shop_brand_assets" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."shop_brand_profiles" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."shop_health_snapshots" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."shop_import_files" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."shop_import_rows" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."shop_maintenance_service_map" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."shop_members" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."shop_onboarding_activation_rules" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."shop_onboarding_attempts" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."shop_onboarding_jobs" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."shop_onboarding_runs" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."shop_parts_import_match_candidates" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."shop_parts_import_staging" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."shop_parts_source_aliases" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."shop_vehicle_menu_items" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."shopreel_drafts" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."shopreel_event_deliveries" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."shopreel_integrations" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."shopreel_manual_assets" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."shopreel_opportunities" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."shopreel_opportunity_status_history" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."shopreel_publications" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."shopreel_publish_jobs" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."shopreel_social_connections" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."shopreel_story_sources" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."staff_certifications" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."staff_invite_candidates" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."staff_invite_suggestions" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."supplier_catalog_items" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."supplier_quote_batch_rows" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."supplier_quote_batches" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."user_theme_preferences" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."vehicle_menus" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."videos" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."work_order_invoice_reviews" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."work_order_line_ai" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."work_order_line_dtc_threads" TO service_role;
GRANT ALL PRIVILEGES ON TABLE public."workforce_document_requirements" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."agent_actions" TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."agent_actions" TO authenticated;
GRANT DELETE, INSERT, SELECT ON TABLE public."agent_attachments" TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public."agent_requests" TO authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE public."ai_action_previews" TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public."ai_events" TO authenticated;
GRANT INSERT, SELECT ON TABLE public."ai_evidence_snapshots" TO authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE public."ai_recommendations" TO authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE public."ai_suggestion_feedback" TO anon;
GRANT INSERT, SELECT, UPDATE ON TABLE public."ai_suggestion_feedback" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."assets" TO authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE public."assistant_daily_summaries" TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public."content_assets" TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public."content_events" TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public."content_pieces" TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public."content_platform_accounts" TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public."content_publications" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."content_templates" TO authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE public."dashboard_layouts" TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public."dashboard_user_layouts" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."expenses" TO authenticated;
GRANT SELECT, DELETE, INSERT, UPDATE ON TABLE public."fleet_dispatch_assignments" TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public."fleet_inspection_schedules" TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public."fleet_pretrip_reports" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."fleet_program_tasks" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."fleet_programs" TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public."fleet_service_requests" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."fleet_vehicles" TO authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE public."guided_onboarding_events" TO authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE public."guided_onboarding_sessions" TO authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE public."guided_onboarding_steps" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."inspection_result_items" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."inspection_results" TO authenticated;
GRANT INSERT, SELECT ON TABLE public."inspection_smart_match_feedback" TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public."inspection_smart_match_history" TO anon;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public."inspection_smart_match_history" TO authenticated;
GRANT SELECT ON TABLE public."inspection_template_suggestions" TO authenticated;
GRANT DELETE, SELECT, UPDATE, INSERT ON TABLE public."invoice_documents" TO authenticated;
GRANT SELECT ON TABLE public."maintenance_rules" TO authenticated;
GRANT SELECT ON TABLE public."maintenance_services" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."maintenance_suggestions" TO authenticated;
GRANT SELECT ON TABLE public."menu_item_suggestions" TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public."menu_repair_item_parts" TO anon;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public."menu_repair_item_parts" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."menu_repair_item_pricing_parts" TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."menu_repair_item_pricing_parts" TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public."menu_repair_item_pricing_snapshots" TO anon;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public."menu_repair_item_pricing_snapshots" TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public."menu_repair_items" TO authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE public."optimization_actions" TO authenticated;
GRANT SELECT ON TABLE public."org_members" TO authenticated;
GRANT SELECT ON TABLE public."organizations" TO authenticated;
GRANT SELECT ON TABLE public."payroll_timecards" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."people_workforce_profiles" TO authenticated;
GRANT INSERT, SELECT ON TABLE public."planner_events" TO authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE public."planner_runs" TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public."property_assets" TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public."property_inspection_signatures" TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public."property_inspections" TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public."property_maintenance_requests" TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public."property_members" TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public."property_portal_invites" TO anon;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public."property_portal_invites" TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public."property_portfolios" TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public."property_properties" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."property_request_attachments" TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."property_request_attachments" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."property_request_events" TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."property_request_events" TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public."property_units" TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public."property_vendor_assignments" TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public."property_vendors" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."quickbooks_connections" TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."quickbooks_connections" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."quickbooks_customer_links" TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."quickbooks_customer_links" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."quickbooks_sync_events" TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."quickbooks_sync_events" TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public."shop_ai_profiles" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."shop_boost_import_provenance" TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."shop_boost_import_provenance" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."shop_boost_import_reset_audit_events" TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."shop_boost_import_reset_audit_events" TO authenticated;
GRANT SELECT ON TABLE public."shop_boost_intakes" TO authenticated;
GRANT SELECT ON TABLE public."shop_boost_integrity_reports" TO authenticated;
GRANT SELECT ON TABLE public."shop_boost_review_audit_events" TO authenticated;
GRANT SELECT ON TABLE public."shop_boost_review_items" TO authenticated;
GRANT SELECT ON TABLE public."shop_boost_row_results" TO authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE public."shop_brand_assets" TO anon;
GRANT INSERT, SELECT, UPDATE ON TABLE public."shop_brand_assets" TO authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE public."shop_brand_profiles" TO anon;
GRANT INSERT, SELECT, UPDATE ON TABLE public."shop_brand_profiles" TO authenticated;
GRANT SELECT ON TABLE public."shop_health_snapshots" TO authenticated;
GRANT SELECT ON TABLE public."shop_import_files" TO authenticated;
GRANT SELECT ON TABLE public."shop_import_rows" TO authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE public."shop_maintenance_service_map" TO anon;
GRANT INSERT, SELECT, UPDATE ON TABLE public."shop_maintenance_service_map" TO authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE public."shop_members" TO authenticated;
GRANT SELECT ON TABLE public."shop_onboarding_activation_rules" TO authenticated;
GRANT SELECT ON TABLE public."shop_onboarding_attempts" TO authenticated;
GRANT SELECT ON TABLE public."shop_onboarding_jobs" TO authenticated;
GRANT SELECT ON TABLE public."shop_onboarding_runs" TO authenticated;
GRANT SELECT ON TABLE public."shop_parts_import_match_candidates" TO authenticated;
GRANT SELECT ON TABLE public."shop_parts_import_staging" TO authenticated;
GRANT SELECT ON TABLE public."shop_parts_source_aliases" TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public."shop_vehicle_menu_items" TO authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE public."shopreel_drafts" TO authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE public."shopreel_event_deliveries" TO anon;
GRANT INSERT, SELECT, UPDATE ON TABLE public."shopreel_event_deliveries" TO authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE public."shopreel_integrations" TO anon;
GRANT INSERT, SELECT, UPDATE ON TABLE public."shopreel_integrations" TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public."shopreel_manual_assets" TO authenticated;
GRANT SELECT, UPDATE ON TABLE public."shopreel_opportunities" TO authenticated;
GRANT INSERT, SELECT ON TABLE public."shopreel_opportunity_status_history" TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public."shopreel_publications" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."shopreel_publish_jobs" TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."shopreel_publish_jobs" TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public."shopreel_social_connections" TO authenticated;
GRANT SELECT ON TABLE public."shopreel_story_sources" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."staff_certifications" TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public."staff_invite_candidates" TO authenticated;
GRANT SELECT ON TABLE public."staff_invite_suggestions" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."supplier_catalog_items" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."supplier_quote_batch_rows" TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."supplier_quote_batch_rows" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."supplier_quote_batches" TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."supplier_quote_batches" TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public."user_theme_preferences" TO authenticated;
GRANT SELECT ON TABLE public."vehicle_menus" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."videos" TO authenticated;
GRANT INSERT, DELETE, UPDATE, SELECT ON TABLE public."work_order_invoice_reviews" TO authenticated;
GRANT SELECT ON TABLE public."work_order_line_ai" TO authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE public."work_order_line_dtc_threads" TO authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE public."workforce_document_requirements" TO authenticated;

REVOKE ALL ON TABLE public."v_menu_repair_item_match_stats" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."v_portal_invoices" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."v_shop_boost_overview" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."v_shop_boost_suggestions" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."v_shop_health_latest" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."v_staff_invites_common" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public."v_work_order_board_cards_shop" FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public."v_menu_repair_item_match_stats" TO authenticated, service_role;
GRANT SELECT ON TABLE public."v_portal_invoices" TO authenticated, service_role;
GRANT SELECT ON TABLE public."v_shop_boost_overview" TO authenticated, service_role;
GRANT SELECT ON TABLE public."v_shop_boost_suggestions" TO authenticated, service_role;
GRANT SELECT ON TABLE public."v_shop_health_latest" TO authenticated, service_role;
GRANT SELECT ON TABLE public."v_staff_invites_common" TO authenticated, service_role;
GRANT SELECT ON TABLE public."v_work_order_board_cards_shop" TO authenticated, service_role;

COMMIT;
