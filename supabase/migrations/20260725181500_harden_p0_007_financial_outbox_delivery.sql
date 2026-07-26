begin;

create schema if not exists private;

alter table public.financial_domain_outbox
  add column if not exists lease_owner uuid,
  add column if not exists lease_expires_at timestamptz;

create index if not exists financial_domain_outbox_claim_idx
  on public.financial_domain_outbox (next_attempt_at, occurred_at)
  where delivered_at is null;

create table if not exists private.financial_outbox_deliveries (
  id uuid primary key default gen_random_uuid(),
  outbox_id uuid not null references public.financial_domain_outbox(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  recipient_kind text not null,
  recipient_email text not null,
  delivery_key text not null,
  status text not null default 'pending',
  provider text not null default 'sendgrid',
  provider_message_id text,
  attempts integer not null default 0,
  lease_owner uuid,
  lease_expires_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  send_started_at timestamptz,
  accepted_at timestamptz,
  delivered_at timestamptz,
  ambiguous_at timestamptz,
  last_provider_event_at timestamptz,
  last_provider_event_type text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financial_outbox_deliveries_recipient_kind_check
    check (recipient_kind in ('customer', 'staff')),
  constraint financial_outbox_deliveries_recipient_email_check
    check (
      char_length(recipient_email) between 3 and 320
      and recipient_email = lower(btrim(recipient_email))
      and recipient_email !~ '[\r\n]'
    ),
  constraint financial_outbox_deliveries_delivery_key_check
    check (delivery_key ~ '^fin_[0-9a-f]{32}_(customer|staff)$'),
  constraint financial_outbox_deliveries_status_check
    check (status in (
      'pending',
      'claimed',
      'sending',
      'accepted',
      'delivered',
      'bounced',
      'dropped',
      'failed',
      'ambiguous'
    )),
  constraint financial_outbox_deliveries_attempts_check
    check (attempts >= 0),
  unique (outbox_id, recipient_kind),
  unique (delivery_key)
);

create index if not exists financial_outbox_deliveries_reconcile_idx
  on private.financial_outbox_deliveries (status, lease_expires_at, next_attempt_at);

create index if not exists financial_outbox_deliveries_outbox_idx
  on private.financial_outbox_deliveries (outbox_id, status);

alter table private.financial_outbox_deliveries enable row level security;
alter table private.financial_outbox_deliveries force row level security;

revoke all on table private.financial_outbox_deliveries
  from public, anon, authenticated, service_role;

create or replace function public.claim_financial_outbox_batch(
  p_worker_id uuid,
  p_limit integer default 25,
  p_lease_seconds integer default 120
)
returns table (
  outbox_id uuid,
  shop_id uuid,
  aggregate_id uuid,
  event_type text,
  dedupe_key text,
  payload jsonb,
  attempts integer
)
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 25), 100));
  v_lease_seconds integer := greatest(30, least(coalesce(p_lease_seconds, 120), 900));
begin
  if p_worker_id is null then
    raise exception using errcode = '22023', message = 'financial outbox worker id is required';
  end if;

  -- An expired pre-send claim is safe to reclaim. Once a provider request has
  -- started, however, a missing acknowledgement is ambiguous and must be
  -- reconciled from the provider webhook instead of sent again.
  update private.financial_outbox_deliveries delivery
  set status = case
        when delivery.status = 'claimed' then 'pending'
        else 'ambiguous'
      end,
      ambiguous_at = case
        when delivery.status = 'sending' then coalesce(delivery.ambiguous_at, now())
        else delivery.ambiguous_at
      end,
      last_error = case
        when delivery.status = 'sending' then coalesce(
          delivery.last_error,
          'provider acknowledgement missing after delivery lease expired'
        )
        else delivery.last_error
      end,
      lease_owner = null,
      lease_expires_at = null,
      updated_at = now()
  where delivery.status in ('claimed', 'sending')
    and delivery.lease_expires_at <= now();

  return query
  with candidates as (
    select outbox.id
    from public.financial_domain_outbox outbox
    where outbox.delivered_at is null
      and outbox.next_attempt_at <= now()
      and (outbox.lease_expires_at is null or outbox.lease_expires_at <= now())
      and not exists (
        select 1
        from private.financial_outbox_deliveries delivery
        where delivery.outbox_id = outbox.id
          and delivery.status in ('claimed', 'sending', 'ambiguous')
      )
    order by outbox.occurred_at, outbox.id
    for update skip locked
    limit v_limit
  ), claimed_rows as (
    update public.financial_domain_outbox outbox
    set lease_owner = p_worker_id,
        lease_expires_at = now() + make_interval(secs => v_lease_seconds),
        processing_at = now(),
        attempts = outbox.attempts + 1,
        last_error = null
    from candidates
    where outbox.id = candidates.id
    returning outbox.*
  )
  select
    claimed_rows.id,
    claimed_rows.shop_id,
    claimed_rows.aggregate_id,
    claimed_rows.event_type,
    claimed_rows.dedupe_key,
    claimed_rows.payload,
    claimed_rows.attempts
  from claimed_rows
  order by claimed_rows.occurred_at, claimed_rows.id;
