begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';

-- Production already accepts the canonical floor-lead and fleet roles, but the
-- ordered migration baseline still carries two legacy checks that only accept
-- the original shop roles. Drop every historical variant before normalizing so
-- clean replay can update `tech` without violating the old constraints.
alter table public.profiles
  drop constraint if exists profiles_role_check;
alter table public.profiles
  drop constraint if exists profiles_role_chk;
alter table public.profiles
  drop constraint if exists profiles_role_canonical_check;

-- Keep the application access role canonical. Workforce titles and
-- apprenticeship levels remain owned by people_workforce_profiles.
update public.profiles
set role = case
  when role is null then null
  when lower(btrim(role)) in ('tech', 'technician') then 'mechanic'
  when lower(btrim(role)) in ('service_advisor', 'service advisor') then 'service'
  when lower(btrim(role)) in ('lead', 'leadhand', 'lead hand') then 'lead_hand'
  when lower(btrim(role)) = any (
    array[
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
    ]::text[]
  ) then lower(btrim(role))
  else 'unknown'
end
where role is not null
  and role is distinct from case
    when lower(btrim(role)) in ('tech', 'technician') then 'mechanic'
    when lower(btrim(role)) in ('service_advisor', 'service advisor') then 'service'
    when lower(btrim(role)) in ('lead', 'leadhand', 'lead hand') then 'lead_hand'
    when lower(btrim(role)) = any (
      array[
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
      ]::text[]
    ) then lower(btrim(role))
    else 'unknown'
  end;

alter table public.profiles
  add constraint profiles_role_canonical_check
  check (
    role is null
    or role = any (
      array[
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
      ]::text[]
    )
  ) not valid;

alter table public.profiles
  validate constraint profiles_role_canonical_check;

comment on column public.profiles.role is
  'Application access/RBAC role. Workforce role/title remains in public.people_workforce_profiles.';

notify pgrst, 'reload schema';

commit;
