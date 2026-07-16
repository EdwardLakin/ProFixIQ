begin;

alter table public.customer_portal_invites
  add column if not exists shop_id uuid references public.shops(id) on delete cascade,
  add column if not exists work_order_id uuid references public.work_orders(id) on delete set null,
  add column if not exists enrollment_campaign_id uuid,
  add column if not exists source text not null default 'legacy',
  add column if not exists created_by uuid references auth.users(id) on delete set null;

update public.customer_portal_invites i
set shop_id = c.shop_id
from public.customers c
where c.id = i.customer_id
  and i.shop_id is null;

-- Preserve portal access for customers who completed the legacy acceptance flow
-- before accepted_at/accepted_by_user_id became the durable access evidence.
update public.customer_portal_invites i
set accepted_at = coalesce(i.accepted_at, i.created_at, now()),
    accepted_by_user_id = coalesce(i.accepted_by_user_id, c.user_id)
from public.customers c
where c.id = i.customer_id
  and c.user_id is not null
  and lower(trim(i.email)) = lower(trim(coalesce(c.email, '')))
  and (i.accepted_at is null or i.accepted_by_user_id is null);

create index if not exists customer_portal_invites_shop_email_idx
  on public.customer_portal_invites(shop_id, lower(email), created_at desc);
create index if not exists customer_portal_invites_work_order_idx
  on public.customer_portal_invites(work_order_id)
  where work_order_id is not null;

-- Invite acceptance is brokered by authenticated application routes. Browsers
-- must not be able to supply arbitrary actor ids directly to the definer RPC.
revoke execute on function public.accept_customer_portal_invite_atomic(uuid, uuid, text, text, timestamptz)
  from anon, authenticated;
grant execute on function public.accept_customer_portal_invite_atomic(uuid, uuid, text, text, timestamptz)
  to service_role;

create table if not exists public.portal_enrollment_campaigns (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  slug text not null unique,
  name text not null default 'Front desk',
  active boolean not null default true,
  allow_booking boolean not null default true,
  scan_count bigint not null default 0,
  verified_count bigint not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  rotated_at timestamptz
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'customer_portal_invites_enrollment_campaign_id_fkey'
  ) then
    alter table public.customer_portal_invites
      add constraint customer_portal_invites_enrollment_campaign_id_fkey
      foreign key (enrollment_campaign_id)
      references public.portal_enrollment_campaigns(id)
      on delete set null;
  end if;
end $$;

create index if not exists portal_enrollment_campaigns_shop_idx
  on public.portal_enrollment_campaigns(shop_id, active, created_at desc);

alter table public.portal_enrollment_campaigns enable row level security;

create or replace function public.record_portal_enrollment_scan(p_slug text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.portal_enrollment_campaigns
  set scan_count = scan_count + 1,
      updated_at = now()
  where slug = p_slug and active = true;
  return found;
end;
$$;

revoke all on function public.record_portal_enrollment_scan(text) from public;
grant execute on function public.record_portal_enrollment_scan(text) to anon, authenticated, service_role;

create or replace function public.increment_portal_campaign_verified()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.accepted_at is null and new.accepted_at is not null and new.enrollment_campaign_id is not null then
    update public.portal_enrollment_campaigns
    set verified_count = verified_count + 1,
        updated_at = now()
    where id = new.enrollment_campaign_id;
  end if;
  return new;
end;
$$;

drop trigger if exists customer_portal_invite_campaign_verified on public.customer_portal_invites;
create trigger customer_portal_invite_campaign_verified
after update of accepted_at on public.customer_portal_invites
for each row execute function public.increment_portal_campaign_verified();

drop policy if exists "portal enrollment campaigns shop managers read" on public.portal_enrollment_campaigns;
create policy "portal enrollment campaigns shop managers read"
on public.portal_enrollment_campaigns for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.shop_id = portal_enrollment_campaigns.shop_id
      and lower(coalesce(p.role, '')) in ('owner', 'admin', 'manager')
  )
);

drop policy if exists "portal enrollment campaigns shop managers write" on public.portal_enrollment_campaigns;
create policy "portal enrollment campaigns shop managers write"
on public.portal_enrollment_campaigns for all to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.shop_id = portal_enrollment_campaigns.shop_id
      and lower(coalesce(p.role, '')) in ('owner', 'admin', 'manager')
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.shop_id = portal_enrollment_campaigns.shop_id
      and lower(coalesce(p.role, '')) in ('owner', 'admin', 'manager')
  )
);

