\set ON_ERROR_STOP on

begin;

do $inspection_finding_acl$
begin
  if has_function_privilege(
    'anon',
    'public.submit_inspection_findings_atomic(uuid,uuid,uuid,uuid,uuid,text,bigint,jsonb,jsonb,timestamptz)',
    'EXECUTE'
  )
  or not has_function_privilege(
    'authenticated',
    'public.submit_inspection_findings_atomic(uuid,uuid,uuid,uuid,uuid,text,bigint,jsonb,jsonb,timestamptz)',
    'EXECUTE'
  )
  or not has_function_privilege(
    'service_role',
    'public.submit_inspection_findings_atomic(uuid,uuid,uuid,uuid,uuid,text,bigint,jsonb,jsonb,timestamptz)',
    'EXECUTE'
  ) then
    raise exception 'Inspection finding submission RPC ACL changed unexpectedly.';
  end if;
end;
$inspection_finding_acl$;

insert into auth.users (id, email, raw_user_meta_data)
values (
  'a8290000-0000-4000-8000-000000000001',
  'inspection-finding-tech@example.test',
  '{"full_name":"Inspection Finding Technician"}'::jsonb
)
on conflict (id) do nothing;

insert into public.profiles (id, user_id, role, full_name, email, shop_id)
values (
  'a8290000-0000-4000-8000-000000000001',
  'a8290000-0000-4000-8000-000000000001',
  'technician',
  'Inspection Finding Technician',
  'inspection-finding-tech@example.test',
  null
)
on conflict (id) do update
set user_id = excluded.user_id,
    role = excluded.role,
    full_name = excluded.full_name,
    email = excluded.email;

insert into public.shops (
  id, owner_id, business_name, name, plan, user_limit,
  billing_entitlement_override
)
values (
  'a8291000-0000-4000-8000-000000000001',
  'a8290000-0000-4000-8000-000000000001',
  'Inspection Finding Runtime',
  'Inspection Finding Runtime',
  'complete_10',
  10,
  'internal_demo'
)
on conflict (id) do update
set billing_entitlement_override = 'internal_demo';

update public.profiles
set shop_id = 'a8291000-0000-4000-8000-000000000001'
where id = 'a8290000-0000-4000-8000-000000000001';

insert into public.customers (id, shop_id, user_id, name, email)
values (
  'a8292000-0000-4000-8000-000000000001',
  'a8291000-0000-4000-8000-000000000001',
  'a8290000-0000-4000-8000-000000000001',
  'Inspection Finding Customer',
  'inspection-finding-customer@example.test'
);

insert into public.work_orders (
  id, shop_id, customer_id, custom_id, status, approval_state
)
values (
  'a8293000-0000-4000-8000-000000000001',
  'a8291000-0000-4000-8000-000000000001',
  'a8292000-0000-4000-8000-000000000001',
  'INSPECTION-FINDING-SUBMIT-1',
  'in_progress',
  'pending'
);

insert into public.work_order_lines (
  id, work_order_id, complaint, status, line_status, approval_state,
  job_type, shop_id, user_id, urgency
)
values (
  'a8294000-0000-4000-8000-000000000001',
  'a8293000-0000-4000-8000-000000000001',
  'Brake inspection',
  'awaiting_approval',
  'pending',
  'pending',
  'inspection',
  'a8291000-0000-4000-8000-000000000001',
  'a8290000-0000-4000-8000-000000000001',
  'medium'
);

insert into public.inspections (
  id, work_order_id, work_order_line_id, shop_id, user_id, summary,
  is_canonical, sync_revision, is_draft, completed, locked, status
)
values (
  'a8295000-0000-4000-8000-000000000001',
  'a8293000-0000-4000-8000-000000000001',
  'a8294000-0000-4000-8000-000000000001',
  'a8291000-0000-4000-8000-000000000001',
  'a8290000-0000-4000-8000-000000000001',
  '{
    "id":"a8295000-0000-4000-8000-000000000001",
    "workOrderId":"a8293000-0000-4000-8000-000000000001",
    "workOrderLineId":"a8294000-0000-4000-8000-000000000001",
    "syncRevision":3,
    "status":"in_progress",
    "started":true,
    "completed":false,
    "isPaused":false,
    "currentSectionIndex":0,
    "currentItemIndex":0,
    "sections":[{
      "title":"Brakes",
      "items":[
        {
          "item":"Brake pedal travel",
          "status":"fail",
          "notes":"Brake pedal is soft.",
          "noPartsRequired":true,
          "parts":[{"description":"Stale suggested part","qty":2}],
          "laborHours":1
        },
        {
          "item":"Brake fluid condition",
          "status":"recommend",
          "notes":"Fluid is discolored.",
          "parts":[{"description":"Brake fluid","qty":0}],
          "laborHours":0.5
        }
      ]
    }]
  }'::jsonb,
  true,
  3,
  true,
  false,
  false,
  'in_progress'
);

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  'a8290000-0000-4000-8000-000000000001',
  true
);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a8290000-0000-4000-8000-000000000001"}',
  true
);
set local role authenticated;

