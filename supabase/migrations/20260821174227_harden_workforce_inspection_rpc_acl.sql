begin;

set local lock_timeout = '5s';
set local statement_timeout = '10min';

-- Production hardening: remove anonymous Data API execution from the six
-- approved SECURITY DEFINER mutation functions. Preserve the existing
-- authenticated and service-role execution contracts for every signature.
revoke execute on function public.correct_work_order_line_labor_segment(
  uuid, uuid, text, uuid, uuid, uuid, timestamptz, timestamptz, text
) from public, anon;
grant execute on function public.correct_work_order_line_labor_segment(
  uuid, uuid, text, uuid, uuid, uuid, timestamptz, timestamptz, text
) to authenticated, service_role;

revoke execute on function public.replace_work_order_line_flat_rate_credits(
  uuid, uuid, uuid, jsonb, text
) from public, anon;
grant execute on function public.replace_work_order_line_flat_rate_credits(
  uuid, uuid, uuid, jsonb, text
) to authenticated, service_role;

revoke execute on function public.submit_staff_time_off_request(
  uuid, uuid, uuid, text, timestamptz, timestamptz, boolean, text
) from public, anon;
grant execute on function public.submit_staff_time_off_request(
  uuid, uuid, uuid, text, timestamptz, timestamptz, boolean, text
) to authenticated, service_role;

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

-- Fail closed during clean replay if a future baseline or default grant
-- reopens anonymous execution or removes either preserved execution contract.
do $$
declare
  signature text;
  protected_signatures constant text[] := array[
    'public.correct_work_order_line_labor_segment(uuid,uuid,text,uuid,uuid,uuid,timestamptz,timestamptz,text)',
    'public.replace_work_order_line_flat_rate_credits(uuid,uuid,uuid,jsonb,text)',
    'public.submit_staff_time_off_request(uuid,uuid,uuid,text,timestamptz,timestamptz,boolean,text)',
    'public.save_inspection_progress_atomic(uuid,uuid,uuid,jsonb,text,timestamptz)',
    'public.save_inspection_progress_v2_atomic(uuid,uuid,uuid,jsonb,text,timestamptz)',
    'public.save_inspection_progress_v3_atomic(uuid,uuid,uuid,jsonb,text,timestamptz)'
  ];
begin
  foreach signature in array protected_signatures loop
    if to_regprocedure(signature) is null then
      raise exception 'RPC hardening failed: missing function %', signature;
    end if;

    if has_function_privilege('anon', signature, 'EXECUTE')
       or not has_function_privilege('authenticated', signature, 'EXECUTE')
       or not has_function_privilege('service_role', signature, 'EXECUTE') then
      raise exception 'RPC hardening failed: unsafe execution ACL for %', signature;
    end if;
  end loop;
end
$$;

notify pgrst, 'reload schema';

commit;
