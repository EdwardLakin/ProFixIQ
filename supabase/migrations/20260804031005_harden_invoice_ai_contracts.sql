begin;

-- The application records AI-learning activity as `training.event` and
-- stores the narrower invoice-review label in the payload. Preserve the
-- existing event taxonomy while admitting that canonical event type.
alter table public.ai_events
  drop constraint if exists ai_events_event_type_check;

alter table public.ai_events
  add constraint ai_events_event_type_check
  check (
    event_type = any (
      array[
        'quote_created',
        'quote_updated',
        'work_order_created',
        'work_order_updated',
        'inspection_created',
        'inspection_updated',
        'booking_created',
        'booking_updated',
        'message',
        'customer_added',
        'vehicle_added',
        'parts_added',
        'labor_added',
        'fleet_pretrip_submitted',
        'fleet_pm_due',
        'fleet_request_created',
        'fleet_work_deferred',
        'fleet_work_declined',
        'fleet_work_completed',
        'training.event'
      ]::text[]
    )
  ) not valid;

alter table public.ai_events
  validate constraint ai_events_event_type_check;

-- These views expose tenant-scoped data and must evaluate the underlying
-- tables' RLS policies as the caller, never as the view owner.
alter view public.invoice_net_issued_parts
  set (security_invoker = true);
alter view public.v_work_order_line_labor_rollups
  set (security_invoker = true);

revoke all on public.invoice_net_issued_parts from public, anon;
revoke all on public.v_work_order_line_labor_rollups from public, anon;
grant select on public.invoice_net_issued_parts to authenticated, service_role;
grant select on public.v_work_order_line_labor_rollups to authenticated, service_role;

-- Financial mutations are invoked only after server-side authorization with
-- the service-role client. Remove the inherited PUBLIC/anon execution path.
revoke all on function public.post_payment_event(
  uuid,uuid,uuid,text,numeric,text,text,text,text,text,text,uuid,timestamptz,jsonb
) from public, anon, authenticated;
grant execute on function public.post_payment_event(
  uuid,uuid,uuid,text,numeric,text,text,text,text,text,text,uuid,timestamptz,jsonb
) to service_role;

revoke all on function public.void_invoice_version(uuid,uuid,uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.void_invoice_version(uuid,uuid,uuid,text,text)
  to service_role;

-- This compatibility RPC has no caller authorization and no application
-- consumers. Keep it for server-side compatibility without exposing it.
revoke all on function public.get_invoice_net_issued_parts(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.get_invoice_net_issued_parts(uuid,uuid)
  to service_role;

revoke all on function public.recompute_live_invoice_costs(uuid)
  from public, anon, authenticated;
grant execute on function public.recompute_live_invoice_costs(uuid)
  to service_role;

-- Trigger functions are internal database implementation details, not RPCs.
revoke all on function public.link_superseded_invoice_version()
  from public, anon, authenticated;
revoke all on function public.sync_invoice_version_financial_rollup()
  from public, anon, authenticated;
grant execute on function public.link_superseded_invoice_version()
  to service_role;
grant execute on function public.sync_invoice_version_financial_rollup()
  to service_role;

-- Pin the lookup path for invoice functions flagged by Security Advisor.
-- Every referenced relation/function is schema-qualified, while pg_catalog
-- remains implicitly available.
alter function public.compute_labor_cost_for_work_order(uuid)
  set search_path = '';
alter function public.compute_parts_cost_for_work_order(uuid)
  set search_path = '';
alter function public.enforce_invoice_amount_consistency()
  set search_path = '';
alter function public.enforce_invoice_lifecycle()
  set search_path = '';
alter function public.enforce_invoice_work_order_for_active_invoices()
  set search_path = '';
alter function public.get_live_invoice_id(uuid)
  set search_path = '';
alter function public.get_invoice_net_issued_parts(uuid,uuid)
  set search_path = '';
alter function public.invoice_is_historical_import(jsonb)
  set search_path = '';
alter function public.invoice_is_locked(text,timestamptz)
  set search_path = '';
alter function public.invoices_sync_work_orders_aiu()
  set search_path = '';
alter function public.link_superseded_invoice_version()
  set search_path = '';
alter function public.post_payment_event(
  uuid,uuid,uuid,text,numeric,text,text,text,text,text,text,uuid,timestamptz,jsonb
) set search_path = '';
alter function public.recompute_live_invoice_costs(uuid)
  set search_path = '';
alter function public.sync_invoice_from_work_order()
  set search_path = '';
alter function public.sync_invoice_from_work_order(uuid)
  set search_path = '';
alter function public.sync_invoice_version_financial_rollup()
  set search_path = '';
alter function public.tg_invoices_compute_totals()
  set search_path = '';
alter function public.tg_invoices_sync_work_orders()
  set search_path = '';
alter function public.void_invoice_version(uuid,uuid,uuid,text,text)
  set search_path = '';
alter function public.wo_alloc_recompute_invoice_aiu()
  set search_path = '';
alter function public.wol_recompute_invoice_aiu()
  set search_path = '';

commit;