end;
$$;

create or replace function public.claim_financial_outbox_delivery(
  p_outbox_id uuid,
  p_worker_id uuid,
  p_recipient_kind text,
  p_recipient_email text,
  p_lease_seconds integer default 120
)
returns table (
  delivery_id uuid,
  delivery_key text,
  delivery_status text,
  should_send boolean,
  delivery_attempts integer
)
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_outbox public.financial_domain_outbox%rowtype;
  v_delivery private.financial_outbox_deliveries%rowtype;
  v_email text := lower(btrim(coalesce(p_recipient_email, '')));
  v_delivery_key text;
  v_lease_seconds integer := greatest(30, least(coalesce(p_lease_seconds, 120), 900));
begin
  if p_worker_id is null
     or p_recipient_kind not in ('customer', 'staff')
     or char_length(v_email) not between 3 and 320
     or v_email ~ '[\r\n]' then
    raise exception using errcode = '22023', message = 'invalid financial delivery claim';
  end if;

  select outbox.*
  into v_outbox
  from public.financial_domain_outbox outbox
  where outbox.id = p_outbox_id
    and outbox.delivered_at is null
    and outbox.lease_owner = p_worker_id
    and outbox.lease_expires_at > now()
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'financial outbox lease is not owned by worker';
  end if;

  v_delivery_key := 'fin_'
    || replace(p_outbox_id::text, '-', '')
    || '_'
    || p_recipient_kind;

  select delivery.*
  into v_delivery
  from private.financial_outbox_deliveries delivery
  where delivery.outbox_id = p_outbox_id
    and delivery.recipient_kind = p_recipient_kind
  for update;

  if not found then
    insert into private.financial_outbox_deliveries (
      outbox_id,
      shop_id,
      recipient_kind,
      recipient_email,
      delivery_key,
      status,
      attempts,
      lease_owner,
      lease_expires_at
    )
    values (
      p_outbox_id,
      v_outbox.shop_id,
      p_recipient_kind,
      v_email,
      v_delivery_key,
      'claimed',
      1,
      p_worker_id,
      now() + make_interval(secs => v_lease_seconds)
    )
    returning * into v_delivery;
  else
    if v_delivery.delivery_key <> v_delivery_key
       or v_delivery.shop_id <> v_outbox.shop_id then
      raise exception using errcode = '23505', message = 'financial delivery identity conflict';
    end if;

    if v_delivery.recipient_email <> v_email then
      if v_delivery.status not in ('pending', 'failed') then
        raise exception using errcode = '23505', message = 'financial delivery recipient is immutable after claim';
      end if;
      update private.financial_outbox_deliveries
      set recipient_email = v_email,
          updated_at = now()
      where id = v_delivery.id
      returning * into v_delivery;
    end if;

    if v_delivery.status = 'claimed'
       and v_delivery.lease_owner = p_worker_id
       and v_delivery.lease_expires_at > now() then
      return query
      select v_delivery.id, v_delivery.delivery_key, v_delivery.status, true, v_delivery.attempts;
      return;
    end if;

    if v_delivery.status = 'claimed'
       and v_delivery.lease_expires_at <= now() then
      update private.financial_outbox_deliveries
      set status = 'pending',
          lease_owner = null,
          lease_expires_at = null,
          updated_at = now()
      where id = v_delivery.id
      returning * into v_delivery;
    elsif v_delivery.status = 'sending'
       and v_delivery.lease_expires_at <= now() then
      update private.financial_outbox_deliveries
      set status = 'ambiguous',
          ambiguous_at = coalesce(ambiguous_at, now()),
          last_error = coalesce(
            last_error,
            'provider acknowledgement missing after delivery lease expired'
          ),
          lease_owner = null,
          lease_expires_at = null,
          updated_at = now()
      where id = v_delivery.id
      returning * into v_delivery;
    end if;

    if v_delivery.status in ('pending', 'failed')
       and v_delivery.next_attempt_at <= now() then
      update private.financial_outbox_deliveries
      set status = 'claimed',
          attempts = attempts + 1,
          lease_owner = p_worker_id,
          lease_expires_at = now() + make_interval(secs => v_lease_seconds),
          last_error = null,
          updated_at = now()
      where id = v_delivery.id
      returning * into v_delivery;
    end if;
  end if;

  return query
  select
    v_delivery.id,
    v_delivery.delivery_key,
    v_delivery.status,
    v_delivery.status = 'claimed'
      and v_delivery.lease_owner = p_worker_id
      and v_delivery.lease_expires_at > now(),
    v_delivery.attempts;
