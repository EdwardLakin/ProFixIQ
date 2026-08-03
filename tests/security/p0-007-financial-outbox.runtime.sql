\set ON_ERROR_STOP on

begin;

do $$
declare
  v_signature text;
begin
  foreach v_signature in array array[
    'public.claim_financial_outbox_batch(uuid,integer,integer)',
    'public.claim_financial_outbox_delivery(uuid,uuid,text,text,integer)',
    'public.begin_financial_outbox_delivery(uuid,uuid,integer)',
    'public.accept_financial_outbox_delivery(uuid,uuid,text)',
    'public.mark_financial_outbox_delivery_ambiguous(uuid,uuid,text)',
    'public.release_financial_outbox_claim(uuid,uuid,text,timestamptz)',
    'public.complete_financial_outbox_claim(uuid,uuid)'
  ]
  loop
    if has_function_privilege('anon', v_signature, 'EXECUTE')
       or has_function_privilege('authenticated', v_signature, 'EXECUTE')
       or not has_function_privilege('service_role', v_signature, 'EXECUTE') then
      raise exception 'P0-007 runtime assertion failed: unsafe function ACL for %', v_signature;
    end if;
  end loop;

  if has_table_privilege('anon', 'private.financial_outbox_deliveries', 'SELECT')
     or has_table_privilege('authenticated', 'private.financial_outbox_deliveries', 'SELECT')
     or has_table_privilege('service_role', 'private.financial_outbox_deliveries', 'SELECT') then
    raise exception 'P0-007 runtime assertion failed: delivery ledger is directly exposed';
  end if;
end
$$;

insert into auth.users (id, email, raw_user_meta_data)
values (
  '77000000-0000-4000-8000-000000000001',
  'p0-007-owner@example.com',
  '{"full_name":"P0-007 Owner"}'::jsonb
)
on conflict (id) do nothing;

insert into public.profiles (id, user_id, role, full_name, shop_id)
values (
  '77000000-0000-4000-8000-000000000001',
  '77000000-0000-4000-8000-000000000001',
  'owner',
  'P0-007 Owner',
  null
)
on conflict (id) do update
set user_id = excluded.user_id,
    role = excluded.role,
    full_name = excluded.full_name,
    shop_id = excluded.shop_id;

insert into public.shops (id, owner_id, business_name, name, user_limit)
values (
  'e7100000-0000-4000-8000-000000000001',
  '77000000-0000-4000-8000-000000000001',
  'P0-007 Shop',
  'P0-007 Shop',
  3
)
on conflict (id) do nothing;

insert into public.financial_domain_outbox (
  id,
  shop_id,
  aggregate_type,
  aggregate_id,
  event_type,
  dedupe_key,
  payload,
  occurred_at
)
values
  (
    'a7000000-0000-4000-8000-000000000001',
    'e7100000-0000-4000-8000-000000000001',
    'payment_event',
    'b7000000-0000-4000-8000-000000000001',
    'payment.failed',
    'p0-007:accepted-retry',
    '{}'::jsonb,
    now() - interval '5 minutes'
  ),
  (
    'a7000000-0000-4000-8000-000000000002',
    'e7100000-0000-4000-8000-000000000001',
    'payment_event',
    'b7000000-0000-4000-8000-000000000002',
    'payment.failed',
    'p0-007:crash-after-send',
    '{}'::jsonb,
    now() - interval '4 minutes'
  ),
  (
    'a7000000-0000-4000-8000-000000000003',
    'e7100000-0000-4000-8000-000000000001',
    'payment_event',
    'b7000000-0000-4000-8000-000000000003',
    'payment.failed',
    'p0-007:crash-before-send',
    '{}'::jsonb,
    now() - interval '3 minutes'
  ),
  (
    'a7000000-0000-4000-8000-000000000004',
    'e7100000-0000-4000-8000-000000000001',
    'payment_event',
    'b7000000-0000-4000-8000-000000000004',
    'payment.failed',
    'p0-007:partial-recipient',
    '{}'::jsonb,
    now() - interval '2 minutes'
  )
