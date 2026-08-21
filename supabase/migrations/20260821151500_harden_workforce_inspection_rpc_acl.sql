begin;

set local lock_timeout = '5s';
set local statement_timeout = '10min';

-- Production hardening: keep manager-only labor corrections behind the
-- capability-gated server route. The SECURITY DEFINER function accepts a
-- supplied actor profile id and only compares it to auth.uid() when auth.uid()
-- is non-null. Anonymous Data API callers can therefore bypass that comparison
-- and impersonate a known owner/admin/manager profile. The application route
-- already authorizes canReviewWorkforceTime and invokes this RPC with the
-- service-role client, so direct anon/authenticated execution is unnecessary.
revoke execute on function public.correct_work_order_line_labor_segment(
  uuid, uuid, text, uuid, uuid, uuid, timestamptz, timestamptz, text
) from public, anon, authenticated;
grant execute on function public.correct_work_order_line_labor_segment(
  uuid, uuid, text, uuid, uuid, uuid, timestamptz, timestamptz, text
) to service_role;

-- Canonical inspection autosave is a staff workflow. Each version intentionally
-- permits service-role recovery calls with auth.uid() = null, but that same
-- branch must not be reachable by the anonymous Data API role. Preserve direct
-- authenticated usage for the canonical save route and remove anonymous/public
-- execution from all writer generations so an anonymous caller cannot supply a
-- known profile UUID and write another shop's inspection progress.
revoke execute on function public.save_inspection_progress_atomic(
  uuid, uuid, uuid, jsonb, text, timestamptz
) from public, anon;
grant execute on function public.save_inspection_progress_atomic(
  uuid, uuid, uuid, jsonb, text, timestamptz
) to authenticated, service_role;

revoke execute on function public.save_inspection_progress_v2_atomic(
  uuid, uuid, uuid, jsonb, text, timestamptz
) from public, anon;
grant execute on function public.save_inspection_progress_v2_atomic(
  uuid, uuid, uuid, jsonb, text, timestamptz
) to authenticated, service_role;

revoke execute on function public.save_inspection_progress_v3_atomic(
  uuid, uuid, uuid, jsonb, text, timestamptz
) from public, anon;
grant execute on function public.save_inspection_progress_v3_atomic(
  uuid, uuid, uuid, jsonb, text, timestamptz
) to authenticated, service_role;

-- Fail closed during clean replay if a future baseline/default grant reopens
-- either boundary.
do $$
begin
  if has_function_privilege(
       'anon',
       'public.correct_work_order_line_labor_segment(uuid,uuid,text,uuid,uuid,uuid,timestamptz,timestamptz,text)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'public.correct_work_order_line_labor_segment(uuid,uuid,text,uuid,uuid,uuid,timestamptz,timestamptz,text)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'service_role',
       'public.correct_work_order_line_labor_segment(uuid,uuid,text,uuid,uuid,uuid,timestamptz,timestamptz,text)',
       'EXECUTE'
     ) then
    raise exception 'RPC hardening failed: job-time correction ACL is unsafe';
  end if;

  if has_function_privilege(
       'anon',
       'public.save_inspection_progress_atomic(uuid,uuid,uuid,jsonb,text,timestamptz)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'authenticated',
       'public.save_inspection_progress_atomic(uuid,uuid,uuid,jsonb,text,timestamptz)',
       'EXECUTE'
     )
     or has_function_privilege(
       'anon',
       'public.save_inspection_progress_v2_atomic(uuid,uuid,uuid,jsonb,text,timestamptz)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'authenticated',
       'public.save_inspection_progress_v2_atomic(uuid,uuid,uuid,jsonb,text,timestamptz)',
       'EXECUTE'
     )
     or has_function_privilege(
       'anon',
       'public.save_inspection_progress_v3_atomic(uuid,uuid,uuid,jsonb,text,timestamptz)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'authenticated',
       'public.save_inspection_progress_v3_atomic(uuid,uuid,uuid,jsonb,text,timestamptz)',
       'EXECUTE'
     ) then
    raise exception 'RPC hardening failed: inspection progress writer ACL is unsafe';
  end if;
end
$$;

notify pgrst, 'reload schema';

commit;
