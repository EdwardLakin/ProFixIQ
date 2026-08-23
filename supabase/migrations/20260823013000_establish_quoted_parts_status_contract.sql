begin;

-- The application-level quote workbench mapping is intentionally localized to
-- the Phase 8 surfaces. Do not redefine parts_request_operational_stage here:
-- it is a shared lifecycle contract used by existing Parts handoff commands.

-- Service-only publish guard. Quote delivery is not allowed to continue when
-- live request items, the canonical metadata snapshot, and quote-line totals
-- disagree. Empty legacy lines remain compatible, but are not labeled as
-- labor-only unless their metadata says so explicitly.
create or replace function public.assert_quote_parts_publishable(
  p_shop_id uuid,
  p_work_order_id uuid,
  p_quote_line_ids uuid[]
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_expected_count integer;
  v_line_count integer;
  v_line public.work_order_quote_lines%rowtype;
  v_parts_quote jsonb;
  v_snapshot_items jsonb;
  v_snapshot_count integer;
  v_required_count integer;
  v_quoted_count integer;
  v_pending_count integer;
  v_snapshot_total numeric;
  v_live_count integer;
  v_live_total numeric;
  v_all_live_ready boolean;
begin
  if p_shop_id is null or p_work_order_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'QUOTE_PARTS_SCOPE_INVALID';
  end if;

  select count(*) into v_expected_count
  from (select distinct unnest(coalesce(p_quote_line_ids, '{}'::uuid[]))) ids;
  if v_expected_count = 0 then
    raise exception using
      errcode = 'P0001',
      message = 'QUOTE_PARTS_SCOPE_INVALID';
  end if;

  select count(*) into v_line_count
  from public.work_order_quote_lines q
  where q.shop_id = p_shop_id
    and q.work_order_id = p_work_order_id
    and q.id = any(p_quote_line_ids);
  if v_line_count <> v_expected_count then
    raise exception using
      errcode = 'P0001',
      message = 'QUOTE_PARTS_SCOPE_INVALID';
  end if;

  for v_line in
    select *
    from public.work_order_quote_lines q
    where q.shop_id = p_shop_id
      and q.work_order_id = p_work_order_id
      and q.id = any(p_quote_line_ids)
    order by q.id
    for update
  loop
    v_parts_quote := case
      when jsonb_typeof(coalesce(v_line.metadata, '{}'::jsonb) -> 'parts_quote') = 'object'
        then coalesce(v_line.metadata, '{}'::jsonb) -> 'parts_quote'
      else '{}'::jsonb
    end;
    v_snapshot_items := case
      when jsonb_typeof(v_parts_quote -> 'items') = 'array'
        then v_parts_quote -> 'items'
      else '[]'::jsonb
    end;
    v_snapshot_count := jsonb_array_length(v_snapshot_items);
    v_required_count := coalesce((v_parts_quote ->> 'required_count')::integer, v_snapshot_count);
    v_quoted_count := coalesce((v_parts_quote ->> 'quoted_count')::integer, 0);
    v_pending_count := coalesce(
      (v_parts_quote ->> 'pending_count')::integer,
      greatest(v_required_count - v_quoted_count, 0)
    );
    v_snapshot_total := coalesce((v_parts_quote ->> 'parts_total')::numeric, 0);

    if coalesce(
      (v_parts_quote -> 'pricing_sanitization' ->> 'customer_pricing_quarantined')::boolean,
      false
    ) then
      raise exception using
        errcode = 'P0001',
        message = 'QUOTE_PARTS_PRICING_UNAVAILABLE';
    end if;

    with active_requests as (
      select pr.id
      from public.part_requests pr
      where pr.shop_id = p_shop_id
        and pr.work_order_id = p_work_order_id
        and pr.quote_line_id = v_line.id
        and lower(coalesce(pr.status::text, 'requested')) not in (
          'cancelled', 'canceled', 'rejected', 'declined', 'voided'
        )
    ), live_items as (
      select
        pri.*,
        greatest(
          coalesce(pri.qty, 0),
          coalesce(pri.qty_requested, 0),
          coalesce(pri.qty_approved, 0),
          0
        ) as canonical_qty,
        coalesce(pri.quoted_price, pri.unit_price) as canonical_unit_price
      from active_requests ar
      join public.part_request_items pri on pri.request_id = ar.id
      where pri.shop_id = p_shop_id
        and pri.work_order_id = p_work_order_id
        and pri.quote_line_id = v_line.id
        and lower(coalesce(pri.status::text, 'requested')) not in (
          'cancelled', 'canceled', 'rejected', 'declined', 'voided'
        )
    )
    select
      count(*)::integer,
      coalesce(bool_and(public.part_request_item_is_quote_ready(
        description,
        part_id,
        requested_part_number,
        requested_manufacturer,
        canonical_qty,
        canonical_unit_price
      )), false),
      coalesce(round(sum(
        case when public.part_request_item_is_quote_ready(
          description,
          part_id,
          requested_part_number,
          requested_manufacturer,
          canonical_qty,
          canonical_unit_price
        ) then canonical_qty * canonical_unit_price else 0 end
      ), 2), 0)
    into v_live_count, v_all_live_ready, v_live_total
    from live_items;

    if v_live_count > 0 then
      if not v_all_live_ready then
        raise exception using
          errcode = 'P0001',
          message = 'QUOTE_PARTS_INCOMPLETE';
      end if;
      if v_required_count <> v_live_count
         or v_quoted_count <> v_live_count
         or v_pending_count <> 0
         or v_snapshot_count <> v_live_count
         or abs(v_snapshot_total - v_live_total) > 0.009
         or abs(coalesce(v_line.parts_total, 0) - v_live_total) > 0.009 then
        raise exception using
          errcode = 'P0001',
          message = 'QUOTE_PARTS_CONTRACT_MISMATCH';
      end if;

      if exists (
        with active_requests as (
          select pr.id
          from public.part_requests pr
          where pr.shop_id = p_shop_id
            and pr.work_order_id = p_work_order_id
            and pr.quote_line_id = v_line.id
            and lower(coalesce(pr.status::text, 'requested')) not in (
              'cancelled', 'canceled', 'rejected', 'declined', 'voided'
            )
        )
        select 1
        from active_requests ar
        join public.part_request_items pri on pri.request_id = ar.id
        where pri.shop_id = p_shop_id
          and pri.work_order_id = p_work_order_id
          and pri.quote_line_id = v_line.id
          and lower(coalesce(pri.status::text, 'requested')) not in (
            'cancelled', 'canceled', 'rejected', 'declined', 'voided'
          )
          and not exists (
            select 1
            from jsonb_array_elements(v_snapshot_items) snapshot(item)
            where snapshot.item ->> 'id' = pri.id::text
              and abs(
                (snapshot.item ->> 'qty')::numeric
                - greatest(
                    coalesce(pri.qty, 0),
                    coalesce(pri.qty_requested, 0),
                    coalesce(pri.qty_approved, 0),
                    0
                  )
              ) < 0.009
              and abs(
                (snapshot.item ->> 'unit_price')::numeric
                - coalesce(pri.quoted_price, pri.unit_price)
              ) < 0.009
              and abs(
                (snapshot.item ->> 'line_total')::numeric
                - round(
                    greatest(
                      coalesce(pri.qty, 0),
                      coalesce(pri.qty_requested, 0),
                      coalesce(pri.qty_approved, 0),
                      0
                    ) * coalesce(pri.quoted_price, pri.unit_price),
                    2
                  )
              ) < 0.009
          )
      ) then
        raise exception using
          errcode = 'P0001',
          message = 'QUOTE_PARTS_CONTRACT_MISMATCH';
      end if;
    elsif v_snapshot_count > 0 then
      if v_required_count <> v_snapshot_count
         or v_quoted_count <> v_snapshot_count
         or v_pending_count <> 0
         or exists (
           select 1
           from jsonb_array_elements(v_snapshot_items) snapshot(item)
           where nullif(trim(snapshot.item ->> 'description'), '') is null
              or coalesce((snapshot.item ->> 'qty')::numeric, 0) <= 0
              or snapshot.item ->> 'unit_price' is null
              or jsonb_typeof(snapshot.item -> 'unit_price') <> 'number'
              or (snapshot.item ->> 'unit_price')::numeric < 0
              or snapshot.item ->> 'line_total' is null
              or jsonb_typeof(snapshot.item -> 'line_total') <> 'number'
              or abs(
                (snapshot.item ->> 'line_total')::numeric
                - round(
                    (snapshot.item ->> 'qty')::numeric
                    * (snapshot.item ->> 'unit_price')::numeric,
                    2
                  )
              ) > 0.009
         )
         or abs(
           v_snapshot_total - coalesce((
             select round(sum((snapshot.item ->> 'line_total')::numeric), 2)
             from jsonb_array_elements(v_snapshot_items) snapshot(item)
           ), 0)
         ) > 0.009
         or abs(coalesce(v_line.parts_total, 0) - v_snapshot_total) > 0.009 then
        raise exception using
          errcode = 'P0001',
          message = 'QUOTE_PARTS_CONTRACT_MISMATCH';
      end if;
    elsif (
      coalesce(v_line.parts_total, 0) <> 0
      or coalesce(v_line.metadata, '{}'::jsonb) ->> 'parts_required' = 'true'
      or jsonb_array_length(
        case
          when jsonb_typeof(coalesce(v_line.metadata, '{}'::jsonb) -> 'parts') = 'array'
            then coalesce(v_line.metadata, '{}'::jsonb) -> 'parts'
          else '[]'::jsonb
        end
      ) > 0
    ) then
      raise exception using
        errcode = 'P0001',
        message = 'QUOTE_PARTS_CONTRACT_MISMATCH';
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'quote_line_count', v_line_count
  );
