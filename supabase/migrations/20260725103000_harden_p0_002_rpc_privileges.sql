-- P0-002: close unsafe SECURITY DEFINER RPCs and fail closed for objects
-- created by future migrations.

-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default. The
-- baseline also granted broad table, sequence, and function privileges to the
-- client roles. Future migrations must grant client access intentionally.
alter default privileges for role postgres in schema public
  revoke all privileges on tables from public, anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all privileges on sequences from public, anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all privileges on functions from public, anon, authenticated;

alter default privileges for role postgres in schema public
  grant all privileges on tables to service_role;
alter default privileges for role postgres in schema public
  grant all privileges on sequences to service_role;
alter default privileges for role postgres in schema public
  grant all privileges on functions to service_role;

create schema if not exists private authorization postgres;
revoke all privileges on schema private
  from public, anon, authenticated, service_role;

-- Keep the client-facing signature stable while moving the implementation to
-- a private core. The core returns only the durable ledger id so wrappers can
-- preserve either historical return contract (uuid or stock_moves row).
create or replace function private.profixiq_apply_stock_move_core(
  p_part uuid,
  p_loc uuid,
  p_qty numeric,
  p_reason text,
  p_ref_kind text,
  p_ref_id uuid
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_part public.parts%rowtype;
  v_location_id uuid;
  v_reason public.stock_move_reason;
  v_effect numeric;
  v_ref_kind text := nullif(trim(p_ref_kind), '');
  v_idempotency_key text;
  v_move public.stock_moves%rowtype;
  v_summary_relkind "char";
begin
  if p_qty is null
     or p_qty = 0
     or p_qty::text in ('NaN', 'Infinity', '-Infinity') then
    raise exception using
      errcode = '22023',
      message = 'STOCK_MOVE_QUANTITY_INVALID';
  end if;

  if v_ref_kind is not null and length(v_ref_kind) > 80 then
    raise exception using
      errcode = '22023',
      message = 'STOCK_MOVE_REFERENCE_KIND_TOO_LONG';
  end if;

  begin
    v_reason := lower(trim(coalesce(p_reason, '')))
      ::public.stock_move_reason;
  exception
    when invalid_text_representation then
      raise exception using
        errcode = '22023',
        message = 'STOCK_MOVE_REASON_INVALID';
  end;

  if v_reason::text = 'adjust' then
    v_effect := p_qty;
  elsif v_reason::text in ('receive', 'return', 'transfer_in', 'seed') then
    if p_qty < 0 then
      raise exception using
        errcode = '22023',
        message = 'STOCK_MOVE_DIRECTION_INVALID';
    end if;
    v_effect := p_qty;
  elsif v_reason::text in ('consume', 'transfer_out') then
    if p_qty < 0 then
      raise exception using
        errcode = '22023',
        message = 'STOCK_MOVE_DIRECTION_INVALID';
    end if;
    v_effect := -p_qty;
  else
    raise exception using
      errcode = '22023',
      message = 'STOCK_MOVE_LIFECYCLE_RPC_REQUIRED';
  end if;

  select part.*
    into v_part
  from public.parts part
  where part.id = p_part
  for update;

  if not found or v_part.shop_id is null then
    raise exception using
      errcode = '42501',
      message = 'STOCK_MOVE_SCOPE_DENIED';
  end if;

  perform public.parts_lifecycle_assert_shop_access(v_part.shop_id);

  select location.id
    into v_location_id
  from public.stock_locations location
  where location.id = p_loc
    and location.shop_id = v_part.shop_id
  for update;

  if v_location_id is null then
    raise exception using
      errcode = '42501',
      message = 'STOCK_MOVE_SCOPE_DENIED';
  end if;

  -- Old receive-scan clients used the part id as a non-unique placeholder for
  -- manual receipts. Do not collapse those legitimate repeated receipts.
  if p_ref_id is not null
     and v_ref_kind is not null
     and not (
       v_ref_kind = 'manual_receive'
       and p_ref_id = p_part
     ) then
    v_idempotency_key :=
      v_part.shop_id::text
      || ':apply-stock-move:'
      || v_reason::text
      || ':'
      || v_ref_kind
      || ':'
      || p_ref_id::text
      || ':'
      || p_part::text
      || ':'
      || p_loc::text;

    select move.*
      into v_move
    from public.stock_moves move
    where move.shop_id = v_part.shop_id
      and move.idempotency_key = v_idempotency_key
    for update;

    if found then
      if v_move.part_id is distinct from p_part
         or v_move.location_id is distinct from p_loc
         or v_move.qty_change is distinct from v_effect
         or v_move.reason is distinct from v_reason
         or v_move.reference_kind is distinct from v_ref_kind
         or v_move.reference_id is distinct from p_ref_id then
        raise exception using
          errcode = '22023',
          message = 'STOCK_MOVE_IDEMPOTENCY_CONFLICT';
      end if;
      return v_move.id;
    end if;
  end if;

  insert into public.stock_moves (
    shop_id,
    part_id,
    location_id,
    qty_change,
    reason,
    reference_kind,
    reference_id,
    created_by,
    idempotency_key,
    metadata,
    lifecycle_quantity
  ) values (
    v_part.shop_id,
    p_part,
    p_loc,
    v_effect,
    v_reason,
    v_ref_kind,
    p_ref_id,
    auth.uid(),
    v_idempotency_key,
    jsonb_build_object(
      'operation', 'apply_stock_move',
      'requested_qty', p_qty,
      'effective_qty', v_effect
    ),
    abs(v_effect)
  )
  on conflict (shop_id, idempotency_key)
    where idempotency_key is not null
  do nothing
  returning * into v_move;

  if not found then
    select move.*
      into v_move
    from public.stock_moves move
    where move.shop_id = v_part.shop_id
      and move.idempotency_key = v_idempotency_key
    for update;

    if not found
       or v_move.part_id is distinct from p_part
       or v_move.location_id is distinct from p_loc
       or v_move.qty_change is distinct from v_effect
       or v_move.reason is distinct from v_reason
       or v_move.reference_kind is distinct from v_ref_kind
       or v_move.reference_id is distinct from p_ref_id then
      raise exception using
        errcode = '22023',
        message = 'STOCK_MOVE_IDEMPOTENCY_CONFLICT';
    end if;

    return v_move.id;
  end if;

  -- Maintain the legacy caches only for the new ledger row. Current inventory
  -- reads remain ledger-backed; these writes preserve older consumers.
  insert into public.part_stock (
    part_id,
    location_id,
    qty_on_hand,
    qty_reserved
  ) values (
    p_part,
    p_loc,
    v_effect,
    0
  )
  on conflict (part_id, location_id) do update
  set qty_on_hand = public.part_stock.qty_on_hand + excluded.qty_on_hand;

  select relation.relkind
    into v_summary_relkind
  from pg_catalog.pg_class relation
  join pg_catalog.pg_namespace namespace
    on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relname = 'part_stock_summary';

  if v_summary_relkind in ('r', 'p') then
    insert into public.part_stock_summary (
      part_id,
      location_id,
      shop_id,
      qty_on_hand,
      qty_reserved
    ) values (
      p_part,
      p_loc,
      v_part.shop_id,
      v_effect,
      0
    )
    on conflict (part_id, location_id) do update
    set qty_on_hand =
      public.part_stock_summary.qty_on_hand + excluded.qty_on_hand;
  end if;

  return v_move.id;
end;
$$;

-- The ordered migration chain returns uuid. Generated types from at least one
-- deployed schema describe a stock_moves row. Preserve whichever contract is
-- already installed rather than dropping the function or its dependencies.
do $migration$
declare
  v_return_type regtype;
  v_returns_set boolean;
begin
  select procedure.prorettype::regtype, procedure.proretset
    into v_return_type, v_returns_set
  from pg_catalog.pg_proc procedure
  where procedure.oid = pg_catalog.to_regprocedure(
    'public.apply_stock_move(uuid,uuid,numeric,text,text,uuid)'
  );

  if v_return_type is null then
    raise exception
      'P0-002 requires public.apply_stock_move(uuid,uuid,numeric,text,text,uuid)';
  end if;
  if v_returns_set then
    raise exception
      'P0-002 cannot preserve a set-returning apply_stock_move contract';
  end if;

  if v_return_type = 'uuid'::regtype then
    execute $wrapper$
      create or replace function public.apply_stock_move(
        p_part uuid,
        p_loc uuid,
        p_qty numeric,
        p_reason text,
        p_ref_kind text,
        p_ref_id uuid
      ) returns uuid
      language plpgsql
      security definer
      set search_path = pg_catalog, public
      as $body$
      begin
        return private.profixiq_apply_stock_move_core(
          p_part,
          p_loc,
          p_qty,
          p_reason,
          p_ref_kind,
          p_ref_id
        );
      end;
      $body$
    $wrapper$;
  elsif v_return_type = 'public.stock_moves'::regtype then
    execute $wrapper$
      create or replace function public.apply_stock_move(
        p_part uuid,
        p_loc uuid,
        p_qty numeric,
        p_reason text,
        p_ref_kind text,
        p_ref_id uuid
      ) returns public.stock_moves
      language plpgsql
      security definer
      set search_path = pg_catalog, public
      as $body$
      declare
        v_move_id uuid;
        v_move public.stock_moves%rowtype;
      begin
        v_move_id := private.profixiq_apply_stock_move_core(
          p_part,
          p_loc,
          p_qty,
          p_reason,
          p_ref_kind,
          p_ref_id
        );

        select move.*
          into strict v_move
        from public.stock_moves move
        where move.id = v_move_id;

        return v_move;
      end;
      $body$
    $wrapper$;
  else
    raise exception
      'P0-002 cannot preserve apply_stock_move return type %',
      v_return_type;
  end if;
end
$migration$;

-- This legacy RPC has no repository caller. Keep the server-only capability
-- available without allowing client roles to alter arbitrary seat limits.
create or replace function public.increment_user_limit(
  input_shop_id uuid,
  increment_by integer default 5
) returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    auth.jwt() ->> 'role',
    ''
  ) <> 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'USER_LIMIT_SERVICE_ROLE_REQUIRED';
  end if;

  if input_shop_id is null or increment_by is null or increment_by = 0 then
    raise exception using
      errcode = '22023',
      message = 'USER_LIMIT_INPUT_INVALID';
  end if;

  update public.shops
  set user_limit = coalesce(user_limit, 0) + increment_by
  where id = input_shop_id;
end;
$$;

revoke all privileges on function private.profixiq_apply_stock_move_core(
  uuid,
  uuid,
  numeric,
  text,
  text,
  uuid
) from public, anon, authenticated, service_role;

revoke all privileges on function public.apply_stock_move(
  uuid,
  uuid,
  numeric,
  text,
  text,
  uuid
) from public, anon, authenticated, service_role;
grant execute on function public.apply_stock_move(
  uuid,
  uuid,
  numeric,
  text,
  text,
  uuid
) to authenticated, service_role;

-- Disable the ambiguous legacy enum overload. Repository callers all use the
-- hardened six-argument text contract above.
revoke all privileges on function public.apply_stock_move(
  uuid,
  uuid,
  numeric,
  public.stock_move_reason,
  text,
  uuid
) from public, anon, authenticated, service_role;

revoke all privileges on function public.increment_user_limit(
  uuid,
  integer
) from public, anon, authenticated, service_role;
grant execute on function public.increment_user_limit(
  uuid,
  integer
) to service_role;
