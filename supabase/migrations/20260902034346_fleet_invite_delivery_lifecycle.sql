-- Correlate Fleet invitation delivery with SendGrid's durable email ledger and
-- reserve an in-flight token until the provider reports a terminal outcome.
--
-- A successful SendGrid API response means only that the provider accepted
-- the message. Delivery, bounce, and drop arrive later through the signed
-- webhook. The email_log_id joins those provider events back to the invitation.
-- The reservation prevents a concurrent resend from revoking a token while its
-- email is still being prepared or delivered. It expires so a missing webhook
-- cannot strand the invitation permanently.

alter table public.fleet_portal_invites
  add column if not exists email_log_id uuid,
  add column if not exists delivery_event_at timestamptz,
  add column if not exists delivery_reserved_until timestamptz;

comment on column public.fleet_portal_invites.email_log_id is
  'Correlates the invitation to public.email_logs for signed SendGrid delivery events.';
comment on column public.fleet_portal_invites.delivery_event_at is
  'Timestamp of the latest SendGrid event applied to the invitation delivery state.';
comment on column public.fleet_portal_invites.delivery_reserved_until is
  'Prevents an in-flight invitation token from being replaced before delivery settles.';

create index if not exists fleet_portal_invites_email_log_idx
  on public.fleet_portal_invites (email_log_id)
  where email_log_id is not null;

