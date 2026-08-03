-- Workforce canonical identity boundary.
--
-- Historical profiles can use either profiles.id or profiles.user_id as the
-- Supabase auth subject. Workforce evidence always stores profiles.id, so every
-- self-service policy must resolve auth.uid() to that canonical profile id.

create or replace function public.profixiq_workforce_profile_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
  from public.profiles p
  where p.id = auth.uid()
     or p.user_id = auth.uid()
  order by case when p.id = auth.uid() then 0 else 1 end
  limit 1
$$;

revoke all on function public.profixiq_workforce_profile_id()
  from public, anon;
grant execute on function public.profixiq_workforce_profile_id()
  to authenticated, service_role;

create or replace function public.profixiq_workforce_shop_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.shop_id
  from public.profiles p
  where p.id = (select public.profixiq_workforce_profile_id())
$$;

revoke all on function public.profixiq_workforce_shop_id()
  from public, anon;
grant execute on function public.profixiq_workforce_shop_id()
  to authenticated, service_role;

-- Some imported staff profiles keep the Supabase auth subject in user_id while
-- their canonical workforce identity is profiles.id. Preserve the existing
-- self-read policies and add the equivalent auth-linked self read.
drop policy if exists profiles_auth_linked_read on public.profiles;
create policy profiles_auth_linked_read
  on public.profiles
  for select
  to authenticated
  using (user_id = auth.uid());

create or replace function public.profixiq_workforce_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select lower(coalesce(p.role::text, ''))
  from public.profiles p
  where p.id = (select public.profixiq_workforce_profile_id())
$$;

revoke all on function public.profixiq_workforce_role()
  from public, anon;
grant execute on function public.profixiq_workforce_role()
  to authenticated, service_role;

create or replace function public.profixiq_can_manage_workforce()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select public.profixiq_workforce_role()) in (
    'owner',
    'admin',
    'manager'
  )
$$;

create or replace function public.profixiq_can_finalize_workforce()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select public.profixiq_workforce_role()) in ('owner', 'admin')
$$;

revoke all on function public.profixiq_can_manage_workforce()
  from public, anon;
grant execute on function public.profixiq_can_manage_workforce()
  to authenticated, service_role;

revoke all on function public.profixiq_can_finalize_workforce()
  from public, anon;
grant execute on function public.profixiq_can_finalize_workforce()
  to authenticated, service_role;

drop policy if exists "own-shifts" on public.tech_shifts;
create policy "own-shifts"
  on public.tech_shifts
  for select
  to authenticated
  using (
    shop_id = (select public.profixiq_workforce_shop_id())
    and user_id = (select public.profixiq_workforce_profile_id())
  );

drop policy if exists "own-punches" on public.punch_events;
create policy "own-punches"
  on public.punch_events
  for select
  to authenticated
  using (
    user_id = (select public.profixiq_workforce_profile_id())
    and exists (
      select 1
      from public.tech_shifts shift_row
      where shift_row.id = punch_events.shift_id
        and shift_row.shop_id =
          (select public.profixiq_workforce_shop_id())
        and shift_row.user_id =
          (select public.profixiq_workforce_profile_id())
    )
  );

drop policy if exists staff_schedule_templates_shop_select
  on public.staff_schedule_templates;
create policy staff_schedule_templates_shop_select
  on public.staff_schedule_templates
  for select
  to authenticated
  using (
    shop_id = (select public.profixiq_workforce_shop_id())
    and (
      user_id = (select public.profixiq_workforce_profile_id())
      or (select public.profixiq_can_manage_workforce())
    )
  );

drop policy if exists staff_schedule_overrides_shop_select
  on public.staff_schedule_overrides;
create policy staff_schedule_overrides_shop_select
  on public.staff_schedule_overrides
  for select
  to authenticated
  using (
    shop_id = (select public.profixiq_workforce_shop_id())
    and (
      user_id = (select public.profixiq_workforce_profile_id())
      or (select public.profixiq_can_manage_workforce())
    )
  );

drop policy if exists staff_time_off_requests_shop_select
  on public.staff_time_off_requests;
create policy staff_time_off_requests_shop_select
  on public.staff_time_off_requests
  for select
  to authenticated
  using (
    shop_id = (select public.profixiq_workforce_shop_id())
    and (
      user_id = (select public.profixiq_workforce_profile_id())
      or (select public.profixiq_can_manage_workforce())
    )
  );

drop policy if exists staff_availability_blocks_shop_select
  on public.staff_availability_blocks;
create policy staff_availability_blocks_shop_select
  on public.staff_availability_blocks
  for select
  to authenticated
  using (
    shop_id = (select public.profixiq_workforce_shop_id())
    and (
      user_id = (select public.profixiq_workforce_profile_id())
      or (select public.profixiq_can_manage_workforce())
    )
  );

drop policy if exists payroll_time_entries_scoped_select
  on public.payroll_time_entries;
create policy payroll_time_entries_scoped_select
  on public.payroll_time_entries
  for select
  to authenticated
  using (
    shop_id = (select public.profixiq_workforce_shop_id())
    and (
      user_id = (select public.profixiq_workforce_profile_id())
      or (select public.profixiq_can_manage_workforce())
    )
  );

drop policy if exists payroll_time_exceptions_scoped_select
  on public.payroll_time_exceptions;
create policy payroll_time_exceptions_scoped_select
  on public.payroll_time_exceptions
  for select
  to authenticated
  using (
    shop_id = (select public.profixiq_workforce_shop_id())
    and (
      user_id = (select public.profixiq_workforce_profile_id())
      or (select public.profixiq_can_manage_workforce())
    )
  );

drop policy if exists flat_rate_credits_scoped_select
  on public.work_order_line_flat_rate_credits;
create policy flat_rate_credits_scoped_select
  on public.work_order_line_flat_rate_credits
  for select
  to authenticated
  using (
    shop_id = (select public.profixiq_workforce_shop_id())
    and (
      technician_id = (select public.profixiq_workforce_profile_id())
      or (select public.profixiq_can_manage_workforce())
    )
  );

drop policy if exists shift_corrections_shop_select
  on public.shift_corrections;
create policy shift_corrections_shop_select
  on public.shift_corrections
  for select
  to authenticated
  using (
    shop_id = (select public.profixiq_workforce_shop_id())
    and (
      target_user_id = (select public.profixiq_workforce_profile_id())
      or (select public.profixiq_can_manage_workforce())
    )
  );

comment on function public.profixiq_workforce_profile_id() is
  'Resolves the authenticated subject to the canonical profiles.id used by workforce evidence.';

comment on function public.profixiq_workforce_shop_id() is
  'Resolves the authenticated workforce identity to its shop without changing the application-wide current-shop contract.';
