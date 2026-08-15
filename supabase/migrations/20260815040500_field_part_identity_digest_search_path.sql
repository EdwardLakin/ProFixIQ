begin;

-- The preview branch already applied the original identity migration. Reinstall
-- the RPC with pgcrypto explicitly schema-qualified so the hardened empty
-- search_path remains safe and clean-database/runtime calls can hash requests.
create or replace function public.field_resolve_or_create_part_identity_atomic(
  p_shop_id uuid,
  p_actor_user_id uuid,
  p_code text,
  p_provider text default 'manual',
  p_external_id text default null,
  p_connection_id uuid default null,
  p_supplier_id uuid default null,
  p_name text default null,
  p_manufacturer text default null,
  p_part_number text default null,
  p_supplier_sku text default null,
  p_unit_of_measure text default null,
  p_package_quantity numeric default 1,
  p_create_if_missing boolean default false,
  p_unit_cost numeric default null,
  p_unit_sell_price numeric default null,
  p_metadata jsonb default '{}'::jsonb,
  p_operation_key text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor record;
  v_provider text := lower(coalesce(nullif(trim(p_provider), ''), 'manual'));
  v_code text := nullif(trim(p_code), '');
  v_external_id text := nullif(trim(p_external_id), '');
  v_part_number text := nullif(trim(p_part_number), '');
  v_supplier_sku text := nullif(trim(p_supplier_sku), '');
  v_manufacturer text := nullif(trim(p_manufacturer), '');
  v_name text := nullif(trim(p_name), '');
  v_operation_key text;
  v_request jsonb;
  v_request_hash text;
  v_operation public.parts_operation_keys%rowtype;
  v_part public.parts%rowtype;
  v_barcode public.parts_barcodes%rowtype;
  v_identity public.part_external_identities%rowtype;
  v_created boolean := false;
begin
  if not public.scheduler_actor_matches(p_actor_user_id) then
    raise exception using errcode = '42501', message = 'Authenticated actor mismatch.';
  end if;

  select * into v_actor
  from private.profixiq_field_inventory_actor_context(
    p_shop_id,
    p_actor_user_id
  );
  if not found or not v_actor.can_view_field then
    raise exception using errcode = '42501', message = 'Field inventory access is required.';
  end if;

  if v_provider !~ '^[a-z0-9][a-z0-9_-]{1,63}$' then
    raise exception using errcode = '22023', message = 'PART_PROVIDER_INVALID';
  end if;
  if v_code is null and v_external_id is null and v_part_number is null and v_supplier_sku is null then
    raise exception using errcode = '22023', message = 'A barcode, provider id, SKU, or part number is required.';
  end if;
  if p_package_quantity is null or p_package_quantity <= 0 then
    raise exception using errcode = '22023', message = 'Package quantity must be greater than zero.';
  end if;
  if p_unit_cost is not null and p_unit_cost < 0 then
    raise exception using errcode = '22023', message = 'Part cost cannot be negative.';
  end if;
  if p_unit_sell_price is not null and p_unit_sell_price < 0 then
    raise exception using errcode = '22023', message = 'Part sell price cannot be negative.';
  end if;
  if nullif(trim(p_operation_key), '') is null then
    raise exception using errcode = '22023', message = 'A stable operation key is required.';
  end if;

  v_operation_key := p_shop_id::text || ':field-resolve:' || trim(p_operation_key);
  if length(v_operation_key) > 280 then
    raise exception using errcode = '22023', message = 'Part identity operation key is too long.';
  end if;

  v_request := jsonb_build_object(
    'code', v_code,
    'provider', v_provider,
    'external_id', v_external_id,
    'connection_id', p_connection_id,
    'supplier_id', p_supplier_id,
    'name', v_name,
    'manufacturer', v_manufacturer,
    'part_number', v_part_number,
    'supplier_sku', v_supplier_sku,
    'unit_of_measure', nullif(trim(p_unit_of_measure), ''),
    'package_quantity', p_package_quantity,
    'create_if_missing', p_create_if_missing,
    'unit_cost', p_unit_cost,
    'unit_sell_price', p_unit_sell_price
  );
  v_request_hash := encode(
    extensions.digest(convert_to(v_request::text, 'UTF8'), 'sha256'),
    'hex'
  );

  perform pg_advisory_xact_lock(hashtextextended(v_operation_key, 0));
  select * into v_operation
  from public.parts_operation_keys operation
  where operation.shop_id = p_shop_id
    and operation.operation_key = v_operation_key
  for update;
  if found then
    if v_operation.operation_type <> 'field_resolve_part_identity'
       or v_operation.aggregate_type <> 'shop'
       or v_operation.aggregate_id <> p_shop_id
       or coalesce(v_operation.result ->> '_request_hash', '') <> v_request_hash then
      raise exception using errcode = '22023', message = 'FIELD_PART_IDENTITY_KEY_CONFLICT';
    end if;
    if v_operation.result is null or v_operation.completed_at is null then
      raise exception using errcode = '55000', message = 'FIELD_PART_IDENTITY_OPERATION_IN_PROGRESS';
    end if;
    return v_operation.result || jsonb_build_object('idempotent', true);
  end if;

  insert into public.parts_operation_keys (
    shop_id,
    operation_key,
    operation_type,
    aggregate_type,
    aggregate_id,
    created_by
  ) values (
    p_shop_id,
    v_operation_key,
    'field_resolve_part_identity',
    'shop',
    p_shop_id,
    v_actor.profile_id
  ) returning * into v_operation;

  if v_external_id is not null then
    select part.* into v_part
    from public.part_external_identities identity
    join public.parts part
      on part.id = identity.part_id
     and part.shop_id = identity.shop_id
    where identity.shop_id = p_shop_id
      and identity.provider = v_provider
      and lower(identity.external_id) = lower(v_external_id)
      and identity.active
    order by identity.updated_at desc, identity.id
    limit 1
    for share of part;
  end if;

  if v_part.id is null and v_code is not null then
    select part.* into v_part
    from public.parts_barcodes barcode
    join public.parts part
      on part.id = barcode.part_id
     and part.shop_id = barcode.shop_id
    where barcode.shop_id = p_shop_id
      and (
        lower(barcode.barcode) = lower(v_code)
        or lower(coalesce(barcode.code, '')) = lower(v_code)
      )
    order by (lower(barcode.barcode) = lower(v_code)) desc, barcode.created_at, barcode.id
    limit 1
    for share of part;
  end if;

  if v_part.id is null and v_code is not null then
    select part.* into v_part
    from public.part_external_identities identity
    join public.parts part
      on part.id = identity.part_id
     and part.shop_id = identity.shop_id
    where identity.shop_id = p_shop_id
      and identity.active
      and lower(coalesce(identity.barcode, '')) = lower(v_code)
    order by identity.updated_at desc, identity.id
    limit 1
    for share of part;
  end if;

  if v_part.id is null then
    select part.* into v_part
    from public.parts part
    where part.shop_id = p_shop_id
      and (
        (
          coalesce(v_supplier_sku, v_code) is not null
          and lower(regexp_replace(coalesce(part.sku, ''), '[^a-zA-Z0-9]+', '', 'g')) =
              lower(regexp_replace(coalesce(v_supplier_sku, v_code, ''), '[^a-zA-Z0-9]+', '', 'g'))
        )
        or (
          coalesce(v_part_number, v_code) is not null
          and lower(regexp_replace(coalesce(part.part_number, ''), '[^a-zA-Z0-9]+', '', 'g')) =
              lower(regexp_replace(coalesce(v_part_number, v_code, ''), '[^a-zA-Z0-9]+', '', 'g'))
          and (
            v_manufacturer is null
            or lower(coalesce(part.manufacturer, '')) = lower(v_manufacturer)
          )
        )
      )
    order by
      (lower(coalesce(part.manufacturer, '')) = lower(coalesce(v_manufacturer, ''))) desc,
      part.created_at desc nulls last,
      part.id
    limit 1
    for share;
  end if;

  if v_part.id is null and not p_create_if_missing then
    update public.parts_operation_keys
    set result = jsonb_build_object(
          'ok', true,
          'idempotent', false,
          'found', false,
          'created', false,
          'requiresDetails', true,
          'code', v_code,
          'provider', v_provider,
          'externalId', v_external_id,
          '_request_hash', v_request_hash
        ),
        completed_at = now()
    where id = v_operation.id
    returning * into v_operation;
    return v_operation.result;
  end if;

  if v_part.id is null then
    v_name := coalesce(v_name, v_part_number, v_supplier_sku, v_code);
    if v_name is null then
      raise exception using errcode = '22023', message = 'Part details are required before creating a new canonical part.';
    end if;

    insert into public.parts (
      shop_id,
      name,
      part_number,
      sku,
      manufacturer,
      supplier,
      cost,
      default_cost,
      price,
      default_price,
      normalized_part_key
    ) values (
      p_shop_id,
      v_name,
      coalesce(v_part_number, case when v_provider = 'manual' then v_code else null end),
      coalesce(v_supplier_sku, case when v_provider <> 'manual' then v_code else null end),
      v_manufacturer,
      v_provider,
      p_unit_cost,
      p_unit_cost,
      p_unit_sell_price,
      p_unit_sell_price,
      nullif(
        lower(regexp_replace(
          coalesce(v_manufacturer, '') || ':' || coalesce(v_part_number, v_supplier_sku, v_code, ''),
          '[^a-zA-Z0-9]+',
          '',
          'g'
        )),
        ''
      )
    ) returning * into v_part;
    v_created := true;
  end if;

  if v_code is not null then
    select * into v_barcode
    from public.parts_barcodes barcode
    where barcode.shop_id = p_shop_id
      and lower(barcode.barcode) = lower(v_code)
    for update;
    if found and v_barcode.part_id <> v_part.id then
      raise exception using errcode = '23505', message = 'PART_BARCODE_ALREADY_MAPPED';
    end if;
    if not found then
      insert into public.parts_barcodes (
        shop_id,
        part_id,
        barcode,
        code,
        supplier_id
      ) values (
        p_shop_id,
        v_part.id,
        v_code,
        v_code,
        p_supplier_id
      );
    end if;
  end if;

  if v_external_id is not null
     or v_supplier_sku is not null
     or v_code is not null
     or v_part_number is not null then
    select * into v_identity
    from public.part_external_identities identity
    where identity.shop_id = p_shop_id
      and identity.active
      and (
        (
          v_external_id is not null
          and identity.provider = v_provider
          and lower(identity.external_id) = lower(v_external_id)
        )
        or (
          v_code is not null
          and lower(coalesce(identity.barcode, '')) = lower(v_code)
        )
      )
    order by identity.updated_at desc, identity.id
    limit 1
    for update;

    if found and v_identity.part_id <> v_part.id then
      raise exception using errcode = '23505', message = 'PART_EXTERNAL_IDENTITY_ALREADY_MAPPED';
    end if;

    if found then
      update public.part_external_identities
      set connection_id = coalesce(p_connection_id, connection_id),
          supplier_id = coalesce(p_supplier_id, supplier_id),
          external_id = coalesce(v_external_id, external_id),
          manufacturer = coalesce(v_manufacturer, manufacturer),
          part_number = coalesce(v_part_number, part_number),
          supplier_sku = coalesce(v_supplier_sku, supplier_sku),
          barcode = coalesce(v_code, barcode),
          unit_of_measure = coalesce(nullif(trim(p_unit_of_measure), ''), unit_of_measure),
          package_quantity = p_package_quantity,
          metadata = coalesce(metadata, '{}'::jsonb) || coalesce(p_metadata, '{}'::jsonb),
          updated_at = now()
      where id = v_identity.id
      returning * into v_identity;
    else
      insert into public.part_external_identities (
        shop_id,
        part_id,
        connection_id,
        provider,
        external_id,
        supplier_id,
        manufacturer,
        part_number,
        supplier_sku,
        barcode,
        unit_of_measure,
        package_quantity,
        metadata,
        created_by
      ) values (
        p_shop_id,
        v_part.id,
        p_connection_id,
        v_provider,
        coalesce(v_external_id, case when v_provider <> 'manual' then v_code else null end),
        p_supplier_id,
        v_manufacturer,
        v_part_number,
        v_supplier_sku,
        v_code,
        nullif(trim(p_unit_of_measure), ''),
        p_package_quantity,
        coalesce(p_metadata, '{}'::jsonb),
        v_actor.profile_id
      ) returning * into v_identity;
    end if;
  end if;

  update public.parts_operation_keys
  set result = jsonb_build_object(
        'ok', true,
        'idempotent', false,
        'created', v_created,
        'partId', v_part.id,
        'identityId', v_identity.id,
        'part', jsonb_build_object(
          'id', v_part.id,
          'name', v_part.name,
          'partNumber', v_part.part_number,
          'sku', v_part.sku,
          'manufacturer', v_part.manufacturer,
          'cost', v_part.cost,
          'price', v_part.price
        ),
        '_request_hash', v_request_hash
      ),
      completed_at = now()
  where id = v_operation.id
  returning * into v_operation;

  return v_operation.result;
end;
$$;

commit;
