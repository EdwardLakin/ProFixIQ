begin;

-- These established approval engines predate caller binding. Keep their
-- behavior intact behind private, non-executable cores, then restore the
-- public signatures with an authorization check that runs before idempotency
-- receipts or tenant data can be read.
alter function public.apply_portal_line_decision_atomic(
  uuid, uuid, uuid, uuid, uuid, text, text, timestamptz
) rename to apply_portal_line_decision_unbound_core;

alter function public.apply_portal_line_decision_unbound_core(
  uuid, uuid, uuid, uuid, uuid, text, text, timestamptz
) set schema private;

alter function public.apply_approval_compatibility_bundle_atomic(
  uuid, uuid, uuid, uuid, uuid[], uuid[], uuid[], uuid[], text, text, timestamptz
) rename to apply_approval_compatibility_bundle_unbound_core;

alter function public.apply_approval_compatibility_bundle_unbound_core(
  uuid, uuid, uuid, uuid, uuid[], uuid[], uuid[], uuid[], text, text, timestamptz
) set schema private;

revoke all on function private.apply_portal_line_decision_unbound_core(
  uuid, uuid, uuid, uuid, uuid, text, text, timestamptz
) from public, anon, authenticated, service_role;

revoke all on function private.apply_approval_compatibility_bundle_unbound_core(
  uuid, uuid, uuid, uuid, uuid[], uuid[], uuid[], uuid[], text, text, timestamptz
) from public, anon, authenticated, service_role;

create function public.apply_portal_line_decision_atomic(
  p_shop_id uuid,
  p_customer_id uuid,
  p_work_order_id uuid,
  p_line_id uuid,
  p_actor_user_id uuid,
  p_decision text,
  p_operation_key text,
  p_at timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not public.scheduler_actor_matches(p_actor_user_id) then
    raise exception using
      errcode = '42501',
      message = 'Authenticated approval actor mismatch.';
  end if;

  return private.apply_portal_line_decision_unbound_core(
    p_shop_id,
    p_customer_id,
    p_work_order_id,
    p_line_id,
    p_actor_user_id,
    p_decision,
    p_operation_key,
    p_at
  );
end;
$$;

create function public.apply_approval_compatibility_bundle_atomic(
  p_shop_id uuid,
  p_work_order_id uuid,
  p_customer_id uuid,
  p_actor_user_id uuid,
  p_approved_line_ids uuid[],
  p_declined_line_ids uuid[],
  p_approved_quote_line_ids uuid[],
  p_declined_quote_line_ids uuid[],
  p_signature_url text,
  p_operation_key text,
  p_at timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not public.scheduler_actor_matches(p_actor_user_id) then
    raise exception using
      errcode = '42501',
      message = 'Authenticated approval actor mismatch.';
  end if;

  return private.apply_approval_compatibility_bundle_unbound_core(
    p_shop_id,
    p_work_order_id,
    p_customer_id,
    p_actor_user_id,
    p_approved_line_ids,
    p_declined_line_ids,
    p_approved_quote_line_ids,
    p_declined_quote_line_ids,
    p_signature_url,
    p_operation_key,
    p_at
  );
end;
$$;

revoke all on function public.apply_portal_line_decision_atomic(
  uuid, uuid, uuid, uuid, uuid, text, text, timestamptz
) from public, anon;
grant execute on function public.apply_portal_line_decision_atomic(
  uuid, uuid, uuid, uuid, uuid, text, text, timestamptz
) to authenticated, service_role;

revoke all on function public.apply_approval_compatibility_bundle_atomic(
  uuid, uuid, uuid, uuid, uuid[], uuid[], uuid[], uuid[], text, text, timestamptz
) from public, anon;
grant execute on function public.apply_approval_compatibility_bundle_atomic(
  uuid, uuid, uuid, uuid, uuid[], uuid[], uuid[], uuid[], text, text, timestamptz
) to authenticated, service_role;

comment on function public.apply_portal_line_decision_atomic(
  uuid, uuid, uuid, uuid, uuid, text, text, timestamptz
) is
  'Applies a portal line decision after binding authenticated callers to the supplied auth subject or linked canonical profile; trusted service-role calls remain available.';

comment on function public.apply_approval_compatibility_bundle_atomic(
  uuid, uuid, uuid, uuid, uuid[], uuid[], uuid[], uuid[], text, text, timestamptz
) is
  'Applies the compatibility approval bundle after binding authenticated callers to the supplied auth subject or linked canonical profile; trusted service-role calls remain available.';

do $approval_actor_binding_postcheck$
declare
  v_portal_wrapper regprocedure := to_regprocedure(
    'public.apply_portal_line_decision_atomic(uuid,uuid,uuid,uuid,uuid,text,text,timestamptz)'
  );
  v_bundle_wrapper regprocedure := to_regprocedure(
    'public.apply_approval_compatibility_bundle_atomic(uuid,uuid,uuid,uuid,uuid[],uuid[],uuid[],uuid[],text,text,timestamptz)'
  );
  v_portal_core regprocedure := to_regprocedure(
    'private.apply_portal_line_decision_unbound_core(uuid,uuid,uuid,uuid,uuid,text,text,timestamptz)'
  );
  v_bundle_core regprocedure := to_regprocedure(
    'private.apply_approval_compatibility_bundle_unbound_core(uuid,uuid,uuid,uuid,uuid[],uuid[],uuid[],uuid[],text,text,timestamptz)'
  );
  v_portal_definition text;
  v_bundle_definition text;
begin
  if v_portal_wrapper is null or v_bundle_wrapper is null
     or v_portal_core is null or v_bundle_core is null then
    raise exception 'Approval actor binding migration did not preserve every wrapper and private core';
  end if;

  if has_function_privilege('anon', v_portal_wrapper, 'EXECUTE')
     or has_function_privilege('anon', v_bundle_wrapper, 'EXECUTE') then
    raise exception 'Anonymous approval execution remains enabled';
  end if;

  if not has_function_privilege('authenticated', v_portal_wrapper, 'EXECUTE')
     or not has_function_privilege('authenticated', v_bundle_wrapper, 'EXECUTE')
     or not has_function_privilege('service_role', v_portal_wrapper, 'EXECUTE')
     or not has_function_privilege('service_role', v_bundle_wrapper, 'EXECUTE') then
    raise exception 'Established authenticated or service approval execution was not preserved';
  end if;

  if has_function_privilege('authenticated', v_portal_core, 'EXECUTE')
     or has_function_privilege('authenticated', v_bundle_core, 'EXECUTE')
     or has_function_privilege('service_role', v_portal_core, 'EXECUTE')
     or has_function_privilege('service_role', v_bundle_core, 'EXECUTE') then
    raise exception 'A private unbound approval core remains directly executable';
  end if;

  select pg_get_functiondef(v_portal_wrapper) into v_portal_definition;
  select pg_get_functiondef(v_bundle_wrapper) into v_bundle_definition;

  if position('public.scheduler_actor_matches' in v_portal_definition) = 0
     or position('public.scheduler_actor_matches' in v_portal_definition) >
        position('private.apply_portal_line_decision_unbound_core' in v_portal_definition)
     or position('public.scheduler_actor_matches' in v_bundle_definition) = 0
     or position('public.scheduler_actor_matches' in v_bundle_definition) >
        position('private.apply_approval_compatibility_bundle_unbound_core' in v_bundle_definition) then
    raise exception 'Approval actor binding does not precede private engine execution';
  end if;
end;
$approval_actor_binding_postcheck$;

notify pgrst, 'reload schema';

commit;
