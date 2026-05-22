-- Normalize public.profiles.role into a canonical RBAC allowlist.
-- NOTE: profiles.role is the app access/RBAC role.
-- Workforce role/title semantics remain in public.people_workforce_profiles.

-- 1) Backfill known legacy aliases (idempotent and non-destructive).
update public.profiles
set role = case lower(btrim(role))
  when 'tech' then 'mechanic'
  when 'technician' then 'mechanic'
  when 'lead' then 'lead_hand'
  when 'leadhand' then 'lead_hand'
  when 'lead hand' then 'lead_hand'
  else role
end
where role is not null
  and lower(btrim(role)) in ('tech', 'technician', 'lead', 'leadhand', 'lead hand');

-- 2) Remove conflicting legacy checks before adding canonical guardrail.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles drop constraint if exists profiles_role_chk;
alter table public.profiles drop constraint if exists profiles_role_canonical_check;

-- 3) Ensure no remaining non-canonical values block the new check.
do $$
declare
  v_unknown_count bigint;
begin
  select count(*)
  into v_unknown_count
  from public.profiles
  where role is not null
    and lower(btrim(role)) not in (
      'owner',
      'admin',
      'manager',
      'foreman',
      'lead_hand',
      'advisor',
      'service',
      'dispatcher',
      'parts',
      'mechanic',
      'fleet_manager',
      'driver',
      'customer',
      'unknown'
    );

  if v_unknown_count > 0 then
    raise notice 'Normalizing % non-canonical public.profiles.role values to unknown to satisfy canonical role check.', v_unknown_count;

    update public.profiles
    set role = 'unknown'
    where role is not null
      and lower(btrim(role)) not in (
        'owner',
        'admin',
        'manager',
        'foreman',
        'lead_hand',
        'advisor',
        'service',
        'dispatcher',
        'parts',
        'mechanic',
        'fleet_manager',
        'driver',
        'customer',
        'unknown'
      );
  end if;
end $$;

-- 4) Add canonical guardrail.
alter table public.profiles
  add constraint profiles_role_canonical_check
  check (
    role is null
    or role = any (
      array[
        'owner'::text,
        'admin'::text,
        'manager'::text,
        'foreman'::text,
        'lead_hand'::text,
        'advisor'::text,
        'service'::text,
        'dispatcher'::text,
        'parts'::text,
        'mechanic'::text,
        'fleet_manager'::text,
        'driver'::text,
        'customer'::text,
        'unknown'::text
      ]
    )
  );

comment on column public.profiles.role is
  'Application access/RBAC role. Workforce role/title remains in public.people_workforce_profiles.';

-- 5) Keep public.user_role_enum compatible where present.
do $$
begin
  if exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'user_role_enum'
  ) then
    alter type public.user_role_enum add value if not exists 'foreman';
    alter type public.user_role_enum add value if not exists 'lead_hand';
    alter type public.user_role_enum add value if not exists 'service';
    alter type public.user_role_enum add value if not exists 'dispatcher';
    alter type public.user_role_enum add value if not exists 'fleet_manager';
    alter type public.user_role_enum add value if not exists 'driver';
    alter type public.user_role_enum add value if not exists 'unknown';
    alter type public.user_role_enum add value if not exists 'mechanic';
  else
    raise notice 'public.user_role_enum does not exist; skipping enum value alignment.';
  end if;
end $$;
