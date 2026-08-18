-- Production hardening: close direct Data API execution of high-risk
-- SECURITY DEFINER mutation functions that are not anonymous workflows.
--
-- This is intentionally narrow. Public portal enrollment/booking RPCs are not
-- touched here because their anonymous access is part of a separate contract
-- and must be reviewed independently.

-- Internal agent queue workers are service-role only. The function performs no
-- caller authentication and returns a claimed job payload while mutating the
-- queue, so neither anon nor ordinary authenticated sessions may execute it.
revoke execute on function public.agent_claim_next_job(text, public.agent_job_kind[])
  from public, anon, authenticated;
grant execute on function public.agent_claim_next_job(text, public.agent_job_kind[])
  to service_role;

-- Financial correction-session primitives are server-side commands. Their
-- current production ACL already excludes authenticated but accidentally
-- leaves anon executable; keep the intended service-role-only boundary.
revoke execute on function public.open_work_order_correction_session(
  uuid, uuid, uuid, text, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.open_work_order_correction_session(
  uuid, uuid, uuid, text, text, text, jsonb
) to service_role;

revoke execute on function public.close_work_order_correction_session(
  uuid, uuid, uuid, uuid, jsonb
) from public, anon, authenticated;
grant execute on function public.close_work_order_correction_session(
  uuid, uuid, uuid, uuid, jsonb
) to service_role;

-- Punch correction is also a server-side command. The function validates the
-- supplied actor profile's role, but does not bind that supplied UUID to
-- auth.uid(). The application route already calls it with the service-role
-- client after canManageScheduling authorization, so direct Data API access by
-- ordinary authenticated users is unnecessary and would permit actor spoofing.
revoke execute on function public.apply_punch_correction(
  uuid, uuid, uuid, timestamptz, text
) from public, anon, authenticated;
grant execute on function public.apply_punch_correction(
  uuid, uuid, uuid, timestamptz, text
) to service_role;

-- Authenticated staff workflows below bind their actor identity in the
-- function body and may remain callable by authenticated sessions.
revoke execute on function public.replace_staff_schedule_template(
  uuid, uuid, uuid, jsonb
) from public, anon;
grant execute on function public.replace_staff_schedule_template(
  uuid, uuid, uuid, jsonb
) to authenticated, service_role;

revoke execute on function public.transition_staff_time_off_request(
  uuid, uuid, uuid, text, text
) from public, anon;
grant execute on function public.transition_staff_time_off_request(
  uuid, uuid, uuid, text, text
) to authenticated, service_role;

revoke execute on function public.parts_void_work_order_line_atomic(
  uuid, uuid, text, text, text, text, text, text, text, text, uuid
) from public, anon;
grant execute on function public.parts_void_work_order_line_atomic(
  uuid, uuid, text, text, text, text, text, text, text, text, uuid
) to authenticated, service_role;

-- Customer intake requires auth.uid() in the function body. Remove the legacy
-- PUBLIC execute grant so the database privilege matches that contract.
revoke execute on function public.work_orders_set_intake(uuid, jsonb, boolean)
  from public, anon;
grant execute on function public.work_orders_set_intake(uuid, jsonb, boolean)
  to authenticated, service_role;

-- Replay-time privilege assertions. These fail closed if a future baseline or
-- default grant re-exposes a protected mutation surface.
do $$
begin
  if has_function_privilege(
       'anon',
       'public.agent_claim_next_job(text,public.agent_job_kind[])',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'public.agent_claim_next_job(text,public.agent_job_kind[])',
       'EXECUTE'
     )
     or not has_function_privilege(
       'service_role',
       'public.agent_claim_next_job(text,public.agent_job_kind[])',
       'EXECUTE'
     ) then
    raise exception 'RPC hardening failed: agent_claim_next_job ACL is unsafe';
  end if;

  if has_function_privilege(
       'anon',
       'public.open_work_order_correction_session(uuid,uuid,uuid,text,text,text,jsonb)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'public.open_work_order_correction_session(uuid,uuid,uuid,text,text,text,jsonb)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'service_role',
       'public.open_work_order_correction_session(uuid,uuid,uuid,text,text,text,jsonb)',
       'EXECUTE'
     ) then
    raise exception 'RPC hardening failed: open correction-session ACL is unsafe';
  end if;

  if has_function_privilege(
       'anon',
       'public.close_work_order_correction_session(uuid,uuid,uuid,uuid,jsonb)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'public.close_work_order_correction_session(uuid,uuid,uuid,uuid,jsonb)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'service_role',
       'public.close_work_order_correction_session(uuid,uuid,uuid,uuid,jsonb)',
       'EXECUTE'
     ) then
    raise exception 'RPC hardening failed: close correction-session ACL is unsafe';
  end if;

  if has_function_privilege(
       'anon',
       'public.apply_punch_correction(uuid,uuid,uuid,timestamptz,text)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'public.apply_punch_correction(uuid,uuid,uuid,timestamptz,text)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'service_role',
       'public.apply_punch_correction(uuid,uuid,uuid,timestamptz,text)',
       'EXECUTE'
     ) then
    raise exception 'RPC hardening failed: punch correction ACL is unsafe';
  end if;

  if has_function_privilege(
       'anon',
       'public.replace_staff_schedule_template(uuid,uuid,uuid,jsonb)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'authenticated',
       'public.replace_staff_schedule_template(uuid,uuid,uuid,jsonb)',
       'EXECUTE'
     )
     or has_function_privilege(
       'anon',
       'public.transition_staff_time_off_request(uuid,uuid,uuid,text,text)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'authenticated',
       'public.transition_staff_time_off_request(uuid,uuid,uuid,text,text)',
       'EXECUTE'
     )
     or has_function_privilege(
       'anon',
       'public.parts_void_work_order_line_atomic(uuid,uuid,text,text,text,text,text,text,text,text,uuid)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'authenticated',
       'public.parts_void_work_order_line_atomic(uuid,uuid,text,text,text,text,text,text,text,text,uuid)',
       'EXECUTE'
     )
     or has_function_privilege(
       'anon',
       'public.work_orders_set_intake(uuid,jsonb,boolean)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'authenticated',
       'public.work_orders_set_intake(uuid,jsonb,boolean)',
       'EXECUTE'
     ) then
    raise exception 'RPC hardening failed: authenticated mutation ACL contract changed';
  end if;
end
$$;
