-- Property Portal Invites - Step 22D (Manual SQL Draft)
--
-- Purpose:
--   Safely allow authenticated invite acceptance without broad invite token/email RLS lookups.
--
-- Explicit non-goals in this step:
--   - No SQL execution from this rollout step (manual draft only)
--   - No runtime/app wiring changes
--   - No service role usage
--   - No email sending wiring
--   - No Supabase Auth user creation flow
--   - No unauthenticated/public invite acceptance

create extension if not exists pgcrypto;

create or replace function public.accept_property_portal_invite(p_raw_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_email text;
  v_now timestamptz := now();
  v_token_hash text;

  v_invite_id uuid;
  v_shop_id uuid;
  v_role text;
  v_portfolio_id uuid;
  v_property_id uuid;
  v_unit_id uuid;

  v_member_id uuid;
begin
  v_uid := auth.uid();

  if v_uid is null then
    return jsonb_build_object(
      'success', false,
      'message', 'Authentication required'
    );
  end if;

  if p_raw_token is null or btrim(p_raw_token) = '' then
    return jsonb_build_object(
      'success', false,
      'message', 'Invite token is required'
    );
  end if;

  -- Raw token is never stored; hash-only lookup.
  v_token_hash := encode(digest(p_raw_token, 'sha256'), 'hex');

  -- Authenticated email lookup from auth.users. If this is inaccessible in a target
  -- environment, stop and provide an explicit fallback plan rather than broadening RLS.
  select lower(u.email)
    into v_email
  from auth.users u
  where u.id = v_uid
  limit 1;

  if v_email is null or v_email = '' then
    return jsonb_build_object(
      'success', false,
      'message', 'No authenticated email available for this user'
    );
  end if;

  -- Lock pending invite row by hash for atomic acceptance.
  select i.id, i.shop_id, i.role, i.portfolio_id, i.property_id, i.unit_id
    into v_invite_id, v_shop_id, v_role, v_portfolio_id, v_property_id, v_unit_id
  from public.property_portal_invites i
  where i.token_hash = v_token_hash
    and i.status = 'pending'
    and i.expires_at > v_now
    and lower(i.invited_email) = v_email
  for update;

  if v_invite_id is null then
    return jsonb_build_object(
      'success', false,
      'message', 'Invite is invalid, expired, already handled, or does not match this account'
    );
  end if;

  -- Reuse existing member row when it already exists for the same assignment scope.
  select pm.id
    into v_member_id
  from public.property_members pm
  where pm.shop_id = v_shop_id
    and pm.user_id = v_uid
    and pm.role = v_role
    and pm.portfolio_id is not distinct from v_portfolio_id
    and pm.property_id is not distinct from v_property_id
    and pm.unit_id is not distinct from v_unit_id
  limit 1;

  if v_member_id is null then
    insert into public.property_members (
      shop_id,
      user_id,
      role,
      portfolio_id,
      property_id,
      unit_id
    )
    values (
      v_shop_id,
      v_uid,
      v_role,
      v_portfolio_id,
      v_property_id,
      v_unit_id
    )
    returning id into v_member_id;
  end if;

  update public.property_portal_invites
  set
    status = 'accepted',
    accepted_by_profile_id = v_uid,
    accepted_at = v_now,
    updated_at = v_now
  where id = v_invite_id;

  return jsonb_build_object(
    'success', true,
    'message', 'Invite accepted',
    'invite_id', v_invite_id,
    'member_id', v_member_id
  );
end;
$$;

grant execute on function public.accept_property_portal_invite(text) to authenticated;

comment on function public.accept_property_portal_invite(text) is
'Step 22D manual draft: authenticated-only invite acceptance via SECURITY DEFINER RPC. Email delivery deferred. Auth user creation deferred. Invite creation remains internal-only. Public unauthenticated acceptance is unsupported.';

-- RLS posture note:
-- Keep property_portal_invites RLS internal-only.
-- Do NOT add broad SELECT by token_hash or invited_email.
-- Acceptance should flow through this narrow SECURITY DEFINER RPC.