create table if not exists public.fleet_portal_invites (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  fleet_id uuid not null references public.fleets(id) on delete cascade,
  email text not null,
  role text not null default 'viewer' check (role in ('viewer', 'approver', 'manager')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by_user_id uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists fleet_portal_invites_scope_idx
  on public.fleet_portal_invites(shop_id, fleet_id, lower(email), created_at desc);

alter table public.fleet_portal_invites enable row level security;

drop policy if exists "fleet portal invites shop managers read" on public.fleet_portal_invites;
create policy "fleet portal invites shop managers read"
on public.fleet_portal_invites for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.shop_id = fleet_portal_invites.shop_id
      and lower(coalesce(p.role, '')) in ('owner', 'admin', 'manager')
  )
);

drop policy if exists "fleet portal invites shop managers write" on public.fleet_portal_invites;
create policy "fleet portal invites shop managers write"
on public.fleet_portal_invites for all to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.shop_id = fleet_portal_invites.shop_id
      and lower(coalesce(p.role, '')) in ('owner', 'admin', 'manager')
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.shop_id = fleet_portal_invites.shop_id
      and lower(coalesce(p.role, '')) in ('owner', 'admin', 'manager')
  )
);

create or replace function public.accept_fleet_portal_invite_atomic(
  p_token_hash text,
  p_actor_user_id uuid,
  p_actor_email text,
  p_at timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.fleet_portal_invites%rowtype;
  v_email text := lower(trim(coalesce(p_actor_email, '')));
  v_now timestamptz := coalesce(p_at, now());
begin
  if nullif(trim(p_token_hash), '') is null or p_actor_user_id is null or v_email = '' then
    raise exception using errcode = 'P0001', message = 'Invite and authenticated account are required.';
  end if;

  select * into v_invite
  from public.fleet_portal_invites
  where token_hash = p_token_hash
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'Fleet invite not found.';
  end if;
  if lower(trim(v_invite.email)) <> v_email then
    raise exception using errcode = 'P0001', message = 'Fleet invite email does not match the authenticated account.';
  end if;
  if v_invite.revoked_at is not null then
    raise exception using errcode = 'P0001', message = 'Fleet invite has been revoked.';
  end if;
  if v_invite.expires_at <= v_now then
    raise exception using errcode = 'P0001', message = 'Fleet invite has expired.';
  end if;
  if v_invite.accepted_by_user_id is not null and v_invite.accepted_by_user_id <> p_actor_user_id then
    raise exception using errcode = 'P0001', message = 'Fleet invite was accepted by another account.';
  end if;

  insert into public.profiles(id, email, role, shop_id, completed_onboarding)
  values (p_actor_user_id, v_email, 'fleet_manager', v_invite.shop_id, true)
  on conflict (id) do update
  set email = coalesce(public.profiles.email, excluded.email),
      updated_at = v_now;

  if not exists (
    select 1 from public.fleet_members fm
    where fm.user_id = p_actor_user_id and fm.fleet_id = v_invite.fleet_id
  ) then
    insert into public.fleet_members(user_id, fleet_id, shop_id, role, created_by)
    values (p_actor_user_id, v_invite.fleet_id, v_invite.shop_id, v_invite.role, v_invite.created_by);
  else
    update public.fleet_members
    set role = v_invite.role,
        shop_id = v_invite.shop_id,
        updated_at = v_now
    where user_id = p_actor_user_id and fleet_id = v_invite.fleet_id;
  end if;

  update public.fleet_portal_invites
  set accepted_at = coalesce(accepted_at, v_now),
      accepted_by_user_id = p_actor_user_id
  where id = v_invite.id;

  insert into public.activity_logs(user_id, action, target_table, target_id, context)
  values (
    p_actor_user_id,
    'fleet_portal_invite_accepted',
    'fleet_portal_invites',
    v_invite.id,
    jsonb_build_object('shop_id', v_invite.shop_id, 'fleet_id', v_invite.fleet_id, 'role', v_invite.role)
  );

  return jsonb_build_object(
    'ok', true,
    'invite_id', v_invite.id,
    'shop_id', v_invite.shop_id,
    'fleet_id', v_invite.fleet_id,
    'role', v_invite.role
  );
end;
$$;

revoke all on function public.accept_fleet_portal_invite_atomic(text, uuid, text, timestamptz) from public;
grant execute on function public.accept_fleet_portal_invite_atomic(text, uuid, text, timestamptz) to service_role;

commit;
