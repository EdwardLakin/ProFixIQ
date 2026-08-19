-- Reconcile the inspection-template ownership contract that exists in the
-- canonical database but was absent from ordered migration history.

alter table public.inspection_templates enable row level security;

create or replace function public.set_inspection_template_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := (select auth.uid());
  v_actor_shop_id uuid;
begin
  -- Preserve explicit ownership for trusted service-role/background inserts.
  -- Authenticated Data API writes always derive both boundaries from auth.
  if v_actor_user_id is null then
    return new;
  end if;

  select p.shop_id
    into v_actor_shop_id
  from public.profiles p
  where (p.id = v_actor_user_id or p.user_id = v_actor_user_id)
    and p.shop_id is not null
  order by (p.id = v_actor_user_id) desc, p.id
  limit 1;

  new.user_id := v_actor_user_id;
  new.shop_id := v_actor_shop_id;
  return new;
end;
$$;

revoke all on function public.set_inspection_template_owner()
  from public, anon, authenticated;
grant execute on function public.set_inspection_template_owner()
  to service_role;

drop trigger if exists trg_set_inspection_template_owner
  on public.inspection_templates;
create trigger trg_set_inspection_template_owner
before insert on public.inspection_templates
for each row execute function public.set_inspection_template_owner();

drop policy if exists inspection_templates_select
  on public.inspection_templates;
drop policy if exists inspection_templates_insert
  on public.inspection_templates;
drop policy if exists inspection_templates_update
  on public.inspection_templates;
drop policy if exists inspection_templates_delete
  on public.inspection_templates;

create policy inspection_templates_select
on public.inspection_templates
for select
to authenticated
using (
  is_public is true
  or shop_id in (
    select p.shop_id
    from public.profiles p
    where (
      p.id = (select auth.uid())
      or p.user_id = (select auth.uid())
    )
      and p.shop_id is not null
  )
);

create policy inspection_templates_insert
on public.inspection_templates
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and shop_id in (
    select p.shop_id
    from public.profiles p
    where (
      p.id = (select auth.uid())
      or p.user_id = (select auth.uid())
    )
      and p.shop_id is not null
      and public.canonical_shop_membership_role(p.role) in (
        'owner', 'admin', 'manager', 'advisor', 'service'
      )
  )
);

create policy inspection_templates_update
on public.inspection_templates
for update
to authenticated
using (
  user_id = (select auth.uid())
  and shop_id in (
    select p.shop_id
    from public.profiles p
    where (
      p.id = (select auth.uid())
      or p.user_id = (select auth.uid())
    )
      and p.shop_id is not null
      and public.canonical_shop_membership_role(p.role) in (
        'owner', 'admin', 'manager', 'advisor', 'service'
      )
  )
)
with check (
  user_id = (select auth.uid())
  and shop_id in (
    select p.shop_id
    from public.profiles p
    where (
      p.id = (select auth.uid())
      or p.user_id = (select auth.uid())
    )
      and p.shop_id is not null
      and public.canonical_shop_membership_role(p.role) in (
        'owner', 'admin', 'manager', 'advisor', 'service'
      )
  )
);

create policy inspection_templates_delete
on public.inspection_templates
for delete
to authenticated
using (
  user_id = (select auth.uid())
  and shop_id in (
    select p.shop_id
    from public.profiles p
    where (
      p.id = (select auth.uid())
      or p.user_id = (select auth.uid())
    )
      and p.shop_id is not null
      and public.canonical_shop_membership_role(p.role) in (
        'owner', 'admin', 'manager', 'advisor', 'service'
      )
  )
);

create index if not exists idx_inspection_templates__shop_id
  on public.inspection_templates (shop_id);
create index if not exists idx_inspection_templates__user_id
  on public.inspection_templates (user_id);

revoke all privileges on table public.inspection_templates from anon;
revoke all privileges on table public.inspection_templates from authenticated;
grant select, insert, update, delete
  on table public.inspection_templates
  to authenticated;