create or replace function public.create_fleet_with_owner_invitation_atomic(
  p_shop_id uuid,
  p_name text,
  p_contact_name text,
  p_contact_email text,
  p_token_hash text,
  p_expires_at timestamptz,
  p_created_by uuid,
  p_customer_id uuid default null
)
returns table (fleet_id uuid, fleet_name text, invite_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fleet_id uuid;
  v_fleet_name text;
  v_invite_id uuid;
begin
  if p_shop_id is null then
    raise exception 'Shop scope is required';
  end if;
  if nullif(trim(coalesce(p_name, '')), '') is null or length(trim(p_name)) > 120 then
    raise exception 'Fleet name is required and must be 120 characters or fewer';
  end if;
  if nullif(trim(coalesce(p_contact_email, '')), '') is null then
    raise exception 'Fleet contact email is required';
  end if;
  if p_customer_id is not null and not exists (
    select 1
    from public.customers c
    where c.id = p_customer_id
      and c.shop_id = p_shop_id
  ) then
    raise exception 'Customer does not belong to the requested Shop';
  end if;

  insert into public.fleets (
    shop_id,
    customer_id,
    name,
    contact_name,
    contact_email,
    notes
  )
  values (
    p_shop_id,
    p_customer_id,
    trim(p_name),
    nullif(trim(coalesce(p_contact_name, '')), ''),
    lower(trim(p_contact_email)),
    null
  )
  returning id, name into v_fleet_id, v_fleet_name;

  insert into public.fleet_portal_invites (
    shop_id,
    fleet_id,
    email,
    role,
    token_hash,
    expires_at,
    created_by,
    delivery_status,
    delivery_reserved_until
  )
  values (
    p_shop_id,
    v_fleet_id,
    lower(trim(p_contact_email)),
    'manager',
    p_token_hash,
    p_expires_at,
    p_created_by,
    'sending',
    now() + interval '15 minutes'
  )
  returning id into v_invite_id;

  fleet_id := v_fleet_id;
  fleet_name := v_fleet_name;
  invite_id := v_invite_id;
  return next;
end;
$$;

create or replace function public.replace_fleet_portal_invitation_atomic(
  p_shop_id uuid,
  p_invite_id uuid,
  p_token_hash text,
  p_expires_at timestamptz,
  p_created_by uuid
)
returns table (
  invite_id uuid,
  fleet_id uuid,
  fleet_name text,
  invite_email text,
  invite_role text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.fleet_portal_invites%rowtype;
  v_fleet_name text;
  v_invite_id uuid;
begin
  select i.*
  into v_existing
  from public.fleet_portal_invites i
  where i.id = p_invite_id
    and i.shop_id = p_shop_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Invitation not found';
  end if;
  if v_existing.accepted_at is not null then
    raise exception using errcode = '23514', message = 'Invitation has already been accepted';
  end if;
  if v_existing.revoked_at is not null then
    raise exception using errcode = '23514', message = 'Invitation has already been replaced';
  end if;
  if v_existing.delivery_status in ('sending', 'accepted')
     and v_existing.delivery_reserved_until is not null
     and v_existing.delivery_reserved_until > now() then
    raise exception using errcode = '55P03', message = 'Invitation delivery is still in progress';
  end if;

  select f.name
  into v_fleet_name
  from public.fleets f
  where f.id = v_existing.fleet_id
    and f.shop_id = p_shop_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'Fleet not found';
  end if;

  update public.fleet_portal_invites i
  set revoked_at = now()
  where i.shop_id = p_shop_id
    and i.fleet_id = v_existing.fleet_id
    and lower(i.email) = lower(v_existing.email)
    and i.accepted_at is null
    and i.revoked_at is null;

  insert into public.fleet_portal_invites (
    shop_id,
    fleet_id,
    email,
    role,
    token_hash,
    expires_at,
    created_by,
    delivery_status,
    delivery_reserved_until
  )
  values (
    p_shop_id,
    v_existing.fleet_id,
    lower(trim(v_existing.email)),
    v_existing.role,
    p_token_hash,
    p_expires_at,
    p_created_by,
    'sending',
    now() + interval '15 minutes'
  )
  returning id into v_invite_id;

  invite_id := v_invite_id;
  fleet_id := v_existing.fleet_id;
  fleet_name := v_fleet_name;
  invite_email := lower(trim(v_existing.email));
  invite_role := v_existing.role;
  return next;
end;
$$;

-- Bind provider acceptance to the invitation while reconciling any webhook
-- event that won the race and reached email_logs first.
create or replace function public.record_fleet_portal_invitation_email_acceptance(
  p_shop_id uuid,
  p_invite_id uuid,
  p_email_log_id uuid,
  p_accepted_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_log public.email_logs%rowtype;
  v_updated integer;
begin
  select email_log.*
  into v_log
  from public.email_logs email_log
  where email_log.id = p_email_log_id
    and email_log.shop_id = p_shop_id
    and email_log.template_key = 'portal_invite';

  if not found then
    return false;
  end if;

  update public.fleet_portal_invites invite
  set email_log_id = v_log.id,
      delivery_status = case
        when v_log.status = 'delivered' then 'delivered'
        when v_log.status in ('bounce', 'dropped', 'spamreport', 'unsubscribe') then 'suppressed'
        when v_log.status = 'failed' then 'failed'
        else 'accepted'
      end,
      delivery_attempted_at = p_accepted_at,
      delivery_event_at = v_log.last_event_at,
      delivery_error = case
        when v_log.status = 'delivered' then null
        when v_log.status in ('bounce', 'dropped', 'spamreport', 'unsubscribe', 'failed')
          then left(coalesce(v_log.error_text, v_log.status), 2000)
        else null
      end,
      delivery_reserved_until = case
        when v_log.status in ('delivered', 'bounce', 'dropped', 'spamreport', 'unsubscribe', 'failed')
          then null
        else invite.delivery_reserved_until
      end
  where invite.id = p_invite_id
    and invite.shop_id = p_shop_id
    and invite.accepted_at is null
    and invite.revoked_at is null;

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

-- Apply signed SendGrid events to the correlated invitation. Terminal states
-- are monotonic so a later out-of-order processed/deferred event cannot undo a
-- confirmed delivery or failure.
create or replace function public.process_fleet_invitation_delivery_event(
  p_email_log_id uuid,
  p_event_type text,
  p_event_at timestamptz,
  p_error_text text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_type text := lower(trim(coalesce(p_event_type, '')));
  v_updated integer;
begin
  if v_event_type not in (
    'processed', 'deferred', 'delivered', 'bounce', 'dropped', 'spamreport', 'unsubscribe'
  ) then
    return false;
  end if;

  update public.fleet_portal_invites invite
  set delivery_status = case
        when v_event_type = 'delivered' then 'delivered'
        when v_event_type in ('bounce', 'dropped', 'spamreport', 'unsubscribe') then 'suppressed'
        when invite.delivery_status in ('delivered', 'suppressed', 'failed') then invite.delivery_status
        else 'accepted'
      end,
      delivery_event_at = p_event_at,
      delivery_error = case
        when v_event_type = 'delivered' then null
        when v_event_type in ('bounce', 'dropped', 'spamreport', 'unsubscribe')
          then left(coalesce(nullif(p_error_text, ''), v_event_type), 2000)
        when invite.delivery_status in ('delivered', 'suppressed', 'failed') then invite.delivery_error
        else null
      end,
      delivery_reserved_until = case
        when v_event_type in ('delivered', 'bounce', 'dropped', 'spamreport', 'unsubscribe') then null
        else invite.delivery_reserved_until
      end
  where invite.email_log_id = p_email_log_id
    and p_event_at is not null
    and (invite.delivery_event_at is null or invite.delivery_event_at <= p_event_at);

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

revoke all on function public.create_fleet_with_owner_invitation_atomic(
  uuid, text, text, text, text, timestamptz, uuid, uuid
) from public, anon, authenticated;
revoke all on function public.replace_fleet_portal_invitation_atomic(
  uuid, uuid, text, timestamptz, uuid
) from public, anon, authenticated;
revoke all on function public.record_fleet_portal_invitation_email_acceptance(
  uuid, uuid, uuid, timestamptz
) from public, anon, authenticated;
revoke all on function public.process_fleet_invitation_delivery_event(
  uuid, text, timestamptz, text
) from public, anon, authenticated;

grant execute on function public.create_fleet_with_owner_invitation_atomic(
  uuid, text, text, text, text, timestamptz, uuid, uuid
) to service_role;
grant execute on function public.replace_fleet_portal_invitation_atomic(
  uuid, uuid, text, timestamptz, uuid
) to service_role;
grant execute on function public.record_fleet_portal_invitation_email_acceptance(
  uuid, uuid, uuid, timestamptz
) to service_role;
grant execute on function public.process_fleet_invitation_delivery_event(
  uuid, text, timestamptz, text
) to service_role;
