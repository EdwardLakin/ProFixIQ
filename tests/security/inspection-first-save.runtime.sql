\set ON_ERROR_STOP on

begin;

do $inspection_writer_acl$
begin
  if has_function_privilege(
    'anon',
    'public.save_inspection_progress_v3_atomic(uuid,uuid,uuid,jsonb,text,timestamptz)',
    'EXECUTE'
  )
  or not has_function_privilege(
    'authenticated',
    'public.save_inspection_progress_v3_atomic(uuid,uuid,uuid,jsonb,text,timestamptz)',
    'EXECUTE'
  )
  or not has_function_privilege(
    'service_role',
    'public.save_inspection_progress_v3_atomic(uuid,uuid,uuid,jsonb,text,timestamptz)',
    'EXECUTE'
  ) then
    raise exception 'Inspection writer RPC ACL changed unexpectedly.';
  end if;
end;
$inspection_writer_acl$;

insert into auth.users (id, email, raw_user_meta_data)
values (
  'a8270000-0000-4000-8000-000000000001',
  'inspection-first-save-owner@example.test',
  '{"full_name":"Inspection First Save Owner"}'::jsonb
)
on conflict (id) do nothing;

insert into public.profiles (id, user_id, role, full_name, email, shop_id)
values (
  'a8270000-0000-4000-8000-000000000001',
  'a8270000-0000-4000-8000-000000000001',
  'owner',
  'Inspection First Save Owner',
  'inspection-first-save-owner@example.test',
  null
)
on conflict (id) do update
set user_id = excluded.user_id,
    role = excluded.role,
    full_name = excluded.full_name,
    email = excluded.email;

insert into public.shops (
  id,
  owner_id,
  business_name,
  name,
  plan,
  user_limit,
  billing_entitlement_override
)
values (
  'a8271000-0000-4000-8000-000000000001',
  'a8270000-0000-4000-8000-000000000001',
  'Inspection First Save Runtime',
  'Inspection First Save Runtime',
  'complete_10',
  10,
  'internal_demo'
)
on conflict (id) do update
set billing_entitlement_override = 'internal_demo';

update public.profiles
set user_id = 'a8270000-0000-4000-8000-000000000001',
    shop_id = 'a8271000-0000-4000-8000-000000000001'
where id = 'a8270000-0000-4000-8000-000000000001';

insert into public.customers (id, shop_id, user_id, name, email)
values (
  'a8272000-0000-4000-8000-000000000001',
  'a8271000-0000-4000-8000-000000000001',
  'a8270000-0000-4000-8000-000000000001',
  'Inspection First Save Customer',
  'inspection-first-save-customer@example.test'
);

insert into public.work_orders (
  id,
  shop_id,
  customer_id,
  custom_id,
  status,
  approval_state
)
values (
  'a8273000-0000-4000-8000-000000000001',
  'a8271000-0000-4000-8000-000000000001',
  'a8272000-0000-4000-8000-000000000001',
  'INSPECTION-FIRST-SAVE-1',
  'in_progress',
  'pending'
);

insert into public.work_order_lines (
  id,
  work_order_id,
  complaint,
  status,
  line_status,
  approval_state,
  job_type,
  shop_id,
  user_id,
  urgency
)
values (
  'a8274000-0000-4000-8000-000000000001',
  'a8273000-0000-4000-8000-000000000001',
  'Brake inspection',
  'awaiting_approval',
  'pending',
  'pending',
  'inspection',
  'a8271000-0000-4000-8000-000000000001',
  'a8270000-0000-4000-8000-000000000001',
  'medium'
);

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  'a8270000-0000-4000-8000-000000000001',
  true
);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a8270000-0000-4000-8000-000000000001"}',
  true
);
set local role authenticated;

do $inspection_first_save_runtime$
declare
  v_first_session jsonb := jsonb_build_object(
    'id', 'device-draft-a',
    'syncRevision', 0,
    'lastUpdated', '2026-08-27T20:00:00Z',
    'sections', jsonb_build_array(
      jsonb_build_object(
        'title', 'Brake Inspection',
        'items', jsonb_build_array(
          jsonb_build_object(
            'item', 'Front brake pads',
            'status', 'fail',
            'notes', 'Front brake pads below specification',
            'laborHours', 1.5,
            'parts', jsonb_build_array(
              jsonb_build_object(
                'description', 'Front brake pad set',
                'qty', 1
              )
            )
          )
        )
      )
    )
  );
  v_second_session jsonb;
  v_stale_session jsonb;
  v_result jsonb;
  v_inspection_id uuid;
  v_revision bigint;
  v_summary jsonb;
  v_count integer;
  v_denied boolean;