do $inspection_finding_runtime$
declare
  v_selection jsonb := '[
    {"sectionIndex":0,"itemIndex":0},
    {"sectionIndex":0,"itemIndex":1}
  ]'::jsonb;
  v_items jsonb := '[
    {
      "description":"Brake pedal travel - Brake pedal is soft.",
      "title":"Brake pedal travel",
      "source":"inspection",
      "sourceItemKey":"brake-pedal-travel-stable-key",
      "sourceSectionKey":"brakes",
      "sourceSectionTitle":"Brakes",
      "sourceFindingTitle":"Brake pedal travel",
      "findingIdentity":"stable:brake-pedal-travel",
      "laborHours":1,
      "parts":[{"description":"Stale suggested part","qty":2}],
      "status":"pending_parts",
      "stage":"advisor_pending"
    },
    {
      "description":"Brake fluid condition - Fluid is discolored.",
      "title":"Brake fluid condition",
      "source":"inspection",
      "sourceItemKey":"brake-fluid-condition-stable-key",
      "sourceSectionKey":"brakes",
      "sourceSectionTitle":"Brakes",
      "sourceFindingTitle":"Brake fluid condition",
      "findingIdentity":"stable:brake-fluid-condition",
      "laborHours":0.5,
      "parts":[{"description":"Brake fluid","qty":0}],
      "status":"pending_parts",
      "stage":"advisor_pending"
    }
  ]'::jsonb;
  v_result jsonb;
  v_retry jsonb;
  v_summary jsonb;
  v_count integer;
  v_denied boolean := false;
begin
  v_result := public.submit_inspection_findings_atomic(
    'a8291000-0000-4000-8000-000000000001',
    'a8293000-0000-4000-8000-000000000001',
    'a8295000-0000-4000-8000-000000000001',
    null,
    'a8290000-0000-4000-8000-000000000001',
    'inspection-finding-runtime:first',
    3,
    v_selection,
    v_items,
    '2026-08-28T21:45:00Z'
  );

  if (v_result ->> 'syncRevision')::bigint <> 4
     or jsonb_array_length(v_result -> 'ids') <> 2
     or coalesce((v_result #>> '{session,sections,0,items,0,estimateSubmitted}')::boolean, false) is not true
     or coalesce((v_result #>> '{session,sections,0,items,1,estimateSubmitted}')::boolean, false) is not true then
    raise exception 'Atomic finding submission did not return the durable submitted session.';
  end if;

  select summary into v_summary
  from public.inspections
  where id = 'a8295000-0000-4000-8000-000000000001';
  if (v_summary ->> 'syncRevision')::bigint <> 4
     or coalesce((v_summary #>> '{sections,0,items,0,noPartsRequired}')::boolean, false) is not true
     or (v_summary #> '{sections,0,items,1}') ? 'noPartsRequired' then
    raise exception 'Technician-authored no-parts state was not preserved exactly.';
  end if;

  select count(*) into v_count
  from public.work_order_quote_lines
  where work_order_id = 'a8293000-0000-4000-8000-000000000001';
  if v_count <> 2 then
    raise exception 'Atomic finding submission did not create exactly two quote lines.';
  end if;

  select count(*) into v_count
  from public.part_requests
  where work_order_id = 'a8293000-0000-4000-8000-000000000001';
  if v_count <> 0 then
    raise exception 'No-parts or zero-quantity technician findings created a parts request.';
  end if;

  v_retry := public.submit_inspection_findings_atomic(
    'a8291000-0000-4000-8000-000000000001',
    'a8293000-0000-4000-8000-000000000001',
    'a8295000-0000-4000-8000-000000000001',
    null,
    'a8290000-0000-4000-8000-000000000001',
    'inspection-finding-runtime:first',
    3,
    v_selection,
    v_items,
    '2026-08-28T21:45:01Z'
  );
  if coalesce((v_retry ->> 'idempotent')::boolean, false) is not true
     or v_retry -> 'ids' is distinct from v_result -> 'ids' then
    raise exception 'Exact finding submission retry was not idempotent.';
  end if;

  begin
    perform public.submit_inspection_findings_atomic(
      'a8291000-0000-4000-8000-000000000001',
      'a8293000-0000-4000-8000-000000000001',
      'a8295000-0000-4000-8000-000000000001',
      null,
      'a8290000-0000-4000-8000-000000000001',
      'inspection-finding-runtime:stale',
      3,
      v_selection,
      v_items,
      '2026-08-28T21:45:02Z'
    );
  exception when others then
    v_denied := sqlerrm like '%INSPECTION_REVISION_CONFLICT%';
  end;
  if not v_denied then
    raise exception 'Stale inspection revision was accepted for finding submission.';
  end if;

  select count(*) into v_count
  from public.work_order_quote_lines
  where work_order_id = 'a8293000-0000-4000-8000-000000000001';
  if v_count <> 2 then
    raise exception 'Rejected stale submission changed quote records.';
  end if;
end;
$inspection_finding_runtime$;

reset role;

rollback;
