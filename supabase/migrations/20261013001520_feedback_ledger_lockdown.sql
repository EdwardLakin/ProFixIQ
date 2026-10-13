-- CONTRACT PHASE: apply only after PR 1854's native Feedback Control app is
-- deployed and the retired authenticated engineering-request routes are gone.
-- Explicit user approval obtained for removing direct browser ledger access.
-- Rows, historical reports, FKs, policies, enums and triggers remain intact.
revoke all on public.agent_requests from public, anon, authenticated;

notify pgrst, 'reload schema';