begin
  -- This is the production regression: no canonical inspection exists before
  -- the call. The writer must insert revision zero and advance it to one.
  v_result := public.save_inspection_progress_v3_atomic(
    'a8271000-0000-4000-8000-000000000001',
    'a8274000-0000-4000-8000-000000000001',
    'a8270000-0000-4000-8000-000000000001',
    v_first_session,
    'inspection-first-save:first',
    '2026-08-27T20:00:01Z'
  );

  if (v_result ->> 'ok')::boolean is distinct from true
     or (v_result ->> 'sync_revision')::bigint is distinct from 1
     or (v_result ->> 'idempotent')::boolean is distinct from false
     or (v_result ->> 'superseded')::boolean is distinct from false then
    raise exception 'Initial inspection save returned an invalid receipt: %', v_result;
  end if;

  v_inspection_id := (v_result ->> 'inspection_id')::uuid;
  select sync_revision, summary
    into v_revision, v_summary
  from public.inspections
  where id = v_inspection_id
    and shop_id = 'a8271000-0000-4000-8000-000000000001'
    and work_order_line_id = 'a8274000-0000-4000-8000-000000000001'
    and is_canonical;

  if not found
     or v_revision is distinct from 1
     or v_summary #>> '{sections,0,items,0,notes}'
        is distinct from 'Front brake pads below specification'
     or (v_summary ->> 'syncRevision')::bigint is distinct from 1 then
    raise exception 'Initial inspection row was not saved canonically: revision %, summary %',
      v_revision, v_summary;
  end if;

  select count(*) into v_count
  from public.inspections
  where shop_id = 'a8271000-0000-4000-8000-000000000001'
    and work_order_line_id = 'a8274000-0000-4000-8000-000000000001'
    and is_canonical;
  if v_count is distinct from 1 then
    raise exception 'Initial save created % canonical inspection rows.', v_count;
  end if;

  -- Retrying the same device operation must reuse its receipt and must not
  -- advance or duplicate the canonical row.
  v_result := public.save_inspection_progress_v3_atomic(
    'a8271000-0000-4000-8000-000000000001',
    'a8274000-0000-4000-8000-000000000001',
    'a8270000-0000-4000-8000-000000000001',
    v_first_session,
    'inspection-first-save:first',
    '2026-08-27T20:00:02Z'
  );
  if (v_result ->> 'idempotent')::boolean is distinct from true
     or (v_result ->> 'sync_revision')::bigint is distinct from 1 then
    raise exception 'Initial inspection retry was not idempotent: %', v_result;
  end if;

  v_second_session := v_first_session || jsonb_build_object(
    'syncRevision', 1,
    'lastUpdated', '2026-08-27T20:01:00Z',
    'sections', jsonb_build_array(
      jsonb_build_object(
        'title', 'Brake Inspection',
        'items', jsonb_build_array(
          jsonb_build_object(
            'item', 'Front brake pads',
            'status', 'fail',
            'notes', 'Front and rear brake service required',
            'laborHours', 2.5,
            'parts', jsonb_build_array(
              jsonb_build_object(
                'description', 'Front and rear brake pad set',
                'qty', 1
              )
            )
          )
        )
      )
    )
  );

  v_result := public.save_inspection_progress_v3_atomic(
    'a8271000-0000-4000-8000-000000000001',
    'a8274000-0000-4000-8000-000000000001',
    'a8270000-0000-4000-8000-000000000001',
    v_second_session,
    'inspection-first-save:second',
    '2026-08-27T20:01:01Z'
  );
  if (v_result ->> 'sync_revision')::bigint is distinct from 2
     or (v_result ->> 'superseded')::boolean is distinct from false then
    raise exception 'Second inspection save did not advance to revision two: %', v_result;
  end if;

  select sync_revision, summary
    into v_revision, v_summary
  from public.inspections
  where id = v_inspection_id;
  if v_revision is distinct from 2
     or v_summary #>> '{sections,0,items,0,notes}'
        is distinct from 'Front and rear brake service required' then
    raise exception 'Second inspection save did not replace the canonical snapshot.';
  end if;

  -- An older stale-base device copy is acknowledged but cannot replace newer
  -- shop truth.
  v_stale_session := v_first_session || jsonb_build_object(
    'syncRevision', 1,
    'lastUpdated', '2026-08-27T20:00:30Z'
  );
  v_result := public.save_inspection_progress_v3_atomic(
    'a8271000-0000-4000-8000-000000000001',
    'a8274000-0000-4000-8000-000000000001',
    'a8270000-0000-4000-8000-000000000001',
    v_stale_session,
    'inspection-first-save:stale',
    '2026-08-27T20:01:02Z'
  );
  if (v_result ->> 'superseded')::boolean is distinct from true
     or (v_result ->> 'sync_revision')::bigint is distinct from 2
     or v_result #>> '{session,sections,0,items,0,notes}'
        is distinct from 'Front and rear brake service required' then
    raise exception 'Stale inspection snapshot did not preserve canonical truth: %', v_result;
  end if;

  -- A reused operation key with a different device snapshot remains a hard
  -- idempotency conflict.
  v_denied := false;
  begin
    perform public.save_inspection_progress_v3_atomic(
      'a8271000-0000-4000-8000-000000000001',
      'a8274000-0000-4000-8000-000000000001',
      'a8270000-0000-4000-8000-000000000001',
      v_second_session || jsonb_build_object('transcript', 'different payload'),
      'inspection-first-save:second',
      '2026-08-27T20:01:03Z'
    );
  exception
    when others then
      v_denied := sqlstate = 'P0001'
        and position('operation key was reused' in lower(sqlerrm)) > 0;
  end;
  if not v_denied then
    raise exception 'Inspection operation-key reuse was not rejected.';
  end if;

  -- Tenant membership remains a server-side boundary even when the caller can
  -- guess a shop UUID.
  v_denied := false;
  begin
    perform public.save_inspection_progress_v3_atomic(
      'a8271000-0000-4000-8000-000000000002',
      'a8274000-0000-4000-8000-000000000001',
      'a8270000-0000-4000-8000-000000000001',
      v_second_session,
      'inspection-first-save:cross-shop',
      '2026-08-27T20:01:04Z'
    );
  exception
    when others then
      v_denied := sqlstate = 'P0001'
        and position('not a member of this shop' in lower(sqlerrm)) > 0;
  end;
  if not v_denied then
    raise exception 'Cross-Shop inspection save was not rejected.';
  end if;
