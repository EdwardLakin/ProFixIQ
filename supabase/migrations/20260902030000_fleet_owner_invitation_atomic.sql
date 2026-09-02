-- Atomic Fleet creation and serialized Fleet invitation replacement.
--
-- Creating the Fleet and then compensating on failure cannot work: the
-- pre-existing BEFORE INSERT trigger ensure_fleet_customer_account
-- (20260805185619) creates or mutates a public.customers row as a side effect
-- of the Fleet insert, and deleting the Fleet afterwards cannot undo that. A
-- Fleet is also visible to concurrent staff sessions between the insert and any
-- compensation.
--
-- Both rows are therefore written in one statement boundary: either the Fleet
-- and its owning invitation exist together, or neither does. Email delivery is
-- deliberately outside this function, because it cannot participate in the
-- transaction; the durable invitation is the access path and delivery is
-- retryable against it.

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
    delivery_status
  )
  values (
    p_shop_id,
    v_fleet_id,
    lower(trim(p_contact_email)),
    'manager',
    p_token_hash,
    p_expires_at,
    p_created_by,
    'pending'
  )
  returning id into v_invite_id;

  fleet_id := v_fleet_id;
  fleet_name := v_fleet_name;
  invite_id := v_invite_id;
  return next;
end;
$$;

revoke all on function public.create_fleet_with_owner_invitation_atomic(
  uuid, text, text, text, text, timestamptz, uuid, uuid
) from public, anon, authenticated;

grant execute on function public.create_fleet_with_owner_invitation_atomic(
  uuid, text, text, text, text, timestamptz, uuid, uuid
) to service_role;

-- Replace one unaccepted invitation under a row lock. Concurrent resend
-- requests for the same invitation serialize here: the winner revokes and
-- replaces it, while the waiter observes the revocation and cannot send a
-- second email with a competing token.
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
    delivery_status
  )
  values (
    p_shop_id,
    v_existing.fleet_id,
    lower(trim(v_existing.email)),
    v_existing.role,
    p_token_hash,
    p_expires_at,
    p_created_by,
    'pending'
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

revoke all on function public.replace_fleet_portal_invitation_atomic(
  uuid, uuid, text, timestamptz, uuid
) from public, anon, authenticated;

grant execute on function public.replace_fleet_portal_invitation_atomic(
  uuid, uuid, text, timestamptz, uuid
) to service_role;
