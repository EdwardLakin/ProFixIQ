-- Step 22A (manual draft only): property portal invites schema
-- IMPORTANT: Do not execute directly in production without review.

create table if not exists public.property_portal_invites (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  invited_email text not null,
  invited_name text,
  role text not null default 'tenant_requester',
  portfolio_id uuid references public.property_portfolios(id) on delete cascade,
  property_id uuid references public.property_properties(id) on delete cascade,
  unit_id uuid references public.property_units(id) on delete cascade,
  token_hash text not null,
  status text not null default 'pending',
  expires_at timestamptz not null,
  accepted_by_profile_id uuid references public.profiles(id) on delete set null,
  accepted_at timestamptz,
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint property_portal_invites_role_check
    check (role in ('property_manager', 'owner_approver', 'tenant_requester', 'viewer')),
  constraint property_portal_invites_status_check
    check (status in ('pending', 'accepted', 'expired', 'revoked')),
  constraint property_portal_invites_scope_check
    check (
      role = 'property_manager'
      or portfolio_id is not null
      or property_id is not null
      or unit_id is not null
    )
);

comment on table public.property_portal_invites is
  'Property portal invite records for tenant/owner/viewer/member access onboarding.';

comment on column public.property_portal_invites.token_hash is
  'Stores only a hash of the invite token; never store raw invite tokens.';

comment on column public.property_portal_invites.status is
  'Invite lifecycle status: pending, accepted, expired, revoked.';

comment on column public.property_portal_invites.accepted_at is
  'Timestamp set when invite is accepted; acceptance flow implemented later.';

comment on column public.property_portal_invites.created_by_profile_id is
  'Internal staff profile that created the invite.';

-- Raw token handling reminder:
-- 1) Raw token should only be shown/sent once at creation time.
-- 2) Invite acceptance will create or update public.property_members in a later step.
-- 3) Email delivery is intentionally deferred in this step.

create unique index if not exists property_portal_invites_token_hash_key
  on public.property_portal_invites(token_hash);

create index if not exists property_portal_invites_shop_id_idx
  on public.property_portal_invites(shop_id);

create index if not exists property_portal_invites_invited_email_lower_idx
  on public.property_portal_invites(lower(invited_email));

create index if not exists property_portal_invites_status_idx
  on public.property_portal_invites(status);

create index if not exists property_portal_invites_expires_at_idx
  on public.property_portal_invites(expires_at);

create index if not exists property_portal_invites_property_id_idx
  on public.property_portal_invites(property_id);

create index if not exists property_portal_invites_unit_id_idx
  on public.property_portal_invites(unit_id);

create or replace function public.property_portal_invites_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_property_portal_invites_set_updated_at on public.property_portal_invites;

create trigger trg_property_portal_invites_set_updated_at
before update on public.property_portal_invites
for each row
execute function public.property_portal_invites_set_updated_at();

create or replace function public.property_portal_invites_validate_hierarchy()
returns trigger
language plpgsql
as $$
declare
  v_portfolio_shop_id uuid;
  v_property_shop_id uuid;
  v_unit_shop_id uuid;
  v_property_portfolio_id uuid;
  v_unit_property_id uuid;
begin
  if new.portfolio_id is not null then
    select p.shop_id
      into v_portfolio_shop_id
    from public.property_portfolios p
    where p.id = new.portfolio_id;

    if v_portfolio_shop_id is null then
      raise exception 'Invalid portfolio_id % for invite %', new.portfolio_id, new.id;
    end if;

    if v_portfolio_shop_id <> new.shop_id then
      raise exception 'shop_id mismatch: invite %, portfolio %', new.id, new.portfolio_id;
    end if;
  end if;

  if new.property_id is not null then
    select p.shop_id, p.portfolio_id
      into v_property_shop_id, v_property_portfolio_id
    from public.property_properties p
    where p.id = new.property_id;

    if v_property_shop_id is null then
      raise exception 'Invalid property_id % for invite %', new.property_id, new.id;
    end if;

    if v_property_shop_id <> new.shop_id then
      raise exception 'shop_id mismatch: invite %, property %', new.id, new.property_id;
    end if;

    if new.portfolio_id is not null and v_property_portfolio_id is distinct from new.portfolio_id then
      raise exception 'Hierarchy mismatch: property % does not belong to portfolio %', new.property_id, new.portfolio_id;
    end if;
  end if;

  if new.unit_id is not null then
    select u.shop_id, u.property_id
      into v_unit_shop_id, v_unit_property_id
    from public.property_units u
    where u.id = new.unit_id;

    if v_unit_shop_id is null then
      raise exception 'Invalid unit_id % for invite %', new.unit_id, new.id;
    end if;

    if v_unit_shop_id <> new.shop_id then
      raise exception 'shop_id mismatch: invite %, unit %', new.id, new.unit_id;
    end if;

    if new.property_id is not null and v_unit_property_id is distinct from new.property_id then
      raise exception 'Hierarchy mismatch: unit % does not belong to property %', new.unit_id, new.property_id;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_property_portal_invites_validate_hierarchy on public.property_portal_invites;

create trigger trg_property_portal_invites_validate_hierarchy
before insert or update on public.property_portal_invites
for each row
execute function public.property_portal_invites_validate_hierarchy();

alter table public.property_portal_invites enable row level security;

drop policy if exists "property_portal_invites_internal_select" on public.property_portal_invites;
create policy "property_portal_invites_internal_select"
on public.property_portal_invites
for select
using (
  exists (
    select 1
    from public.profiles me
    where me.id = auth.uid()
      and me.shop_id = property_portal_invites.shop_id
  )
);

drop policy if exists "property_portal_invites_internal_insert" on public.property_portal_invites;
create policy "property_portal_invites_internal_insert"
on public.property_portal_invites
for insert
with check (
  exists (
    select 1
    from public.profiles me
    where me.id = auth.uid()
      and me.shop_id = property_portal_invites.shop_id
  )
);

drop policy if exists "property_portal_invites_internal_update" on public.property_portal_invites;
create policy "property_portal_invites_internal_update"
on public.property_portal_invites
for update
using (
  exists (
    select 1
    from public.profiles me
    where me.id = auth.uid()
      and me.shop_id = property_portal_invites.shop_id
  )
)
with check (
  exists (
    select 1
    from public.profiles me
    where me.id = auth.uid()
      and me.shop_id = property_portal_invites.shop_id
  )
);

drop policy if exists "property_portal_invites_internal_delete" on public.property_portal_invites;
create policy "property_portal_invites_internal_delete"
on public.property_portal_invites
for delete
using (
  exists (
    select 1
    from public.profiles me
    where me.id = auth.uid()
      and me.shop_id = property_portal_invites.shop_id
  )
);

-- Intentionally NOT added in Step 22A:
-- - Public token lookup policy
-- - Email-based invitee read policy
-- - Invite acceptance mutation policy (to be implemented in controlled server action later)
-- - Any Supabase Auth user creation