on conflict (id) do nothing;

set local role service_role;

do $$
declare
  v_worker_a uuid := '71000000-0000-4000-8000-000000000001';
  v_worker_b uuid := '72000000-0000-4000-8000-000000000002';
  v_row_a uuid;
  v_row_b uuid;
  v_delivery_id uuid;
  v_delivery_key text;
  v_delivery_status text;
  v_should_send boolean;
  v_attempts integer;
  v_ok boolean;
begin
  select outbox_id into v_row_a
  from public.claim_financial_outbox_batch(v_worker_a, 1, 120);
  select outbox_id into v_row_b
  from public.claim_financial_outbox_batch(v_worker_b, 1, 120);

  if v_row_a <> 'a7000000-0000-4000-8000-000000000001'::uuid
     or v_row_b <> 'a7000000-0000-4000-8000-000000000002'::uuid
     or v_row_a = v_row_b then
    raise exception 'P0-007 runtime assertion failed: overlapping workers claimed the same row';
  end if;

  select delivery_id, delivery_key, delivery_status, should_send, delivery_attempts
  into v_delivery_id, v_delivery_key, v_delivery_status, v_should_send, v_attempts
  from public.claim_financial_outbox_delivery(
    v_row_a,
    v_worker_a,
    'customer',
    'customer@example.com',
    120
  );
  if not v_should_send or v_delivery_status <> 'claimed' or v_attempts <> 1 then
    raise exception 'P0-007 runtime assertion failed: first recipient claim was invalid';
  end if;

  select public.begin_financial_outbox_delivery(v_delivery_id, v_worker_a, 120) into v_ok;
  if not v_ok then
    raise exception 'P0-007 runtime assertion failed: send boundary did not start';
  end if;
  select public.accept_financial_outbox_delivery(v_delivery_id, v_worker_a, 'sg-p0-007-a') into v_ok;
  if not v_ok then
    raise exception 'P0-007 runtime assertion failed: accepted delivery was not recorded';
  end if;

  select delivery_status, should_send, delivery_attempts
  into v_delivery_status, v_should_send, v_attempts
  from public.claim_financial_outbox_delivery(
    v_row_a,
    v_worker_a,
    'customer',
    'customer@example.com',
    120
  );
  if v_should_send or v_delivery_status <> 'accepted' or v_attempts <> 1 then
    raise exception 'P0-007 runtime assertion failed: accepted recipient was claimable twice';
  end if;

  select public.complete_financial_outbox_claim(v_row_a, v_worker_a) into v_ok;
  if not v_ok then
    raise exception 'P0-007 runtime assertion failed: terminal outbox row did not complete';
  end if;

  select delivery_id, delivery_key, should_send
  into v_delivery_id, v_delivery_key, v_should_send
  from public.claim_financial_outbox_delivery(
    v_row_b,
    v_worker_b,
    'staff',
    'staff@example.com',
    120
  );
  if not v_should_send then
    raise exception 'P0-007 runtime assertion failed: crash fixture delivery was not claimed';
  end if;
  select public.begin_financial_outbox_delivery(v_delivery_id, v_worker_b, 120) into v_ok;
  if not v_ok then
    raise exception 'P0-007 runtime assertion failed: crash fixture send boundary did not start';
  end if;
end
$$;

reset role;

-- Simulate a worker disappearing after the provider request began but before
-- its acceptance acknowledgement was stored.
update private.financial_outbox_deliveries
set lease_expires_at = now() - interval '1 second'
where outbox_id = 'a7000000-0000-4000-8000-000000000002';
update public.financial_domain_outbox
set lease_expires_at = now() - interval '1 second'
where id = 'a7000000-0000-4000-8000-000000000002';

set local role service_role;

do $$
declare
  v_worker_c uuid := '73000000-0000-4000-8000-000000000003';
  v_claimed_row uuid;
