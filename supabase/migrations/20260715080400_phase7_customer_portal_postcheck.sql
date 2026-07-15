do $$
begin
  if to_regclass('public.portal_lifecycle_operation_keys') is null then
    raise exception 'Phase 7 postcheck failed: portal lifecycle operation keys are missing.';
  end if;

  if to_regprocedure('public.accept_portal_invite_atomic(uuid,uuid,text,text,timestamptz)') is null then
    raise exception 'Phase 7 postcheck failed: invite acceptance command is missing.';
  end if;

  if to_regprocedure('public.apply_portal_booking_command_atomic(text,uuid,uuid,uuid,uuid,timestamptz,timestamptz,text,uuid,text,text,text,timestamptz)') is null then
    raise exception 'Phase 7 postcheck failed: booking lifecycle command is missing.';
  end if;

  if to_regprocedure('public.add_portal_request_line_atomic(uuid,uuid,uuid,uuid,text,uuid,text,text,text,text,timestamptz)') is null then
    raise exception 'Phase 7 postcheck failed: portal request-line command is missing.';
  end if;

  if to_regprocedure('public.apply_portal_line_decision_atomic(uuid,uuid,uuid,uuid,uuid,text,text,timestamptz)') is null then
    raise exception 'Phase 7 postcheck failed: portal line decision command is missing.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'customer_portal_invites'
      and column_name = 'accepted_at'
  ) then
    raise exception 'Phase 7 postcheck failed: invite acceptance columns are missing.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'bookings'
      and column_name = 'cancelled_at'
  ) then
    raise exception 'Phase 7 postcheck failed: booking cancellation history columns are missing.';
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'portal_lifecycle_operation_keys'
      and indexname = 'portal_lifecycle_operation_keys_pkey'
  ) then
    raise exception 'Phase 7 postcheck failed: portal operation key primary index is missing.';
  end if;

  raise notice 'Phase 7 customer portal lifecycle postcheck passed.';
end;
$$;
