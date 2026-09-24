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
  v_existing public.fleet_portal_invites%rowtype;
  v_invite_id uuid;
begin
  if p_shop_id is null or p_fleet_id is null or p_created_by is null
     or not exists (
       select 1 from public.fleets f
       where f.id = p_fleet_id and f.shop_id = p_shop_id
     ) then
    raise exception using errcode = 'P0002', message = 'Fleet not found';
  end if;
  if length(v_email) > 254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$'
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

revoke all on function public.issue_fleet_portal_invitation_atomic(
  uuid, uuid, text, text, text, timestamptz, uuid
) from public, anon, authenticated;

grant execute on function public.issue_fleet_portal_invitation_atomic(
  uuid, uuid, text, text, text, timestamptz, uuid
) to service_role;