begin
  select outbox_id into v_claimed_row
  from public.claim_financial_outbox_batch(v_worker_c, 1, 120);
  if v_claimed_row = 'a7000000-0000-4000-8000-000000000002'::uuid then
    raise exception 'P0-007 runtime assertion failed: crash-after-send delivery was retried';
  end if;

  -- Release the unrelated row claimed while proving the ambiguous row was
  -- skipped so the next crash-boundary case can exercise it.
  if v_claimed_row is not null then
    perform public.release_financial_outbox_claim(
      v_claimed_row,
      v_worker_c,
      'released after ambiguity isolation check',
      now()
    );
  end if;
end
$$;

reset role;

do $$
declare
  v_status text;
begin
  select status
  into v_status
  from private.financial_outbox_deliveries
  where outbox_id = 'a7000000-0000-4000-8000-000000000002';
  if v_status <> 'ambiguous' then
    raise exception 'P0-007 runtime assertion failed: expired send was not made ambiguous';
  end if;
end
$$;

set local role service_role;

do $$
declare
  v_delivery_key text := 'fin_a7000000000040008000000000000002_staff';
  v_processed boolean;
begin
  select public.process_sendgrid_delivery_event(
    null,
    'sg-event-p0-007-crash',
    'sg-message-p0-007-crash',
    'processed',
    now(),
    null,
    jsonb_build_object('financial_delivery_key', v_delivery_key),
    null
  ) into v_processed;
  if not v_processed then
    raise exception 'P0-007 runtime assertion failed: provider reconciliation was not recorded';
  end if;
end
$$;

reset role;

do $$
declare
  v_status text;
begin
  select status into v_status
  from private.financial_outbox_deliveries
  where outbox_id = 'a7000000-0000-4000-8000-000000000002';
  if v_status <> 'accepted' then
    raise exception 'P0-007 runtime assertion failed: provider event did not resolve ambiguity';
  end if;

  if not exists (
    select 1 from public.financial_domain_outbox
    where id = 'a7000000-0000-4000-8000-000000000002'
      and delivered_at is not null
  ) then
    raise exception 'P0-007 runtime assertion failed: reconciled outbox row did not complete';
  end if;
end
$$;

set local role service_role;

-- Claim the third row and reserve its recipient without crossing the provider
-- send boundary. That expired lease is safe for a different worker to reclaim.
do $$
declare
  v_worker uuid := '74000000-0000-4000-8000-000000000004';
  v_row uuid;
  v_should_send boolean;
begin
  select outbox_id into v_row
  from public.claim_financial_outbox_batch(v_worker, 1, 120);
  if v_row <> 'a7000000-0000-4000-8000-000000000003'::uuid then
    raise exception 'P0-007 runtime assertion failed: pre-send crash fixture was not claimed';
  end if;

  select should_send into v_should_send
  from public.claim_financial_outbox_delivery(
    v_row,
    v_worker,
    'customer',
    'customer@example.com',
    120
  );
  if not v_should_send then
    raise exception 'P0-007 runtime assertion failed: pre-send delivery was not reserved';
  end if;
end
$$;

reset role;

update private.financial_outbox_deliveries
set lease_expires_at = now() - interval '1 second'
where outbox_id = 'a7000000-0000-4000-8000-000000000003';
update public.financial_domain_outbox
set lease_expires_at = now() - interval '1 second'
where id = 'a7000000-0000-4000-8000-000000000003';

set local role service_role;

do $$
declare
  v_worker uuid := '75000000-0000-4000-8000-000000000005';
  v_row uuid;
  v_delivery_id uuid;
  v_status text;
  v_should_send boolean;
  v_attempts integer;
  v_ok boolean;
