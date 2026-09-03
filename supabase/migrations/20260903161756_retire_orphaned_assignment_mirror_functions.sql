begin;

-- The trigger bindings were retired by 20260903143801. These two historical
-- trigger functions have no remaining dependents and are absent from the
-- canonical migration chain, so remove the production-only schema artifacts.
-- Omitting CASCADE makes this migration fail safely if a dependency is added.
drop function if exists public.sync_work_order_line_assignee();
drop function if exists public.fn_wol_sync_assigned_to();

commit;
