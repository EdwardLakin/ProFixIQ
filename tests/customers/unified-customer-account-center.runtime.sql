\set ON_ERROR_STOP on

-- @regression-flow customers.account-center
begin;

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '61100000-0000-4000-8000-000000000001',
    'account-center-owner-a@example.com',
    '{"full_name":"Account Center Owner A"}'::jsonb
  ),
  (
    '61100000-0000-4000-8000-000000000002',
    'account-center-owner-b@example.com',
    '{"full_name":"Account Center Owner B"}'::jsonb
  )
on conflict (id) do nothing;

insert into public.profiles (id, user_id, role, full_name)
values
  (
    '61100000-0000-4000-8000-000000000001',
    '61100000-0000-4000-8000-000000000001',
    'owner',
    'Account Center Owner A'
  ),
  (
    '61100000-0000-4000-8000-000000000002',
    '61100000-0000-4000-8000-000000000002',
    'owner',
    'Account Center Owner B'
  )
on conflict (id) do update
set user_id = excluded.user_id,
    role = excluded.role,
    full_name = excluded.full_name;

insert into public.shops (id, owner_id, business_name, name, labor_rate, country)
values
  (
    '61200000-0000-4000-8000-000000000001',
    '61100000-0000-4000-8000-000000000001',
    'Account Center Shop A',
    'Account Center Shop A',
    150,
    'CA'
  ),
  (
    '61200000-0000-4000-8000-000000000002',
    '61100000-0000-4000-8000-000000000002',
    'Account Center Shop B',
    'Account Center Shop B',
    160,
    'CA'
  );

update public.profiles
set shop_id = case id
  when '61100000-0000-4000-8000-000000000001'::uuid
    then '61200000-0000-4000-8000-000000000001'::uuid
  else '61200000-0000-4000-8000-000000000002'::uuid
end
where id in (
  '61100000-0000-4000-8000-000000000001',
  '61100000-0000-4000-8000-000000000002'
);

do $$
declare
  v_target jsonb;
  v_same jsonb;
  v_name_duplicate jsonb;
  v_source jsonb;
  v_archive jsonb;
  v_target_id uuid;
  v_source_id uuid;
  v_archive_id uuid;
  v_billing_contact_id uuid;
  v_merge jsonb;
  v_summary jsonb;
