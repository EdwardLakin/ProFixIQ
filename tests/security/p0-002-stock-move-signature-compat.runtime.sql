\set ON_ERROR_STOP on

begin;

-- The clean-replay path already has the enum overload. The preflight must not
-- replace its implementation; it may only keep the legacy signature locked.
create temp table p0_002_existing_enum_overload as
select pg_catalog.pg_get_functiondef(procedure.oid) as definition
from pg_catalog.pg_proc procedure
where procedure.oid = pg_catalog.to_regprocedure(
  'public.apply_stock_move(uuid,uuid,numeric,public.stock_move_reason,text,uuid)'
);

\ir ../../supabase/migrations/20260725100000_p0_002_stock_move_signature_compat.sql

do $$
declare
  v_definition text;
begin
  select pg_catalog.pg_get_functiondef(procedure.oid)
    into v_definition
  from pg_catalog.pg_proc procedure
  where procedure.oid = pg_catalog.to_regprocedure(
    'public.apply_stock_move(uuid,uuid,numeric,public.stock_move_reason,text,uuid)'
  );

  if v_definition is distinct from (
    select snapshot.definition
    from p0_002_existing_enum_overload snapshot
  ) then
    raise exception
      'P0-002 compatibility assertion failed: existing overload was replaced';
  end if;

  if has_function_privilege(
    'anon',
    'public.apply_stock_move(uuid,uuid,numeric,public.stock_move_reason,text,uuid)',
    'EXECUTE'
  )
  or has_function_privilege(
    'authenticated',
    'public.apply_stock_move(uuid,uuid,numeric,public.stock_move_reason,text,uuid)',
    'EXECUTE'
  )
  or has_function_privilege(
    'service_role',
    'public.apply_stock_move(uuid,uuid,numeric,public.stock_move_reason,text,uuid)',
    'EXECUTE'
  ) then
    raise exception
      'P0-002 compatibility assertion failed: existing overload is exposed';
  end if;
end
$$;

-- Reproduce the deployed schema shape that caused the production migration to
-- fail, then prove the preflight creates only a locked placeholder.
drop function public.apply_stock_move(
  uuid,
  uuid,
  numeric,
  public.stock_move_reason,
  text,
  uuid
);

\ir ../../supabase/migrations/20260725100000_p0_002_stock_move_signature_compat.sql

do $$
declare
  v_oid regprocedure := pg_catalog.to_regprocedure(
    'public.apply_stock_move(uuid,uuid,numeric,public.stock_move_reason,text,uuid)'
  );
  v_definition text;
  v_security_definer boolean;
  v_return_type regtype;
begin
  if v_oid is null then
    raise exception
      'P0-002 compatibility assertion failed: absent overload was not created';
  end if;

  select
    pg_catalog.pg_get_functiondef(procedure.oid),
    procedure.prosecdef,
    procedure.prorettype::regtype
  into v_definition, v_security_definer, v_return_type
  from pg_catalog.pg_proc procedure
  where procedure.oid = v_oid;

  if v_security_definer then
    raise exception
      'P0-002 compatibility assertion failed: placeholder is SECURITY DEFINER';
  end if;

  if v_return_type <> 'uuid'::regtype then
    raise exception
      'P0-002 compatibility assertion failed: placeholder return type is %',
      v_return_type;
  end if;

  if pg_catalog.strpos(
    v_definition,
    'LEGACY_STOCK_MOVE_OVERLOAD_DISABLED'
  ) = 0 then
    raise exception
      'P0-002 compatibility assertion failed: placeholder does not fail closed';
  end if;

  if has_function_privilege('anon', v_oid, 'EXECUTE')
  or has_function_privilege('authenticated', v_oid, 'EXECUTE')
  or has_function_privilege('service_role', v_oid, 'EXECUTE') then
    raise exception
      'P0-002 compatibility assertion failed: placeholder is exposed';
  end if;
end
$$;

-- This is the exact step that failed against production. Reaching the final
-- assertion proves the existing P0-002 migration can follow the compatibility
-- preflight without changing the already-merged migration.
\ir ../../supabase/migrations/20260725103000_harden_p0_002_rpc_privileges.sql

do $$
begin
  if has_function_privilege(
    'anon',
    'public.apply_stock_move(uuid,uuid,numeric,text,text,uuid)',
    'EXECUTE'
  )
  or not has_function_privilege(
    'authenticated',
    'public.apply_stock_move(uuid,uuid,numeric,text,text,uuid)',
    'EXECUTE'
  )
  or not has_function_privilege(
    'service_role',
    'public.apply_stock_move(uuid,uuid,numeric,text,text,uuid)',
    'EXECUTE'
  )
  or has_function_privilege(
    'anon',
    'public.apply_stock_move(uuid,uuid,numeric,public.stock_move_reason,text,uuid)',
    'EXECUTE'
  )
  or has_function_privilege(
    'authenticated',
    'public.apply_stock_move(uuid,uuid,numeric,public.stock_move_reason,text,uuid)',
    'EXECUTE'
  )
  or has_function_privilege(
    'service_role',
    'public.apply_stock_move(uuid,uuid,numeric,public.stock_move_reason,text,uuid)',
    'EXECUTE'
  ) then
    raise exception
      'P0-002 compatibility assertion failed: final RPC ACLs are wrong';
  end if;
end
$$;

select 'p0_002_stock_move_signature_compat_runtime_ok' as result;

rollback;