end;
$inspection_first_save_runtime$;

reset role;

update public.inspections
set locked = true,
    completed = true,
    is_draft = false,
    status = 'completed',
    finalized_at = '2026-08-27T20:02:00Z',
    finalized_by = 'a8270000-0000-4000-8000-000000000001'
where shop_id = 'a8271000-0000-4000-8000-000000000001'
  and work_order_line_id = 'a8274000-0000-4000-8000-000000000001'
  and is_canonical;

set local role authenticated;

do $inspection_finalization_guard$
declare
  v_denied boolean := false;
begin
  begin
    perform public.save_inspection_progress_v3_atomic(
      'a8271000-0000-4000-8000-000000000001',
      'a8274000-0000-4000-8000-000000000001',
      'a8270000-0000-4000-8000-000000000001',
      jsonb_build_object(
        'syncRevision', 2,
        'lastUpdated', '2026-08-27T20:03:00Z',
        'sections', '[]'::jsonb
      ),
      'inspection-first-save:after-finalization',
      '2026-08-27T20:03:01Z'
    );
  exception
    when others then
      v_denied := sqlstate = 'P0001'
        and position('finalized and locked' in lower(sqlerrm)) > 0;
  end;

  if not v_denied then
    raise exception 'Finalized inspection accepted another save.';
  end if;
end;
$inspection_finalization_guard$;

reset role;

do $inspection_failed_receipts$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.mobile_operation_keys
  where shop_id = 'a8271000-0000-4000-8000-000000000001'
    and operation_name = 'save_inspection_progress'
    and operation_key in (
      'inspection-first-save:cross-shop',
      'inspection-first-save:after-finalization'
    );

  if v_count is distinct from 0 then
    raise exception 'Rejected inspection saves created durable receipts.';
  end if;
end;
$inspection_failed_receipts$;

rollback;
