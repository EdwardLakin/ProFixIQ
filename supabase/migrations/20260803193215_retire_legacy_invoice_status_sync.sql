begin;

-- Invoice finalization is owned by finalize_invoice_version. This legacy
-- status trigger independently rebuilt invoice totals from work_order_lines,
-- folded shop supplies into parts, and recursively wrote those stale values
-- back to a financially locked work order.
drop trigger if exists trg_sync_invoice_from_work_order on public.work_orders;

comment on function public.sync_invoice_from_work_order() is
  'Legacy trigger function retained for migration compatibility; no longer attached to work_orders. Invoice issuance is owned by finalize_invoice_version.';

commit;