begin
  select outbox_id into v_row
  from public.claim_financial_outbox_batch(v_worker, 1, 120);
  if v_row <> 'a7000000-0000-4000-8000-000000000003'::uuid then
    raise exception 'P0-007 runtime assertion failed: expired pre-send row was not reclaimed';
  end if;

  select delivery_id, delivery_status, should_send, delivery_attempts
  into v_delivery_id, v_status, v_should_send, v_attempts
  from public.claim_financial_outbox_delivery(
    v_row,
    v_worker,
    'customer',
    'customer@example.com',
    120
  );
  if not v_should_send or v_status <> 'claimed' or v_attempts <> 2 then
    raise exception 'P0-007 runtime assertion failed: safe pre-send reclaim did not occur';
  end if;
  perform public.begin_financial_outbox_delivery(v_delivery_id, v_worker, 120);
  perform public.accept_financial_outbox_delivery(v_delivery_id, v_worker, 'sg-p0-007-c');
  select public.complete_financial_outbox_claim(v_row, v_worker) into v_ok;
  if not v_ok then
    raise exception 'P0-007 runtime assertion failed: reclaimed delivery did not complete';
  end if;
end
$$;

-- A retry after only the customer delivery completed must not resend the
-- customer while the staff recipient is still pending.
do $$
declare
  v_worker_a uuid := '76000000-0000-4000-8000-000000000006';
  v_worker_b uuid := '76000000-0000-4000-8000-000000000007';
  v_row uuid;
  v_delivery_id uuid;
  v_status text;
  v_should_send boolean;
  v_ok boolean;
begin
  select outbox_id into v_row
  from public.claim_financial_outbox_batch(v_worker_a, 1, 120);
  if v_row <> 'a7000000-0000-4000-8000-000000000004'::uuid then
    raise exception 'P0-007 runtime assertion failed: partial-recipient row was not claimed';
  end if;

  select delivery_id into v_delivery_id
  from public.claim_financial_outbox_delivery(
    v_row,
    v_worker_a,
    'customer',
    'customer@example.com',
    120
  );
  perform public.begin_financial_outbox_delivery(v_delivery_id, v_worker_a, 120);
  perform public.accept_financial_outbox_delivery(v_delivery_id, v_worker_a, 'sg-p0-007-d-customer');
  perform public.release_financial_outbox_claim(v_row, v_worker_a, 'worker stopped before staff delivery', now());

  select outbox_id into v_row
  from public.claim_financial_outbox_batch(v_worker_b, 1, 120);

  select delivery_status, should_send
  into v_status, v_should_send
  from public.claim_financial_outbox_delivery(
    v_row,
    v_worker_b,
    'customer',
    'customer@example.com',
    120
  );
  if v_should_send or v_status <> 'accepted' then
    raise exception 'P0-007 runtime assertion failed: completed customer delivery was duplicated';
  end if;

  select delivery_id, should_send
  into v_delivery_id, v_should_send
  from public.claim_financial_outbox_delivery(
    v_row,
    v_worker_b,
    'staff',
    'staff@example.com',
    120
  );
  if not v_should_send then
    raise exception 'P0-007 runtime assertion failed: pending staff delivery was not claimable';
  end if;
  perform public.begin_financial_outbox_delivery(v_delivery_id, v_worker_b, 120);
  perform public.accept_financial_outbox_delivery(v_delivery_id, v_worker_b, 'sg-p0-007-d-staff');
  select public.complete_financial_outbox_claim(v_row, v_worker_b) into v_ok;
  if not v_ok then
    raise exception 'P0-007 runtime assertion failed: customer/staff delivery pair did not complete';
  end if;
end
$$;

reset role;

do $$
begin
  if exists (
    select outbox_id, recipient_kind
    from private.financial_outbox_deliveries
    group by outbox_id, recipient_kind
    having count(*) > 1
  ) then
    raise exception 'P0-007 runtime assertion failed: duplicate per-recipient delivery identities exist';
  end if;

  if exists (
    select 1
    from public.financial_domain_outbox
    where id::text like 'a7000000-%'
      and delivered_at is null
  ) then
    raise exception 'P0-007 runtime assertion failed: verified outbox fixtures remain incomplete';
  end if;
end
$$;

rollback;
