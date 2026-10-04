\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email, raw_user_meta_data)
values
  ('a1000000-0000-4000-8000-0000000000a1', 'pq-anchor-owner@example.com', '{"full_name":"PQ Owner"}'::jsonb),
  ('a1000000-0000-4000-8000-0000000000a2', 'pq-anchor-customer@example.com', '{}'::jsonb)
on conflict (id) do nothing;

insert into public.profiles (id, user_id, role, full_name)
values ('a1000000-0000-4000-8000-0000000000a1', 'a1000000-0000-4000-8000-0000000000a1', 'owner', 'PQ Owner')
on conflict (id) do update set user_id = excluded.user_id, role = excluded.role;

delete from public.profiles where id = 'a1000000-0000-4000-8000-0000000000a2';

insert into public.shops (id, owner_id, business_name, name, plan, user_limit)
values ('a1000000-0000-4000-8000-0000000000b1', 'a1000000-0000-4000-8000-0000000000a1',
        'PQ Anchor Shop', 'PQ Anchor Shop', 'complete_10', 1)
on conflict (id) do nothing;

update public.profiles set shop_id = 'a1000000-0000-4000-8000-0000000000b1'
where id = 'a1000000-0000-4000-8000-0000000000a1';

insert into public.customers (id, shop_id, user_id, name, email)
values ('a1000000-0000-4000-8000-0000000000c1', 'a1000000-0000-4000-8000-0000000000b1',
        'a1000000-0000-4000-8000-0000000000a2', 'PQ Customer', 'pq-anchor-customer@example.com')
on conflict (id) do update set shop_id = excluded.shop_id, user_id = excluded.user_id;

insert into public.vehicles (id, shop_id, customer_id, vin, year, make, model)
values ('a1000000-0000-4000-8000-0000000000d1', 'a1000000-0000-4000-8000-0000000000b1',
        'a1000000-0000-4000-8000-0000000000c1', '1HGCM82633A0A1001', 2020, 'Honda', 'Accord')
on conflict (id) do nothing;

insert into public.customer_portal_invites (id, shop_id, customer_id, email, token, accepted_at, accepted_by_user_id, revoked_at)
values ('a1000000-0000-4000-8000-0000000000e1', 'a1000000-0000-4000-8000-0000000000b1',
        'a1000000-0000-4000-8000-0000000000c1', 'pq-anchor-customer@example.com',
        'a1000000-0000-4000-8000-0000000000f1', now(), 'a1000000-0000-4000-8000-0000000000a2', null)
on conflict (id) do nothing;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);

create temp table pq_result (stage text, body jsonb);
grant all on pq_result to authenticated;

insert into pq_result
select 'create', public.create_portal_parts_quote_request_atomic(
  'a1000000-0000-4000-8000-0000000000b1', 'a1000000-0000-4000-8000-0000000000c1',
  'a1000000-0000-4000-8000-0000000000d1', 'a1000000-0000-4000-8000-0000000000a2',
  'Front brake pads', 'ceramic', 2, 'pq-anchor-op-1');

reset role;

do $before$
begin
  if exists (select 1 from public.work_orders where external_id like 'portal_parts_quote:%'
             and shop_id = 'a1000000-0000-4000-8000-0000000000b1') then
    raise exception 'A parts-only quote must not create a work order before approval';
  end if;
end
$before$;

-- Parts prices the item, the worker freezes and sends the quote.
update public.part_request_items
set quoted_price = 50, unit_price = 50
where request_id = ((select body ->> 'partRequestId' from pq_result where stage = 'create'))::uuid;

select public.price_portal_parts_quote_request(
  ((select body ->> 'requestId' from pq_result where stage = 'create'))::uuid, 0, 'cad');
select public.claim_portal_parts_quote_request_send(
  ((select body ->> 'requestId' from pq_result where stage = 'create'))::uuid, 600);
select public.mark_portal_parts_quote_request_sent(
  ((select body ->> 'requestId' from pq_result where stage = 'create'))::uuid, now());

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);

insert into pq_result
select 'approve', public.decide_portal_parts_quote_request_atomic(
  ((select body ->> 'requestId' from pq_result where stage = 'create'))::uuid,
  'a1000000-0000-4000-8000-0000000000c1', 'a1000000-0000-4000-8000-0000000000a2',
  'approve', 'order_parts', now());

reset role;

do $after$
declare
  v_quote public.portal_parts_quote_requests%rowtype;
  v_old uuid := ((select body ->> 'partRequestId' from pq_result where stage = 'create'))::uuid;
  v_wo uuid := ((select body ->> 'workOrderId' from pq_result where stage = 'approve'))::uuid;
  v_item public.part_request_items%rowtype;
begin
  select * into v_quote from public.portal_parts_quote_requests
  where id = ((select body ->> 'requestId' from pq_result where stage = 'create'))::uuid;

  if v_quote.status <> 'approved' then raise exception 'quote not approved: %', v_quote.status; end if;
  if v_wo is null then raise exception 'approval did not create a work order'; end if;
  if v_quote.part_request_id = v_old then raise exception 'quote was not re-pointed to the anchored request'; end if;

  if not exists (select 1 from public.work_orders wo where wo.id = v_wo
    and wo.customer_id = v_quote.customer_id and wo.vehicle_id = v_quote.vehicle_id
    and wo.shop_id = v_quote.shop_id) then
    raise exception 'work order scope is wrong';
  end if;

  if not exists (select 1 from public.work_order_lines l where l.work_order_id = v_wo
    and l.approval_state = 'approved' and l.line_status = 'authorized') then
    raise exception 'approved job line missing';
  end if;

  select * into v_item from public.part_request_items where request_id = v_quote.part_request_id;
  if v_item.work_order_id is distinct from v_wo or v_item.work_order_line_id is null then
    raise exception 'item is not anchored to the work order line';
  end if;
  if v_item.quoted_price <> 50 or v_item.qty_approved <> 2 or v_item.approved is not true then
    raise exception 'item did not keep the quoted price, qty and approval';
  end if;

  if not exists (select 1 from public.part_requests where id = v_old and status::text = 'cancelled') then
    raise exception 'unanchored request was not cancelled';
  end if;

  if (select count(*) from public.work_orders where external_id = 'portal_parts_quote:' || v_quote.id::text) <> 1 then
    raise exception 'expected exactly one work order for the quote';
  end if;
end
$after$;

-- Replaying the approval is idempotent and creates nothing more.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);
select public.decide_portal_parts_quote_request_atomic(
  ((select body ->> 'requestId' from pq_result where stage = 'create'))::uuid,
  'a1000000-0000-4000-8000-0000000000c1', 'a1000000-0000-4000-8000-0000000000a2',
  'approve', 'order_parts', now());
reset role;

do $replay$
begin
  if (select count(*) from public.work_orders where shop_id = 'a1000000-0000-4000-8000-0000000000b1'
      and external_id like 'portal_parts_quote:%') <> 1 then
    raise exception 'replayed approval created another work order';
  end if;
end
$replay$;

rollback;
