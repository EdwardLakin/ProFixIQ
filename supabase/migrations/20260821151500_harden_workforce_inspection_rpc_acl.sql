begin;

set local lock_timeout = '5s';
set local statement_timeout = '10min';

-- Production hardening: keep manager-only workforce mutations behind their
-- capability-gated server routes. These SECURITY DEFINER functions accept a
-- supplied actor profile id and only compare it to auth.uid() when auth.uid()
-- is non-null. Anonymous Data API callers can therefore bypass that comparison
-- and impersonate a known privileged profile. The application routes already
-- authorize the caller and invoke these RPCs with the service-role client, so
-- direct anon/authenticated execution is unnecessary.
revoke execute on function public.correct_work_order_line_labor_segment(
  uuid, uuid, text, uuid, uuid, uuid, timestamptz, timestamptz, text
) from public, anon, authenticated;
grant execute on function public.correct_work_order_line_labor_segment(
  uuid, uuid, text, uuid, uuid, uuid, timestamptz, timestamptz, text
) to service_role;

revoke execute on function public.replace_work_order_line_flat_rate_credits(
  uuid, uuid, uuid, jsonb, text
) from public, anon, authenticated;
grant execute on function public.replace_work_order_line_flat_rate_credits(
  uuid, uuid, uuid, jsonb, text
) to service_role;

revoke execute on function public.submit_staff_time_off_request(
  uuid, uuid, uuid, text, timestamptz, timestamptz, boolean, text
) from public, anon, authenticated;
grant execute on function public.submit_staff_time_off_request(
  uuid, uuid, uuid, text, timestamptz, timestamptz, boolean, text
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
       'public.replace_work_order_line_flat_rate_credits(uuid,uuid,uuid,jsonb,text)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'public.replace_work_order_line_flat_rate_credits(uuid,uuid,uuid,jsonb,text)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'service_role',
       'public.replace_work_order_line_flat_rate_credits(uuid,uuid,uuid,jsonb,text)',
       'EXECUTE'
     ) then
    raise exception 'RPC hardening failed: flat-rate credit ACL is unsafe';
  end if;

  if has_function_privilege(
       'anon',
       'public.submit_staff_time_off_request(uuid,uuid,uuid,text,timestamptz,timestamptz,boolean,text)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'public.submit_staff_time_off_request(uuid,uuid,uuid,text,timestamptz,timestamptz,boolean,text)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'service_role',
       'public.submit_staff_time_off_request(uuid,uuid,uuid,text,timestamptz,timestamptz,boolean,text)',
       'EXECUTE'
     ) then
    raise exception 'RPC hardening failed: time-off request ACL is unsafe';
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
