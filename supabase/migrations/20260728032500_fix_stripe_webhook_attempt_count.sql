-- Qualify receipt-column references inside the table-returning claim RPC.
--
-- `attempt_count` is both an OUT parameter and a receipt-table column. PL/pgSQL
-- therefore rejects the unqualified retry update as ambiguous. Keep the public
-- function contract unchanged and make every target-table reference explicit.

begin;

create or replace function public.claim_stripe_webhook_event(
  p_event_id text,
  p_event_type text,
  p_livemode boolean,
  p_stripe_account_id text,
  p_object_id text,
  p_event_created_at timestamptz,
  p_lease_seconds integer
)
returns table (
  claimed boolean,
  already_processed boolean,
  in_progress boolean,
  claim_token uuid,
  attempt_count integer
)
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_receipt private.stripe_webhook_event_receipts%rowtype;
  v_claim_token uuid := gen_random_uuid();
begin
  if p_event_id is null or p_event_id !~ '^evt_[A-Za-z0-9_]+$' then
    raise exception using errcode = '22023', message = 'invalid Stripe event id';
  end if;
  if p_event_type is null or char_length(trim(p_event_type)) not between 3 and 200 then
    raise exception using errcode = '22023', message = 'invalid Stripe event type';
  end if;
  if p_event_created_at is null then
    raise exception using errcode = '22023', message = 'Stripe event creation time is required';
  end if;
  if p_lease_seconds is null or p_lease_seconds not between 30 and 3600 then
    raise exception using errcode = '22023', message = 'Stripe event lease must be between 30 and 3600 seconds';
  end if;

  insert into private.stripe_webhook_event_receipts (
    event_id,
    event_type,
    livemode,
    stripe_account_id,
    object_id,
    event_created_at,
    status,
    claim_token,
    claimed_at
  )
  values (
    p_event_id,
    trim(p_event_type),
    p_livemode,
    nullif(trim(coalesce(p_stripe_account_id, '')), ''),
    nullif(trim(coalesce(p_object_id, '')), ''),
    p_event_created_at,
    'processing',
    v_claim_token,
    now()
  )
  on conflict (event_id) do nothing
  returning * into v_receipt;

  if found then
    return query
    select true, false, false, v_receipt.claim_token, v_receipt.attempt_count;
    return;
  end if;

  select receipt.*
  into v_receipt
  from private.stripe_webhook_event_receipts as receipt
  where receipt.event_id = p_event_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Stripe event receipt disappeared during claim';
  end if;

  if v_receipt.event_type <> trim(p_event_type)
     or v_receipt.livemode is distinct from p_livemode
     or v_receipt.stripe_account_id is distinct from nullif(trim(coalesce(p_stripe_account_id, '')), '')
     or v_receipt.object_id is distinct from nullif(trim(coalesce(p_object_id, '')), '')
     or v_receipt.event_created_at is distinct from p_event_created_at then
    raise exception using errcode = '22023', message = 'Stripe event receipt metadata conflict';
  end if;

  update private.stripe_webhook_event_receipts as receipt
  set delivery_count = receipt.delivery_count + 1,
      last_received_at = now(),
      updated_at = now()
  where receipt.event_id = p_event_id
  returning receipt.* into v_receipt;

  if v_receipt.status = 'processed' then
    return query
    select false, true, false, null::uuid, v_receipt.attempt_count;
    return;
  end if;

  if v_receipt.status = 'processing'
     and v_receipt.claimed_at is not null
     and v_receipt.claimed_at > now() - make_interval(secs => p_lease_seconds) then
    return query
    select false, false, true, null::uuid, v_receipt.attempt_count;
    return;
  end if;

  v_claim_token := gen_random_uuid();
  update private.stripe_webhook_event_receipts as receipt
  set status = 'processing',
      claim_token = v_claim_token,
      attempt_count = receipt.attempt_count + 1,
      claimed_at = now(),
      processed_at = null,
      failed_at = null,
      last_error = null,
      updated_at = now()
  where receipt.event_id = p_event_id
  returning receipt.* into v_receipt;

  return query
  select true, false, false, v_receipt.claim_token, v_receipt.attempt_count;
end;
$$;

revoke all on function public.claim_stripe_webhook_event(text, text, boolean, text, text, timestamptz, integer)
  from public, anon, authenticated;

grant execute on function public.claim_stripe_webhook_event(text, text, boolean, text, text, timestamptz, integer)
  to service_role;

commit;