begin
  v_target := public.create_customer_account_atomic(
    '61200000-0000-4000-8000-000000000001',
    'business',
    'Alex Morgan',
    'Morgan Earthworks',
    'BILLING@MORGAN.EXAMPLE',
    '+1 (403) 555-0101',
    '10 Service Road',
    'Calgary',
    'AB',
    'T1X 0A1',
    'Runtime canonical target',
    null,
    false,
    false,
    '61100000-0000-4000-8000-000000000001',
    'account-center-target'
  );
  if not (v_target ->> 'ok')::boolean then
    raise exception 'Canonical target was not created: %', v_target;
  end if;
  v_target_id := (v_target #>> '{customer,id}')::uuid;

  v_same := public.create_customer_account_atomic(
    '61200000-0000-4000-8000-000000000001',
    'business',
    'Alex Morgan',
    'Morgan Earthworks',
    'billing@morgan.example',
    '4035550101',
    null, null, null, null, null, null,
    true,
    false,
    '61100000-0000-4000-8000-000000000001',
    'account-center-exact-reuse'
  );
  if not (v_same ->> 'matched_existing')::boolean
     or (v_same #>> '{customer,id}')::uuid <> v_target_id then
    raise exception 'Exact email/phone did not reuse canonical account: %', v_same;
  end if;

  v_name_duplicate := public.create_customer_account_atomic(
    '61200000-0000-4000-8000-000000000001',
    'business',
    'Different Contact',
    'Morgan Earthworks',
    null,
    null,
    null, null, null, null, null, null,
    false,
    false,
    '61100000-0000-4000-8000-000000000001',
    'account-center-name-review'
  );
  if (v_name_duplicate ->> 'code') is distinct from 'CUSTOMER_DUPLICATE_REVIEW_REQUIRED'
     or jsonb_array_length(v_name_duplicate -> 'duplicate_candidates') = 0 then
    raise exception 'Name overlap did not require duplicate review: %', v_name_duplicate;
  end if;

  select id into strict v_billing_contact_id
  from public.customer_contacts
  where customer_id = v_target_id and is_primary;

  perform public.update_customer_commercial_controls_atomic(
    '61200000-0000-4000-8000-000000000001',
    v_target_id,
    v_billing_contact_id,
    v_billing_contact_id,
    true,
    'net_30',
    30,
    true,
    'AB-EXEMPT-42',
    'credit_hold',
    'Awaiting current account authorization',
    'Send consolidated statements monthly.',
    'Morgan PO account',
    '61100000-0000-4000-8000-000000000001',
    'account-center-controls'
  );

  if not exists (
    select 1 from public.customer_settings settings
    where settings.customer_id = v_target_id
      and settings.shop_id = '61200000-0000-4000-8000-000000000001'
      and settings.po_required
      and settings.payment_terms = 'net_30'
      and settings.tax_exempt
      and settings.account_status = 'credit_hold'
      and settings.primary_billing_contact_id = v_billing_contact_id
  ) then
    raise exception 'Commercial controls were not stored on the canonical settings row.';
  end if;

  v_source := public.create_customer_account_atomic(
    '61200000-0000-4000-8000-000000000001',
    'individual',
    'Alex Morgan Duplicate',
    null,
    'alex.duplicate@example.com',
    '4035550199',
    null, null, null, null,
    'Runtime duplicate source',
    null,
    false,
    true,
    '61100000-0000-4000-8000-000000000001',
    'account-center-source'
  );
  v_source_id := (v_source #>> '{customer,id}')::uuid;
  update public.customers
  set user_id = '61100000-0000-4000-8000-000000000001'
  where id = v_source_id;

  v_merge := public.merge_customer_accounts_atomic(
    '61200000-0000-4000-8000-000000000001',
    v_source_id,
    v_target_id,
    'Confirmed duplicate created during runtime verification.',
    '61100000-0000-4000-8000-000000000001',
    'account-center-merge'
  );
  if not (v_merge ->> 'ok')::boolean
     or (v_merge ->> 'redirect_customer_id')::uuid <> v_target_id then
    raise exception 'Customer merge did not return canonical redirect: %', v_merge;
  end if;
  if not exists (
    select 1 from public.customers customer
    where customer.id = v_source_id
      and not customer.active
      and customer.merged_into_customer_id = v_target_id
      and customer.merged_at is not null
      and customer.user_id is null
  ) then
    raise exception 'Merged source customer was not retained as an archived redirect.';
  end if;
  if not exists (
    select 1 from public.customers customer
    where customer.id = v_target_id
      and customer.user_id = '61100000-0000-4000-8000-000000000001'
  ) then
    raise exception 'Customer portal identity was not transferred to the canonical target.';
  end if;
  if exists (
    select 1 from public.customer_contacts contact
    where contact.customer_id = v_source_id
  ) or not exists (
    select 1 from public.customer_contacts contact
    where contact.customer_id = v_target_id
      and contact.email = 'alex.duplicate@example.com'
  ) then
    raise exception 'Merge did not consolidate customer contacts.';
  end if;
  if not exists (
    select 1 from public.customer_account_merges merge
    where merge.source_customer_id = v_source_id
      and merge.target_customer_id = v_target_id
      and merge.source_snapshot ->> 'id' = v_source_id::text
      and merge.target_snapshot ->> 'id' = v_target_id::text
  ) then
    raise exception 'Merge audit history was not recorded.';
  end if;

  v_archive := public.create_customer_account_atomic(
    '61200000-0000-4000-8000-000000000001',
    'individual',
    'Archive Runtime Customer',
    null,
    'archive.runtime@example.com',
    null,
    null, null, null, null, null, null,
    false,
    false,
    '61100000-0000-4000-8000-000000000001',
    'account-center-archive-source'
  );
  v_archive_id := (v_archive #>> '{customer,id}')::uuid;
  perform public.archive_customer_account_atomic(
    '61200000-0000-4000-8000-000000000001',
    v_archive_id,
    'Customer requested account closure.',
    '61100000-0000-4000-8000-000000000001',
    'account-center-archive'
  );
  if not coalesce((public.archive_customer_account_atomic(
    '61200000-0000-4000-8000-000000000001',
    v_archive_id,
    'Customer requested account closure.',
    '61100000-0000-4000-8000-000000000001',
    'account-center-archive'
  ) ->> 'idempotent')::boolean, false) then
    raise exception 'Archive command did not replay idempotently.';
  end if;
  if not exists (
    select 1 from public.customers customer
    where customer.id = v_archive_id
      and not customer.active
      and customer.archived_at is not null
      and customer.merged_into_customer_id is null
  ) then
    raise exception 'Archive removed or failed to retain the customer account.';
  end if;

  v_summary := public.get_customer_account_center(
    '61200000-0000-4000-8000-000000000001',
    v_target_id,
    '61100000-0000-4000-8000-000000000001'
  );
  if (v_summary #>> '{counts,merged_sources}')::integer <> 1
     or (v_summary #>> '{settings,po_required}')::boolean is not true
     or (v_summary ->> 'can_manage_commercial')::boolean is not true then
    raise exception 'Account Center summary did not consolidate expected state: %', v_summary;
  end if;
end;
$$;

insert into public.fleets (
  id, shop_id, customer_id, name, created_by
)
select
  '61300000-0000-4000-8000-000000000001',
  '61200000-0000-4000-8000-000000000001',
  customer.id,
  'Account Center Runtime Fleet',
  '61100000-0000-4000-8000-000000000001'
from public.customers customer
where customer.shop_id = '61200000-0000-4000-8000-000000000001'
  and customer.email = 'billing@morgan.example';

-- A different-Shop actor is denied before any explicit Fleet membership.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"61100000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

do $$
begin
  if exists (
    select 1 from public.fleets
    where id = '61300000-0000-4000-8000-000000000001'
  ) then
    raise exception 'Cross-Shop non-member read a Fleet workspace.';
  end if;
end;
$$;

reset role;
select set_config('request.jwt.claims', '', true);
select set_config('request.jwt.claim.role', '', true);

insert into public.fleet_members (
  fleet_id, shop_id, user_id, role, created_by
) values (
  '61300000-0000-4000-8000-000000000001',
  '61200000-0000-4000-8000-000000000001',
  '61100000-0000-4000-8000-000000000002',
  'viewer',
  '61100000-0000-4000-8000-000000000001'
);

-- Shop staff can read the Fleet and its membership rows without RLS recursion.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"61100000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

do $$
begin
  if not exists (
    select 1 from public.fleets
    where id = '61300000-0000-4000-8000-000000000001'
  ) or not exists (
    select 1 from public.fleet_members
    where fleet_id = '61300000-0000-4000-8000-000000000001'
      and user_id = '61100000-0000-4000-8000-000000000002'
  ) then
    raise exception 'Shop staff could not read the linked Fleet relationship.';
  end if;
end;
$$;

reset role;
select set_config('request.jwt.claims', '', true);
select set_config('request.jwt.claim.role', '', true);

-- An explicit Fleet member can read that Fleet and their own membership row.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"61100000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

do $$
declare
  v_denied boolean := false;
begin
  if not exists (
    select 1 from public.fleets
    where id = '61300000-0000-4000-8000-000000000001'
  ) or not exists (
    select 1 from public.fleet_members
    where fleet_id = '61300000-0000-4000-8000-000000000001'
      and user_id = '61100000-0000-4000-8000-000000000002'
  ) then
    raise exception 'Explicit Fleet member could not read their Fleet scope.';
  end if;

  begin
    perform public.find_customer_account_duplicates(
      '61200000-0000-4000-8000-000000000001',
      'Morgan Earthworks', null, null, null, null, null,
      '61100000-0000-4000-8000-000000000002'
    );
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'Cross-Shop actor inspected customer duplicate candidates.';
  end if;
end;
$$;

reset role;
select set_config('request.jwt.claims', '', true);
select set_config('request.jwt.claim.role', '', true);

rollback;