end;
$$;

create or replace function public.begin_financial_outbox_delivery(
  p_delivery_id uuid,
  p_worker_id uuid,
  p_lease_seconds integer default 120
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_started boolean;
  v_lease_seconds integer := greatest(30, least(coalesce(p_lease_seconds, 120), 900));
begin
  update private.financial_outbox_deliveries delivery
  set status = 'sending',
      send_started_at = coalesce(delivery.send_started_at, now()),
      lease_expires_at = now() + make_interval(secs => v_lease_seconds),
      updated_at = now()
  where delivery.id = p_delivery_id
    and delivery.status = 'claimed'
    and delivery.lease_owner = p_worker_id
    and delivery.lease_expires_at > now()
  returning true into v_started;

  if coalesce(v_started, false) then
    return true;
  end if;

  return exists (
    select 1
    from private.financial_outbox_deliveries delivery
    where delivery.id = p_delivery_id
      and delivery.status = 'sending'
      and delivery.lease_owner = p_worker_id
      and delivery.lease_expires_at > now()
  );
end;
$$;

create or replace function public.accept_financial_outbox_delivery(
  p_delivery_id uuid,
  p_worker_id uuid,
  p_provider_message_id text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_accepted boolean;
begin
  update private.financial_outbox_deliveries delivery
  set status = 'accepted',
      provider_message_id = coalesce(nullif(btrim(p_provider_message_id), ''), delivery.provider_message_id),
      accepted_at = coalesce(delivery.accepted_at, now()),
      lease_owner = null,
      lease_expires_at = null,
      last_error = null,
      updated_at = now()
  where delivery.id = p_delivery_id
    and delivery.status = 'sending'
    and delivery.lease_owner = p_worker_id
  returning true into v_accepted;

  if coalesce(v_accepted, false) then
    return true;
  end if;

  return exists (
    select 1
    from private.financial_outbox_deliveries delivery
    where delivery.id = p_delivery_id
      and delivery.status in ('accepted', 'delivered', 'bounced', 'dropped')
  );
end;
$$;

create or replace function public.mark_financial_outbox_delivery_ambiguous(
  p_delivery_id uuid,
  p_worker_id uuid,
  p_error text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_marked boolean;
begin
  update private.financial_outbox_deliveries delivery
  set status = 'ambiguous',
      ambiguous_at = coalesce(delivery.ambiguous_at, now()),
      lease_owner = null,
      lease_expires_at = null,
      last_error = left(coalesce(nullif(btrim(p_error), ''), 'provider result is ambiguous'), 2000),
      updated_at = now()
  where delivery.id = p_delivery_id
    and delivery.status = 'sending'
    and delivery.lease_owner = p_worker_id
  returning true into v_marked;

  if coalesce(v_marked, false) then
    return true;
  end if;

  return exists (
    select 1
    from private.financial_outbox_deliveries delivery
    where delivery.id = p_delivery_id
      and delivery.status in ('ambiguous', 'accepted', 'delivered', 'bounced', 'dropped')
  );
end;
$$;

create or replace function public.release_financial_outbox_claim(
  p_outbox_id uuid,
  p_worker_id uuid,
  p_error text,
  p_next_attempt_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_released boolean;
begin
  update public.financial_domain_outbox outbox
  set lease_owner = null,
      lease_expires_at = null,
      processing_at = null,
      last_error = left(coalesce(nullif(btrim(p_error), ''), 'financial outbox delivery failed'), 2000),
      next_attempt_at = greatest(coalesce(p_next_attempt_at, now()), now())
  where outbox.id = p_outbox_id
    and outbox.delivered_at is null
    and outbox.lease_owner = p_worker_id
  returning true into v_released;

  return coalesce(v_released, false);
end;
$$;

create or replace function public.complete_financial_outbox_claim(
  p_outbox_id uuid,
  p_worker_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_completed boolean;
begin
  update public.financial_domain_outbox outbox
  set delivered_at = coalesce(outbox.delivered_at, now()),
      lease_owner = null,
      lease_expires_at = null,
      processing_at = null,
      last_error = null
  where outbox.id = p_outbox_id
    and outbox.delivered_at is null
    and outbox.lease_owner = p_worker_id
    and not exists (
      select 1
      from private.financial_outbox_deliveries delivery
      where delivery.outbox_id = outbox.id
        and delivery.status in ('pending', 'claimed', 'sending', 'failed', 'ambiguous')
    )
  returning true into v_completed;

  return coalesce(v_completed, false);
end;
$$;

create or replace function public.process_sendgrid_delivery_event(
  p_email_log_id uuid,
  p_provider_event_id text,
  p_provider_message_id text,
  p_event_type text,
  p_event_at timestamptz,
  p_error_text text,
  p_payload jsonb,
  p_suppression_email text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_event_id uuid;
  v_email_log_id uuid;
  v_delivery_key text := nullif(btrim(coalesce(p_payload ->> 'financial_delivery_key', '')), '');
  v_outbox_id uuid;
begin
  select email_log.id
  into v_email_log_id
  from public.email_logs email_log
  where email_log.id = p_email_log_id;

  insert into public.email_delivery_events (
    email_log_id,
    provider,
    provider_event_id,
    provider_message_id,
    event_type,
    event_at,
    payload
  )
  values (
    v_email_log_id,
    'sendgrid',
    p_provider_event_id,
    p_provider_message_id,
    p_event_type,
    p_event_at,
    coalesce(p_payload, '{}'::jsonb)
  )
  on conflict (provider, provider_event_id) do nothing
  returning id into v_event_id;

  if v_event_id is null then
    return false;
  end if;

  if v_email_log_id is not null then
    update public.email_logs
    set status = p_event_type,
        error_text = p_error_text,
        provider_message_id = coalesce(p_provider_message_id, provider_message_id),
        last_event_at = p_event_at,
        last_event_type = p_event_type,
        delivered_at = case
          when p_event_type = 'delivered' then p_event_at
          else delivered_at
        end
    where id = v_email_log_id
      and (last_event_at is null or last_event_at <= p_event_at);
  end if;

  if v_delivery_key is not null then
    update private.financial_outbox_deliveries delivery
    set status = case
          when p_event_type = 'delivered' then 'delivered'
          when p_event_type = 'bounce' then 'bounced'
          when p_event_type = 'dropped' then 'dropped'
          when p_event_type in ('processed', 'deferred')
               and delivery.status not in ('delivered', 'bounced', 'dropped') then 'accepted'
          else delivery.status
        end,
        provider_message_id = coalesce(p_provider_message_id, delivery.provider_message_id),
        accepted_at = case
          when p_event_type in ('processed', 'deferred', 'delivered', 'bounce', 'dropped')
            then coalesce(delivery.accepted_at, p_event_at)
          else delivery.accepted_at
        end,
        delivered_at = case
          when p_event_type = 'delivered' then coalesce(delivery.delivered_at, p_event_at)
          else delivery.delivered_at
        end,
        last_provider_event_at = p_event_at,
        last_provider_event_type = p_event_type,
        last_error = case
          when p_event_type in ('bounce', 'dropped') then left(coalesce(p_error_text, p_event_type), 2000)
          when p_event_type in ('processed', 'delivered') then null
          else delivery.last_error
        end,
        lease_owner = case
          when p_event_type in ('processed', 'deferred', 'delivered', 'bounce', 'dropped') then null
          else delivery.lease_owner
        end,
        lease_expires_at = case
          when p_event_type in ('processed', 'deferred', 'delivered', 'bounce', 'dropped') then null
          else delivery.lease_expires_at
        end,
        updated_at = now()
    where delivery.delivery_key = v_delivery_key
      and (
        delivery.last_provider_event_at is null
        or delivery.last_provider_event_at <= p_event_at
      )
    returning delivery.outbox_id into v_outbox_id;

    if v_outbox_id is not null then
      update public.financial_domain_outbox outbox
      set delivered_at = coalesce(outbox.delivered_at, now()),
          lease_owner = null,
          lease_expires_at = null,
          processing_at = null,
          last_error = null
      where outbox.id = v_outbox_id
        and not exists (
          select 1
          from private.financial_outbox_deliveries delivery
          where delivery.outbox_id = outbox.id
            and delivery.status in ('pending', 'claimed', 'sending', 'failed', 'ambiguous')
        );
    end if;
  end if;

  if nullif(lower(btrim(p_suppression_email)), '') is not null then
    insert into public.email_suppressions (email, suppressed, reason, updated_at)
    values (
      lower(btrim(p_suppression_email)),
      true,
      'sendgrid:' || p_event_type || coalesce(':' || nullif(p_error_text, ''), ''),
      p_event_at
    )
    on conflict (email) do update
      set suppressed = true,
          reason = excluded.reason,
          updated_at = excluded.updated_at;
  end if;

  return true;
end;
$$;

revoke all on function public.claim_financial_outbox_batch(uuid, integer, integer)
  from public, anon, authenticated;
revoke all on function public.claim_financial_outbox_delivery(uuid, uuid, text, text, integer)
  from public, anon, authenticated;
revoke all on function public.begin_financial_outbox_delivery(uuid, uuid, integer)
  from public, anon, authenticated;
revoke all on function public.accept_financial_outbox_delivery(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.mark_financial_outbox_delivery_ambiguous(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.release_financial_outbox_claim(uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.complete_financial_outbox_claim(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.process_sendgrid_delivery_event(
  uuid, text, text, text, timestamptz, text, jsonb, text
) from public, anon, authenticated;

grant execute on function public.claim_financial_outbox_batch(uuid, integer, integer)
  to service_role;
grant execute on function public.claim_financial_outbox_delivery(uuid, uuid, text, text, integer)
  to service_role;
grant execute on function public.begin_financial_outbox_delivery(uuid, uuid, integer)
  to service_role;
grant execute on function public.accept_financial_outbox_delivery(uuid, uuid, text)
  to service_role;
grant execute on function public.mark_financial_outbox_delivery_ambiguous(uuid, uuid, text)
  to service_role;
grant execute on function public.release_financial_outbox_claim(uuid, uuid, text, timestamptz)
  to service_role;
grant execute on function public.complete_financial_outbox_claim(uuid, uuid)
  to service_role;
grant execute on function public.process_sendgrid_delivery_event(
  uuid, text, text, text, timestamptz, text, jsonb, text
) to service_role;

comment on table private.financial_outbox_deliveries is
  'P0-007 server-only per-recipient financial email delivery ledger.';

comment on function public.claim_financial_outbox_batch(uuid, integer, integer) is
  'Atomically leases eligible financial outbox rows using FOR UPDATE SKIP LOCKED.';

comment on function public.claim_financial_outbox_delivery(uuid, uuid, text, text, integer) is
  'Creates or leases one deterministic delivery identity per outbox recipient.';

commit;