end;
$$;

revoke all on function public.assert_quote_parts_publishable(uuid, uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.assert_quote_parts_publishable(uuid, uuid, uuid[])
  to service_role;

comment on function public.assert_quote_parts_publishable(uuid, uuid, uuid[]) is
  'Service-only quote publish guard for canonical parts quantities, customer prices, snapshots, and totals.';

-- Legacy/non-estimate quote delivery also crosses an external provider
-- boundary. Reuse the durable estimate event ledger without changing the
-- existing estimate RPC contract, and freeze only the selected quote lines
-- while their customer email is in flight.
create or replace function private.guard_reserved_legacy_quote_line()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event_id uuid;
begin
  select event.id into v_event_id
  from public.estimate_events event
  where event.shop_id = old.shop_id
    and event.work_order_id = old.work_order_id
    and event.event_type = 'send_reserved'
    and event.snapshot ->> 'delivery_kind' = 'legacy_quote'
    and (
      event.result ->> 'delivery_state' = 'accepted'
      or (
        event.result ->> 'delivery_state' = 'sending'
        and event.updated_at > now() - interval '15 minutes'
      )
    )
    and old.id = any(array(
      select value::uuid
      from jsonb_array_elements_text(
        coalesce(event.snapshot -> 'quote_line_ids', '[]'::jsonb)
      ) value
    ))
  order by event.created_at desc
  limit 1;

  if v_event_id is not null
     and current_setting('app.legacy_quote_send_event_id', true)
       is distinct from v_event_id::text then
    raise exception using
      errcode = '40001',
      message = 'QUOTE_SEND_RESERVED';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function private.guard_reserved_legacy_quote_line()
  from public, anon, authenticated, service_role;

drop trigger if exists guard_reserved_legacy_quote_line
  on public.work_order_quote_lines;
create trigger guard_reserved_legacy_quote_line
before update or delete on public.work_order_quote_lines
for each row execute function private.guard_reserved_legacy_quote_line();

create or replace function public.transition_legacy_quote_send_atomic(
  p_action text,
  p_shop_id uuid,
  p_work_order_id uuid,
  p_operation_key text,
  p_actor_profile_id uuid,
  p_actor_user_id uuid,
  p_quote_line_ids uuid[],
  p_expected_lines jsonb,
  p_sent_at timestamptz,
  p_quote_url text,
  p_allow_resend boolean,
  p_failure text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_work_order public.work_orders%rowtype;
  v_event public.estimate_events%rowtype;
  v_selected uuid[];
  v_revision integer;
  v_expected_count integer := 0;
  v_valid_count integer := 0;
  v_updated_count integer := 0;
  v_delivery_state text;
  v_accepted_at timestamptz;
  v_has_approved boolean := false;
begin
  if v_action not in ('reserve', 'accept', 'finalize', 'release') then
    raise exception using errcode = '22023', message = 'QUOTE_SEND_ACTION_INVALID';
  end if;
  if p_shop_id is null or p_work_order_id is null then
    raise exception using errcode = '22023', message = 'QUOTE_SEND_SCOPE_INVALID';
  end if;
  if nullif(btrim(coalesce(p_operation_key, '')), '') is null
     or length(p_operation_key) > 200 then
    raise exception using errcode = '22023', message = 'QUOTE_SEND_KEY_INVALID';
  end if;
  if not exists (
    select 1
    from public.profiles profile
    where profile.id = p_actor_profile_id
      and profile.shop_id = p_shop_id
      and (profile.id = p_actor_user_id or profile.user_id = p_actor_user_id)
      and case lower(btrim(coalesce(profile.role::text, '')))
        when 'service_advisor' then 'service'
        when 'service advisor' then 'service'
        else lower(btrim(coalesce(profile.role::text, '')))
      end in ('owner', 'admin', 'manager', 'advisor', 'service', 'foreman')
  ) then
    raise exception using errcode = '42501', message = 'QUOTE_SEND_FORBIDDEN';
  end if;

  select * into v_work_order
  from public.work_orders work_order
  where work_order.id = p_work_order_id
    and work_order.shop_id = p_shop_id
  for update;
  if not found or v_work_order.estimate_number is not null then
    raise exception using errcode = 'P0002', message = 'LEGACY_QUOTE_NOT_FOUND';
  end if;
  v_revision := greatest(coalesce(v_work_order.estimate_revision, 1), 1);

  select * into v_event
  from public.estimate_events event
  where event.shop_id = p_shop_id
    and event.idempotency_key = p_operation_key
    and event.snapshot ->> 'delivery_kind' = 'legacy_quote'
  for update;

  if v_action = 'reserve' and v_event.id is null then
    select * into v_event
    from public.estimate_events event
    where event.shop_id = p_shop_id
      and event.work_order_id = p_work_order_id
      and event.revision = v_revision
      and event.event_type in ('send_reserved', 'send_failed', 'sent')
      and event.snapshot ->> 'delivery_kind' = 'legacy_quote'
    for update;
  end if;

  if v_action <> 'reserve' then
    if v_event.id is null
       or v_event.work_order_id is distinct from p_work_order_id then
      raise exception using errcode = 'P0002', message = 'QUOTE_SEND_RESERVATION_NOT_FOUND';
    end if;

    select email.sent_at into v_accepted_at
    from public.email_logs email
    where email.shop_id = p_shop_id
      and email.template_key = 'quote_ready'
      and lower(btrim(coalesce(email.status, ''))) <> 'suppressed'
      and email.metadata @> jsonb_build_object(
        'estimate_send_key', v_event.idempotency_key,
        'work_order_id', p_work_order_id
      )
      and email.sent_at is not null
    order by email.sent_at desc
    limit 1;

    if v_action = 'accept' then
      if p_sent_at is null then
        raise exception using errcode = '22023', message = 'QUOTE_SEND_ACCEPTED_AT_REQUIRED';
      end if;
      update public.estimate_events event
      set result = coalesce(event.result, '{}'::jsonb) || jsonb_build_object(
            'delivery_state', 'accepted',
            'accepted_at', p_sent_at
          ),
          updated_at = now()
      where event.id = v_event.id
        and event.event_type = 'send_reserved';
      return jsonb_build_object(
        'ok', true, 'eventId', v_event.id, 'deliveryState', 'accepted'
      );
    end if;

    if v_action = 'release' then
      if coalesce(
        nullif(v_event.result ->> 'accepted_at', '')::timestamptz,
        v_accepted_at
      ) is not null then
        update public.estimate_events event
        set result = coalesce(event.result, '{}'::jsonb) || jsonb_build_object(
              'delivery_state', 'accepted',
              'accepted_at', coalesce(
                nullif(event.result ->> 'accepted_at', '')::timestamptz,
                v_accepted_at
              )
            ),
            updated_at = now()
        where event.id = v_event.id;
        return jsonb_build_object(
          'ok', true, 'eventId', v_event.id, 'deliveryState', 'accepted'
        );
      end if;
      update public.estimate_events event
      set event_type = 'send_failed',
          result = jsonb_build_object(
            'delivery_kind', 'legacy_quote',
            'delivery_state', 'failed',
            'failure', left(coalesce(p_failure, 'Quote delivery failed.'), 500)
          ),
          updated_at = now()
      where event.id = v_event.id
        and event.event_type = 'send_reserved';
      return jsonb_build_object(
        'ok', true, 'eventId', v_event.id, 'deliveryState', 'failed'
      );
    end if;

    v_accepted_at := coalesce(
      nullif(v_event.result ->> 'accepted_at', '')::timestamptz,
      v_accepted_at,
      p_sent_at
    );
    if v_accepted_at is null then
      raise exception using errcode = '55000', message = 'QUOTE_SEND_NOT_ACCEPTED';
    end if;

    v_selected := array(
      select distinct value::uuid
      from jsonb_array_elements_text(
        coalesce(v_event.snapshot -> 'quote_line_ids', '[]'::jsonb)
      ) value
      order by value::uuid
    );
    if coalesce(cardinality(v_selected), 0) = 0 then
      raise exception using errcode = '22023', message = 'QUOTE_SEND_LINES_INVALID';
    end if;

    perform set_config('app.legacy_quote_send_event_id', v_event.id::text, true);
    perform line.id
    from public.work_order_quote_lines line
    where line.shop_id = p_shop_id
      and line.work_order_id = p_work_order_id
      and line.id = any(v_selected)
    order by line.id
    for update;

    update public.work_order_quote_lines line
    set status = 'sent',
        stage = 'sent',
        sent_to_customer_at = v_accepted_at,
        sent_at = v_accepted_at,
        sent_by = p_actor_user_id,
        updated_at = v_accepted_at
    where line.shop_id = p_shop_id
      and line.work_order_id = p_work_order_id
      and line.id = any(v_selected)
      and lower(btrim(coalesce(line.status::text, ''))) not in (
        'cancelled', 'canceled', 'rejected', 'superseded', 'voided'
      );
    get diagnostics v_updated_count = row_count;
    if v_updated_count <> cardinality(v_selected) then
      raise exception using errcode = '40001', message = 'QUOTE_SEND_LINES_CHANGED';
    end if;

    select exists (
      select 1
      from public.work_order_quote_lines line
      where line.shop_id = p_shop_id
        and line.work_order_id = p_work_order_id
        and (
          line.approved_at is not null
          or lower(btrim(coalesce(line.status::text, ''))) in ('approved', 'converted')
        )
    ) into v_has_approved;

    update public.work_orders work_order
    set quote_url = coalesce(nullif(btrim(coalesce(p_quote_url, '')), ''), work_order.quote_url),
        approval_state = case when v_has_approved then 'partial' else 'pending' end,
        updated_at = v_accepted_at
    where work_order.id = p_work_order_id
      and work_order.shop_id = p_shop_id;

    update public.estimate_events event
    set event_type = 'sent',
        result = coalesce(event.result, '{}'::jsonb) || jsonb_build_object(
          'delivery_kind', 'legacy_quote',
          'delivery_state', 'sent',
          'accepted_at', v_accepted_at,
          'sent_at', v_accepted_at,
          'quote_url', p_quote_url
        ),
        updated_at = v_accepted_at
    where event.id = v_event.id;

    return jsonb_build_object(
      'ok', true, 'eventId', v_event.id, 'deliveryState', 'sent',
      'sentAt', v_accepted_at
    );
  end if;

  if v_event.id is not null and v_event.event_type = 'sent'
     and not coalesce(p_allow_resend, false) then
    return jsonb_build_object(
      'ok', true, 'eventId', v_event.id, 'deliveryState', 'sent',
      'replay', true
    );
  end if;

  if v_event.id is not null and v_event.event_type = 'send_reserved' then
    select email.sent_at into v_accepted_at
    from public.email_logs email
    where email.shop_id = p_shop_id
      and email.template_key = 'quote_ready'
      and lower(btrim(coalesce(email.status, ''))) <> 'suppressed'
      and email.metadata @> jsonb_build_object(
        'estimate_send_key', v_event.idempotency_key,
        'work_order_id', p_work_order_id
      )
      and email.sent_at is not null
    order by email.sent_at desc
    limit 1;
    v_delivery_state := case
      when coalesce(
        nullif(v_event.result ->> 'accepted_at', '')::timestamptz,
        v_accepted_at
      ) is not null then 'accepted'
      else coalesce(v_event.result ->> 'delivery_state', 'sending')
    end;
    if v_delivery_state = 'accepted' then
      update public.estimate_events event
      set result = coalesce(event.result, '{}'::jsonb) || jsonb_build_object(
            'delivery_kind', 'legacy_quote',
            'delivery_state', 'accepted',
            'accepted_at', coalesce(
              nullif(event.result ->> 'accepted_at', '')::timestamptz,
              v_accepted_at
            )
          ),
          updated_at = now()
      where event.id = v_event.id;
      return jsonb_build_object(
        'ok', true, 'eventId', v_event.id, 'deliveryState', 'accepted',
        'replay', true
      );
    end if;
    if v_event.updated_at > now() - interval '15 minutes' then
      return jsonb_build_object(
        'ok', true, 'eventId', v_event.id, 'deliveryState', 'sending',
        'replay', true
      );
    end if;
  end if;

  if jsonb_typeof(coalesce(p_expected_lines, 'null'::jsonb)) <> 'array' then
    raise exception using errcode = '22023', message = 'QUOTE_SEND_SNAPSHOT_INVALID';
  end if;
  v_expected_count := jsonb_array_length(p_expected_lines);
  v_selected := array(
    select distinct (expected.item ->> 'id')::uuid
    from jsonb_array_elements(p_expected_lines) expected(item)
    order by (expected.item ->> 'id')::uuid
  );
  if v_expected_count = 0
     or v_expected_count <> cardinality(v_selected)
     or cardinality(v_selected) > 50
     or v_selected is distinct from array(
       select distinct line_id
       from unnest(coalesce(p_quote_line_ids, '{}'::uuid[])) line_id
       where line_id is not null
       order by line_id
     ) then
    raise exception using errcode = '22023', message = 'QUOTE_SEND_LINES_INVALID';
  end if;

  perform line.id
  from public.work_order_quote_lines line
  where line.shop_id = p_shop_id
    and line.work_order_id = p_work_order_id
    and line.id = any(v_selected)
  order by line.id
  for update;

  select count(*) into v_valid_count
  from public.work_order_quote_lines line
  join jsonb_array_elements(p_expected_lines) expected(item)
    on expected.item ->> 'id' = line.id::text
  where line.shop_id = p_shop_id
    and line.work_order_id = p_work_order_id
    and line.id = any(v_selected)
    and line.updated_at is not distinct from
      (expected.item ->> 'updated_at')::timestamptz
    and line.approved_at is null
    and line.declined_at is null
    and line.work_order_line_id is null
    and (
      (
        line.sent_to_customer_at is null
        and (
          lower(btrim(coalesce(line.status::text, ''))) in (
            'advisor_pending', 'ready_to_send', 'quoted'
          )
          or lower(btrim(coalesce(line.stage::text, ''))) in (
            'advisor_pending', 'ready_to_send'
          )
        )
      )
      or (
        coalesce(p_allow_resend, false)
        and line.sent_to_customer_at is not null
        and lower(btrim(coalesce(line.status::text, ''))) = 'sent'
      )
    );
  if v_valid_count <> cardinality(v_selected) then
    raise exception using errcode = '40001', message = 'QUOTE_SEND_SNAPSHOT_CHANGED';
  end if;

  perform public.assert_quote_parts_publishable(
    p_shop_id, p_work_order_id, v_selected
  );

  if v_event.id is null then
    insert into public.estimate_events(
      shop_id, work_order_id, revision, event_type, actor_profile_id,
      snapshot, result, idempotency_key
    ) values (
      p_shop_id, p_work_order_id, v_revision, 'send_reserved', p_actor_profile_id,
      jsonb_build_object(
        'delivery_kind', 'legacy_quote',
        'quote_line_ids', to_jsonb(v_selected),
        'expected_lines', p_expected_lines,
        'actor_user_id', p_actor_user_id,
        'request_allows_resend', coalesce(p_allow_resend, false)
      ),
      jsonb_build_object(
        'delivery_kind', 'legacy_quote',
        'delivery_state', 'sending'
      ),
      p_operation_key
    ) returning * into v_event;
  else
    update public.estimate_events event
    set event_type = 'send_reserved',
        actor_profile_id = p_actor_profile_id,
        idempotency_key = p_operation_key,
        snapshot = jsonb_build_object(
          'delivery_kind', 'legacy_quote',
          'quote_line_ids', to_jsonb(v_selected),
          'expected_lines', p_expected_lines,
          'actor_user_id', p_actor_user_id,
          'request_allows_resend', coalesce(p_allow_resend, false)
        ),
        result = jsonb_build_object(
          'delivery_kind', 'legacy_quote',
          'delivery_state', 'sending'
        ),
        updated_at = now()
    where event.id = v_event.id
    returning * into v_event;
  end if;

  return jsonb_build_object(
    'ok', true, 'eventId', v_event.id, 'deliveryState', 'sending',
    'replay', false
  );
end;
$$;

revoke all on function public.transition_legacy_quote_send_atomic(
  text, uuid, uuid, text, uuid, uuid, uuid[], jsonb,
  timestamptz, text, boolean, text
) from public, anon, authenticated, service_role;
grant execute on function public.transition_legacy_quote_send_atomic(
  text, uuid, uuid, text, uuid, uuid, uuid[], jsonb,
  timestamptz, text, boolean, text
) to service_role;

comment on function public.transition_legacy_quote_send_atomic(
  text, uuid, uuid, text, uuid, uuid, uuid[], jsonb,
  timestamptz, text, boolean, text
) is 'Service-only reservation, provider-acceptance recovery, and atomic finalization for non-estimate quote delivery.';

commit;
