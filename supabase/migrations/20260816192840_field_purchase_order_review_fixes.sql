-- Address the Field purchase-order review findings without reopening deployed
-- history: keep order quantities and notes canonical, and make PO placement a
-- single tenant-authorized transaction that composes the quote-contact command.

begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';

do $migration$
declare
  v_definition text;
  v_updated text;
  v_validation_anchor constant text := $anchor$  if nullif(trim(p_idempotency_key), '') is null then$anchor$;
  v_validation_replacement constant text := $replacement$  if p_qty <> round(p_qty, 2) then
    raise exception using
      errcode = '22023',
      message = 'PO quantity cannot use more than two decimal places.';
  end if;
  if length(coalesce(p_notes, '')) > 2000 then
    raise exception using
      errcode = '22023',
      message = 'Purchase order notes must be 2000 characters or fewer.';
  end if;
  if nullif(trim(p_idempotency_key), '') is null then$replacement$;
  v_supplier_anchor constant text := $anchor$    if not found then
      raise exception using
        errcode = '42501',
        message = 'Supplier not found for this shop.';
    end if;
  end if;$anchor$;
  v_supplier_replacement constant text := $replacement$    if not found then
      raise exception using
        errcode = '42501',
        message = 'Supplier not found for this shop.';
    end if;
    if not coalesce(v_supplier.is_active, true) then
      raise exception using
        errcode = '55000',
        message = 'Purchase order supplier is inactive.';
    end if;
  end if;$replacement$;
  v_notes_anchor constant text := $anchor$  v_result := public.parts_create_po_line_for_request($anchor$;
  v_notes_replacement constant text := $replacement$  if not v_created and nullif(trim(p_notes), '') is not null then
    update public.purchase_orders
    set notes = concat_ws(
      E'\n',
      nullif(trim(notes), ''),
      nullif(trim(p_notes), '')
    )
    where id = v_po_id
    returning * into v_po;
  end if;

  v_result := public.parts_create_po_line_for_request($replacement$;
begin
  select pg_get_functiondef(
    'public.parts_create_or_reuse_po_line_for_request(uuid,numeric,text,uuid,uuid,numeric,uuid,text)'::regprocedure
  )
    into v_definition;

  if v_definition is null then
    raise exception 'parts_create_or_reuse_po_line_for_request is missing';
  end if;

  v_updated := v_definition;
  if position('PO quantity cannot use more than two decimal places.' in v_updated) = 0 then
    if position(v_validation_anchor in v_updated) = 0 then
      raise exception 'PO quantity validation patch anchor is missing';
    end if;
    if (
      length(v_updated) - length(replace(v_updated, v_validation_anchor, ''))
    ) / length(v_validation_anchor) <> 1 then
      raise exception 'PO quantity validation patch anchor is ambiguous';
    end if;
    v_updated := replace(
      v_updated,
      v_validation_anchor,
      v_validation_replacement
    );
  end if;

  if position('Purchase order supplier is inactive.' in v_updated) = 0 then
    if position(v_supplier_anchor in v_updated) = 0 then
      raise exception 'PO supplier activity patch anchor is missing';
    end if;
    if (
      length(v_updated) - length(replace(v_updated, v_supplier_anchor, ''))
    ) / length(v_supplier_anchor) <> 1 then
      raise exception 'PO supplier activity patch anchor is ambiguous';
    end if;
    v_updated := replace(v_updated, v_supplier_anchor, v_supplier_replacement);
  end if;

  if position('concat_ws(' in v_updated) = 0 then
    if position(v_notes_anchor in v_updated) = 0 then
      raise exception 'PO reuse notes patch anchor is missing';
    end if;
    if (
      length(v_updated) - length(replace(v_updated, v_notes_anchor, ''))
    ) / length(v_notes_anchor) <> 1 then
      raise exception 'PO reuse notes patch anchor is ambiguous';
    end if;
    v_updated := replace(v_updated, v_notes_anchor, v_notes_replacement);
  end if;

  if v_updated = v_definition then
    raise exception 'parts_create_or_reuse_po_line_for_request was already patched';
  end if;
  execute v_updated;
end;
$migration$;

comment on function public.parts_create_or_reuse_po_line_for_request(
  uuid, numeric, text, uuid, uuid, numeric, uuid, text
) is
  'Creates or reuses a supplier PO for approved demand with two-decimal quantities, durable notes, tenant authorization, locking, and idempotency.';

create or replace function public.parts_place_purchase_order(
  p_po_id uuid,
  p_idempotency_key text,
  p_contact_channel text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_po public.purchase_orders%rowtype;
  v_status text;
  v_contact_channel text := lower(nullif(trim(p_contact_channel), ''));
  v_contact_result jsonb;
begin
  if p_po_id is null then
    raise exception using
      errcode = '22023',
      message = 'A purchase order is required.';
  end if;
  if nullif(trim(p_idempotency_key), '') is null
     or length(p_idempotency_key) > 300 then
    raise exception using
      errcode = '22023',
      message = 'A stable PO placement idempotency key is required.';
  end if;
  if v_contact_channel is not null
     and v_contact_channel not in ('email', 'phone') then
    raise exception using
      errcode = '22023',
      message = 'A valid supplier contact method is required.';
  end if;

  -- Canonical lock order is PO header, then PO lines by durable identity.
  select purchase_order.*
    into v_po
  from public.purchase_orders purchase_order
  where purchase_order.id = p_po_id
  for update;

  if not found or v_po.shop_id is null then
    raise exception using
      errcode = 'P0002',
      message = 'Purchase order not found.';
  end if;

  perform public.parts_lifecycle_assert_shop_access(v_po.shop_id);
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role'
     and not exists (
       select 1
       from public.profiles profile
       where profile.shop_id = v_po.shop_id
         and (profile.id = auth.uid() or profile.user_id = auth.uid())
         and public.canonical_shop_membership_role(profile.role::text) in (
           'owner', 'admin', 'manager', 'parts', 'lead_hand', 'foreman'
         )
     ) then
    raise exception using
      errcode = '42501',
      message = 'Parts ordering actor is not authorized for this shop.';
  end if;

  v_status := lower(coalesce(v_po.status, ''));
  if v_status in (
    'open', 'ordered', 'sent', 'receiving', 'partially_received', 'received'
  ) then
    -- Repair legacy quote-backed rows that were opened by the old route before
    -- it recorded the supplier/quote contact audit.
    if v_po.supplier_quote_request_id is not null
       and v_po.supplier_contacted_at is null then
      if v_status <> 'open' then
        raise exception using
          errcode = '55000',
          message = 'Only an open quoted purchase order can repair missing supplier contact.';
      end if;
      if v_contact_channel is null then
        raise exception using
          errcode = '22023',
          message = 'A supplier contact method is required for this quoted purchase order.';
      end if;
      v_contact_result := public.parts_mark_purchase_order_contacted(
        v_po.id,
        v_contact_channel,
        p_idempotency_key
      );
      return v_contact_result || jsonb_build_object(
        'placed', true,
        'idempotent', true,
        'repaired_contact_audit', true
      );
    end if;

    return jsonb_build_object(
      'ok', true,
      'placed', true,
      'idempotent', true,
      'po_id', v_po.id,
      'status', v_po.status,
      'ordered_at', v_po.ordered_at,
      'contacted_at', v_po.supplier_contacted_at
    );
  end if;

  if v_status <> 'draft' then
    raise exception using
      errcode = '55000',
      message = 'Only a draft purchase order can be placed.';
  end if;

  perform line.id
  from public.purchase_order_lines line
  where line.po_id = v_po.id
  order by line.created_at, line.id
  for update;

  if not exists (
    select 1
    from public.purchase_order_lines line
    where line.po_id = v_po.id
      and greatest(
        coalesce(line.qty, 0) - coalesce(line.cancelled_qty, 0),
        0
      ) > 0
  ) then
    raise exception using
      errcode = '23514',
      message = 'Add at least one active line before placing this PO.';
  end if;

  if v_po.supplier_quote_request_id is not null then
    if v_contact_channel is null then
      raise exception using
        errcode = '22023',
        message = 'A supplier contact method is required for this quoted purchase order.';
    end if;
    v_contact_result := public.parts_mark_purchase_order_contacted(
      v_po.id,
      v_contact_channel,
      p_idempotency_key
    );
    return v_contact_result || jsonb_build_object('placed', true);
  end if;

  update public.purchase_orders
  set status = 'open',
      ordered_at = coalesce(ordered_at, now())
  where id = v_po.id
  returning * into v_po;

  return jsonb_build_object(
    'ok', true,
    'placed', true,
    'idempotent', false,
    'po_id', v_po.id,
    'status', v_po.status,
    'ordered_at', v_po.ordered_at
  );
end;
$$;

comment on function public.parts_place_purchase_order(uuid, text, text) is
  'Atomically places a non-empty PO and composes canonical supplier-contact auditing for quote-backed orders.';

revoke all on function public.parts_place_purchase_order(uuid, text, text)
  from public, anon;
grant execute on function public.parts_place_purchase_order(uuid, text, text)
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
