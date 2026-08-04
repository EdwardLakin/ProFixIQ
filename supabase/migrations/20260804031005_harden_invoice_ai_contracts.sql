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

-- Invoice exports are audited against the immutable issued version. Align
-- that canonical entity name with the QuickBooks event contract while
-- retaining every existing integration event type.
alter table public.quickbooks_sync_events
  drop constraint if exists quickbooks_sync_events_entity_type_check;

alter table public.quickbooks_sync_events
  add constraint quickbooks_sync_events_entity_type_check
  check (
    entity_type = any (
      array[
        'connection',
        'customer',
        'invoice',
        'invoice_version',
        'item',
        'token'
      ]::text[]
    )
  ) not valid;

alter table public.quickbooks_sync_events
  validate constraint quickbooks_sync_events_entity_type_check;

-- These views expose tenant-scoped data and must evaluate the underlying
-- tables' RLS policies as the caller, never as the view owner.
alter view public.invoice_net_issued_parts
  set (security_invoker = true);

revoke all on public.invoice_net_issued_parts from public, anon;
grant select on public.invoice_net_issued_parts to authenticated, service_role;

-- This view exists in production but is not part of the clean migration
-- history. Harden it where present without making clean database replay depend
-- on production-only schema drift.
do $block$
begin
  if to_regclass('public.v_work_order_line_labor_rollups') is not null then
    execute 'alter view public.v_work_order_line_labor_rollups set (security_invoker = true)';
    execute 'revoke all on public.v_work_order_line_labor_rollups from public, anon';
    execute 'grant select on public.v_work_order_line_labor_rollups to authenticated, service_role';
  end if;
end
$block$;

-- Financial mutations are invoked only after server-side authorization with
-- the service-role client. Remove the inherited PUBLIC/anon execution path.
-- Some helpers exist only in production because of historical schema drift.
-- Apply the intended boundary wherever each signature is present.
do $block$
declare
  v_signature text;
begin
  foreach v_signature in array array[
    'public.post_payment_event(uuid,uuid,uuid,text,numeric,text,text,text,text,text,text,uuid,timestamp with time zone,jsonb)',
    'public.void_invoice_version(uuid,uuid,uuid,text,text)',
    'public.get_invoice_net_issued_parts(uuid,uuid)',
    'public.recompute_live_invoice_costs(uuid)',
    'public.link_superseded_invoice_version()',
    'public.sync_invoice_version_financial_rollup()'
  ] loop
    if to_regprocedure(v_signature) is not null then
      execute format(
        'revoke all on function %s from public, anon, authenticated',
        v_signature
      );
      execute format(
        'grant execute on function %s to service_role',
        v_signature
      );
    end if;
  end loop;
end
$block$;

-- Pin the lookup path for invoice functions flagged by Security Advisor.
-- Every referenced relation/function is schema-qualified, while pg_catalog
-- remains implicitly available.
do $block$
declare
  v_signature text;
begin
  foreach v_signature in array array[
    'public.compute_labor_cost_for_work_order(uuid)',
    'public.compute_parts_cost_for_work_order(uuid)',
    'public.enforce_invoice_amount_consistency()',
    'public.enforce_invoice_lifecycle()',
    'public.enforce_invoice_work_order_for_active_invoices()',
    'public.get_live_invoice_id(uuid)',
    'public.get_invoice_net_issued_parts(uuid,uuid)',
    'public.invoice_is_historical_import(jsonb)',
    'public.invoice_is_locked(text,timestamp with time zone)',
    'public.invoices_sync_work_orders_aiu()',
    'public.link_superseded_invoice_version()',
    'public.post_payment_event(uuid,uuid,uuid,text,numeric,text,text,text,text,text,text,uuid,timestamp with time zone,jsonb)',
    'public.recompute_live_invoice_costs(uuid)',
    'public.sync_invoice_from_work_order()',
    'public.sync_invoice_from_work_order(uuid)',
    'public.sync_invoice_version_financial_rollup()',
    'public.tg_invoices_compute_totals()',
    'public.tg_invoices_sync_work_orders()',
    'public.void_invoice_version(uuid,uuid,uuid,text,text)',
    'public.wo_alloc_recompute_invoice_aiu()',
    'public.wol_recompute_invoice_aiu()'
  ] loop
    if to_regprocedure(v_signature) is not null then
      execute format(
        'alter function %s set search_path = %L',
        v_signature,
        ''
      );
    end if;
  end loop;
end
$block$;

commit;
