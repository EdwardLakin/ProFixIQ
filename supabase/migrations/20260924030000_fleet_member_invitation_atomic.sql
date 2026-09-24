-- Serialize first-time and replacement Fleet invitations without adding tables or columns.
-- Service-role only. Fleet/shop binding and membership are rechecked inside the
-- transaction; a failed INSERT rolls the previous invitation revocation back.
create function public.issue_fleet_portal_invitation_atomic(
  p_shop_id uuid,
  p_fleet_id uuid,
  p_email text,
  p_role text,
  p_token_hash text,
  p_expires_at timestamptz,
  p_created_by uuid
)
returns table (invite_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_invite_id uuid;
begin
  if p_shop_id is null or p_fleet_id is null or p_created_by is null
     or not exists (
       select 1 from public.fleets f
       where f.id = p_fleet_id and f.shop_id = p_shop_id
     ) then
    raise exception using errcode = 'P0002', message = 'Fleet not found';
  end if;
  if length(v_email) > 254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
     or p_role not in ('manager', 'approver', 'viewer')
     or p_token_hash !~ '^[0-9a-f]{64}$'
     or p_expires_at <= now() then
    raise exception using errcode = '22023', message = 'Invalid Fleet invitation';
  end if;

  -- One lock per Fleet/normalized email. Unlike row locking, this also works
  -- for the first invitation (when there is no existing row to lock).
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(p_fleet_id::text), pg_catalog.hashtext(v_email)
  );

  if exists (
    select 1 from public.fleet_members m
    join public.profiles p on p.id = m.user_id
    where m.fleet_id = p_fleet_id
      and m.shop_id = p_shop_id
      and lower(p.email) = v_email
  ) then
    raise exception using errcode = '23505', message = 'Fleet member already exists';
  end if;

  -- Never invalidate a token while its provider acceptance is still pending.
  if exists (
    select 1 from public.fleet_portal_invites i
    where i.fleet_id = p_fleet_id and i.shop_id = p_shop_id
      and lower(i.email) = v_email
      and i.accepted_at is null and i.revoked_at is null
      and i.delivery_status in ('sending', 'accepted')
      and i.delivery_reserved_until > now()
  ) then
    raise exception using errcode = '55P03', message = 'Invitation delivery is still in progress';
  end if;

  update public.fleet_portal_invites i
  set revoked_at = now()
  where i.fleet_id = p_fleet_id and i.shop_id = p_shop_id
    and lower(i.email) = v_email
    and i.accepted_at is null and i.revoked_at is null;

  insert into public.fleet_portal_invites (
    shop_id, fleet_id, email, role, token_hash, expires_at, created_by,
    delivery_status, delivery_reserved_until
  ) values (
    p_shop_id, p_fleet_id, v_email, p_role, p_token_hash, p_expires_at,
    p_created_by, 'sending', now() + interval '15 minutes'
  ) returning id into v_invite_id;

  invite_id := v_invite_id;
  return next;
end;
$$;

-- Coordinate the existing resend RPC with first-time issuance.
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
  v_target_fleet_id uuid;
  v_target_email text;
  v_fleet_name text;
  v_invite_id uuid;
begin
  -- Discover the advisory lock key without taking a row lock first.
  select i.fleet_id, lower(trim(i.email))
  into v_target_fleet_id, v_target_email
  from public.fleet_portal_invites i
  where i.id = p_invite_id and i.shop_id = p_shop_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Invitation not found';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(v_target_fleet_id::text),
    pg_catalog.hashtext(v_target_email)
  );

  -- Re-read after the shared lock to observe any concurrent issuance.
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


revoke all on function public.issue_fleet_portal_invitation_atomic(
  uuid, uuid, text, text, text, timestamptz, uuid
) from public, anon, authenticated;

grant execute on function public.issue_fleet_portal_invitation_atomic(
  uuid, uuid, text, text, text, timestamptz, uuid
) to service_role;
