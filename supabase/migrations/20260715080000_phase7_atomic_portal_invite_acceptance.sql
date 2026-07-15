begin;

alter table public.customer_portal_invites
  add column if not exists accepted_at timestamptz,
  add column if not exists accepted_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists revoked_at timestamptz,
  add column if not exists expires_at timestamptz,
  add column if not exists acceptance_metadata jsonb not null default '{}'::jsonb;

create table if not exists public.portal_lifecycle_operation_keys (
  id uuid primary key default gen_random_uuid(),
  operation_name text not null,
  operation_key text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  customer_id uuid references public.customers(id) on delete cascade,
  shop_id uuid references public.shops(id) on delete cascade,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (operation_name, operation_key)
);

alter table public.portal_lifecycle_operation_keys enable row level security;

create or replace function public.accept_customer_portal_invite_atomic(
  p_invite_id uuid,
  p_actor_user_id uuid,
  p_actor_email text,
  p_operation_key text,
  p_at timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.customer_portal_invites%rowtype;
  v_customer public.customers%rowtype;
  v_email text := lower(trim(coalesce(p_actor_email, '')));
  v_existing jsonb;
  v_result jsonb;
  v_now timestamptz := coalesce(p_at, now());
begin
  if p_invite_id is null or p_actor_user_id is null then
    raise exception using errcode = 'P0001', message = 'Invite and authenticated user are required.';
  end if;
  if v_email = '' then
    raise exception using errcode = 'P0001', message = 'Authenticated email is required.';
  end if;
  if nullif(trim(p_operation_key), '') is null then
    raise exception using errcode = 'P0001', message = 'A stable operation key is required.';
  end if;

  select result into v_existing
  from public.portal_lifecycle_operation_keys
  where operation_name = 'accept_customer_portal_invite'
    and operation_key = p_operation_key;
  if found then
    return v_existing || jsonb_build_object('idempotent', true);
  end if;

  select * into v_invite
  from public.customer_portal_invites
  where id = p_invite_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Portal invite not found.';
  end if;

  if lower(trim(v_invite.email)) <> v_email then
    raise exception using errcode = 'P0001', message = 'Portal invite email does not match the authenticated account.';
  end if;
  if v_invite.revoked_at is not null then
    raise exception using errcode = 'P0001', message = 'Portal invite has been revoked.';
  end if;
  if v_invite.expires_at is not null and v_invite.expires_at <= v_now then
    raise exception using errcode = 'P0001', message = 'Portal invite has expired.';
  end if;
  if v_invite.accepted_by_user_id is not null
     and v_invite.accepted_by_user_id <> p_actor_user_id then
    raise exception using errcode = 'P0001', message = 'Portal invite was accepted by another account.';
  end if;

  select * into v_customer
  from public.customers
  where id = v_invite.customer_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Invited customer no longer exists.';
  end if;
  if lower(trim(coalesce(v_customer.email, ''))) <> v_email then
    raise exception using errcode = 'P0001', message = 'Invited customer email does not match the authenticated account.';
  end if;
  if v_customer.shop_id is null then
    raise exception using errcode = 'P0001', message = 'Invited customer is missing shop scope.';
  end if;
  if v_customer.user_id is not null and v_customer.user_id <> p_actor_user_id then
    raise exception using errcode = 'P0001', message = 'Customer portal access is linked to another account.';
  end if;

  if exists (
    select 1 from public.customers c
    where c.user_id = p_actor_user_id
      and c.id <> v_customer.id
  ) then
    raise exception using errcode = 'P0001', message = 'Authenticated account is already linked to another customer profile.';
  end if;

  update public.customers
  set user_id = p_actor_user_id
  where id = v_customer.id
    and user_id is distinct from p_actor_user_id;

  update public.customer_portal_invites
  set accepted_at = coalesce(accepted_at, v_now),
      accepted_by_user_id = p_actor_user_id,
      acceptance_metadata = coalesce(acceptance_metadata, '{}'::jsonb) || jsonb_build_object(
        'accepted_email', v_email,
        'accepted_at', v_now
      )
  where id = v_invite.id;

  v_result := jsonb_build_object(
    'ok', true,
    'invite_id', v_invite.id,
    'customer_id', v_customer.id,
    'shop_id', v_customer.shop_id,
    'user_id', p_actor_user_id,
    'email', v_email,
    'accepted_at', coalesce(v_invite.accepted_at, v_now),
    'idempotent', false
  );

  insert into public.portal_lifecycle_operation_keys(
    operation_name, operation_key, actor_user_id, customer_id, shop_id, result
  ) values (
    'accept_customer_portal_invite', p_operation_key, p_actor_user_id,
    v_customer.id, v_customer.shop_id, v_result
  )
  on conflict (operation_name, operation_key) do nothing;

  insert into public.activity_logs(user_id, action, target_table, target_id, context)
  values (
    p_actor_user_id,
    'portal_invite_accepted',
    'customer_portal_invites',
    v_invite.id,
    jsonb_build_object('customer_id', v_customer.id, 'shop_id', v_customer.shop_id)
  );

  return v_result;
end;
$$;

revoke all on function public.accept_customer_portal_invite_atomic(uuid, uuid, text, text, timestamptz) from public;
grant execute on function public.accept_customer_portal_invite_atomic(uuid, uuid, text, text, timestamptz) to authenticated, service_role;

commit;
