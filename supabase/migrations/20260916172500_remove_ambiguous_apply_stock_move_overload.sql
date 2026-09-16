-- Keep one PostgREST-visible apply_stock_move contract.
--
-- The legacy enum overload was previously revoked from client roles, but
-- PostgREST still sees overloaded functions when resolving an RPC by argument
-- names. Because p_reason arrives as JSON text, the enum and text signatures
-- are ambiguous before privilege checks are considered.
--
-- Repository callers use the hardened six-argument text signature. Remove the
-- disabled legacy enum overload so manual inventory receives resolve
-- deterministically to that canonical contract.

do $migration$
begin
  if pg_catalog.to_regprocedure(
    'public.apply_stock_move(uuid,uuid,numeric,public.stock_move_reason,text,uuid)'
  ) is not null then
    execute $drop$
      drop function public.apply_stock_move(
        uuid,
        uuid,
        numeric,
        public.stock_move_reason,
        text,
        uuid
      )
    $drop$;
  end if;
end
$migration$;

-- Fail the migration rather than silently leaving another six-argument
-- overload that would make the public RPC ambiguous again.
do $verify$
declare
  v_overload_count integer;
begin
  select count(*)
    into v_overload_count
  from pg_catalog.pg_proc procedure
  join pg_catalog.pg_namespace namespace
    on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.proname = 'apply_stock_move'
    and procedure.pronargs = 6;

  if v_overload_count <> 1 then
    raise exception
      'Expected exactly one six-argument public.apply_stock_move overload, found %',
      v_overload_count;
  end if;

  if pg_catalog.to_regprocedure(
    'public.apply_stock_move(uuid,uuid,numeric,text,text,uuid)'
  ) is null then
    raise exception
      'Canonical public.apply_stock_move(uuid,uuid,numeric,text,text,uuid) is missing';
  end if;
end
$verify$;
