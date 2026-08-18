begin;

set local lock_timeout = '5s';
set local statement_timeout = '10min';

-- Production hardening: close direct Data API execution of high-risk
-- SECURITY DEFINER mutation functions that are not anonymous workflows.
--
-- This is intentionally narrow. Public portal enrollment/booking RPCs are not
-- touched here because their anonymous access is part of a separate contract
-- and must be reviewed independently.

-- Internal agent queue workers are service-role only. This RPC is a
-- production-only legacy object and is intentionally absent from clean replay,
-- so harden it when present without reintroducing it into the baseline.
do $$
declare
  v_agent regprocedure;
begin
  select p.oid::regprocedure
    into v_agent
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'agent_claim_next_job'
  order by p.oid
  limit 1;

  if v_agent is not null then
    execute format(
      'revoke execute on function %s from public, anon, authenticated',
      v_agent
    );
    execute format(
      'grant execute on function %s to service_role',
      v_agent
    );
  end if;
end
$$;

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

-- Work-order line voiding is likewise kept behind the authorized server route.
-- The RPC accepts shop, actor and aggregate UUIDs and its SECURITY DEFINER body
-- does not bind those inputs to auth.uid(). The route now performs the
-- canManageWorkOrders check first and invokes this command with service_role.
revoke execute on function public.parts_void_work_order_line_atomic(
  uuid, uuid, text, text, text, text, text, text, text, text, uuid
) from public, anon, authenticated;
grant execute on function public.parts_void_work_order_line_atomic(
  uuid, uuid, text, text, text, text, text, text, text, text, uuid
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

-- Customer intake requires auth.uid() in the function body. Production has a
-- legacy helper that is intentionally absent from the ordered clean-replay
-- baseline, so align its ACL when present without recreating the function.
do $$
declare
  v_intake regprocedure;
begin
  select p.oid::regprocedure
    into v_intake
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'work_orders_set_intake'
    and pg_catalog.oidvectortypes(p.proargtypes) = 'uuid, jsonb, boolean'
  limit 1;

  if v_intake is not null then
    execute format(
      'revoke execute on function %s from public, anon',
      v_intake
    );
    execute format(
      'grant execute on function %s to authenticated, service_role',
      v_intake
    );
  end if;
end
$$;

-- Replay-time privilege assertions. These fail closed if a future baseline or
-- default grant re-exposes a protected mutation surface. Production-only
-- legacy helpers are asserted when present and skipped on clean replay.
do $$
declare
  v_agent regprocedure;
  v_intake regprocedure;
begin
  select p.oid::regprocedure
    into v_agent
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'agent_claim_next_job'
  order by p.oid
  limit 1;

  select p.oid::regprocedure
    into v_intake
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'work_orders_set_intake'
    and pg_catalog.oidvectortypes(p.proargtypes) = 'uuid, jsonb, boolean'
  limit 1;

  if v_agent is not null and (
       has_function_privilege('anon', v_agent, 'EXECUTE')
       or has_function_privilege('authenticated', v_agent, 'EXECUTE')
       or not has_function_privilege('service_role', v_agent, 'EXECUTE')
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
       'public.parts_void_work_order_line_atomic(uuid,uuid,text,text,text,text,text,text,text,text,uuid)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'public.parts_void_work_order_line_atomic(uuid,uuid,text,text,text,text,text,text,text,text,uuid)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'service_role',
       'public.parts_void_work_order_line_atomic(uuid,uuid,text,text,text,text,text,text,text,text,uuid)',
       'EXECUTE'
     ) then
    raise exception 'RPC hardening failed: line void ACL is unsafe';
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
     ) then
    raise exception 'RPC hardening failed: authenticated mutation ACL contract changed';
  end if;

  if v_intake is not null and (
       has_function_privilege('anon', v_intake, 'EXECUTE')
       or not has_function_privilege(
         'authenticated',
         v_intake,
         'EXECUTE'
       )
       or not has_function_privilege('service_role', v_intake, 'EXECUTE')
     ) then
    raise exception 'RPC hardening failed: work_orders_set_intake ACL is unsafe';
  end if;
end
$$;

notify pgrst, 'reload schema';

commit;
