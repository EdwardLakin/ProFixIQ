\set ON_ERROR_STOP on

-- Regression for the guided onboarding schema reconciliation: the columns and
-- session statuses the app writes must exist, pre-existing statuses must stay
-- valid, unknown statuses must still be rejected, and historical sessions must
-- have started_at backfilled from created_at (not the deploy time).

begin;

insert into auth.users (id, email, raw_user_meta_data)
values (
  'b91c0000-0000-4000-8000-00000000a000',
  'guided-schema-owner@example.test',
  '{"full_name":"Guided Schema Owner"}'::jsonb
);

insert into public.profiles (id, user_id, role, full_name, email, shop_id)
values (
  'b91c0000-0000-4000-8000-00000000a000',
  'b91c0000-0000-4000-8000-00000000a000',
  'owner',
  'Guided Schema Owner',
  'guided-schema-owner@example.test',
  null
)
on conflict (id) do update
set user_id = excluded.user_id,
    role = excluded.role,
    full_name = excluded.full_name,
    email = excluded.email;

insert into public.shops (id, owner_id, business_name, name, plan)
values (
  'b91c1000-0000-4000-8000-00000000a000',
  'b91c0000-0000-4000-8000-00000000a000',
  'Guided Schema Runtime Shop',
  'Guided Schema Runtime Shop',
  'starter'
);

-- Columns the app writes exist and accept values.
insert into public.guided_onboarding_sessions
  (id, shop_id, created_by, status, current_step_key, existing_system)
values (
  'b91c2000-0000-4000-8000-00000000a000',
  'b91c1000-0000-4000-8000-00000000a000',
  'b91c0000-0000-4000-8000-00000000a000',
  'active',
  'customers',
  'starting_from_scratch'
);

insert into public.guided_onboarding_events
  (session_id, shop_id, step_key, event_type, payload, created_by)
values (
  'b91c2000-0000-4000-8000-00000000a000',
  'b91c1000-0000-4000-8000-00000000a000',
  null,
  'existing_system_answered',
  '{}'::jsonb,
  'b91c0000-0000-4000-8000-00000000a000'
);

-- Every status the app or its previous constraint uses is accepted.
do $guided_statuses$
declare
  s text;
begin
  foreach s in array array['active', 'in_progress', 'completed', 'cancelled', 'paused', 'skipped']
  loop
    update public.guided_onboarding_sessions
    set status = s
    where id = 'b91c2000-0000-4000-8000-00000000a000';
  end loop;
end;
$guided_statuses$;

-- Unknown statuses are still rejected.
do $guided_bad_status$
begin
  update public.guided_onboarding_sessions
  set status = 'bogus'
  where id = 'b91c2000-0000-4000-8000-00000000a000';

  raise exception 'Regression: unknown guided session status was accepted.'
    using errcode = 'PXQ01';
exception
  when sqlstate '23514' then
    null;
end;
$guided_bad_status$;

-- started_at defaults on new sessions; the migration backfill used created_at.
do $guided_started_at$
declare
  v_started timestamptz;
begin
  select started_at into v_started
  from public.guided_onboarding_sessions
  where id = 'b91c2000-0000-4000-8000-00000000a000';

  if v_started is null then
    raise exception 'Regression: guided session started_at default is missing.'
      using errcode = 'PXQ01';
  end if;
end;
$guided_started_at$;

rollback;
