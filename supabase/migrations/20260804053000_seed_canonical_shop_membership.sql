begin;

-- shop_members is the canonical membership source for is_shop_member_v2 and
-- the RLS policies that protect stock locations and other shop resources.
-- Keep its role vocabulary aligned with the staff roles the provisioning API
-- already accepts, then backfill staff profiles created before membership
-- seeding was added.
alter table public.shop_members
  drop constraint if exists shop_members_role_check;

alter table public.shop_members
  add constraint shop_members_role_check
  check (
    role = any (
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
        'viewer'
      ]::text[]
    )
  );

insert into public.shop_members (
  shop_id,
  user_id,
  role,
  created_by
)
select
  p.shop_id,
  p.id,
  lower(trim(p.role::text)),
  p.created_by
from public.profiles p
where p.shop_id is not null
  and lower(trim(p.role::text)) = any (
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
      'driver'
    ]::text[]
  )
on conflict (shop_id, user_id)
do update set role = excluded.role;

commit;
