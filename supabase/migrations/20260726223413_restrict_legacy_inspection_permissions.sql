begin;

-- Table grants already make the historical mirror read-only. Remove its stale
-- write policies as well so schema introspection cannot imply that application
-- writes remain supported.
drop policy if exists inspection_sessions_insert_auth
  on public.inspection_sessions;
drop policy if exists inspection_sessions_update_complete
  on public.inspection_sessions;
drop policy if exists inspection_sessions_wo_insert
  on public.inspection_sessions;
drop policy if exists inspection_sessions_wo_update
  on public.inspection_sessions;

-- The baseline granted function execution broadly. Revoking PUBLIC does not
-- remove an older explicit anon grant, so name every untrusted role before
-- restoring the server-only finalization contract.
revoke all on function public.finalize_inspection_pdf_atomic(
  uuid, uuid, uuid, bigint, text, text, text
) from public, anon, authenticated;
grant execute on function public.finalize_inspection_pdf_atomic(
  uuid, uuid, uuid, bigint, text, text, text
) to service_role;

notify pgrst, 'reload schema';

commit;
