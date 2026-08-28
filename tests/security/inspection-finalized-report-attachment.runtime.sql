\set ON_ERROR_STOP on

begin;

do $attachment_acl$
begin
  if has_function_privilege(
    'anon',
    'public.attach_signed_inspection_pdf_atomic(uuid,uuid,uuid,bigint,text,text,text)',
    'EXECUTE'
  )
  or not has_function_privilege(
    'authenticated',
    'public.attach_signed_inspection_pdf_atomic(uuid,uuid,uuid,bigint,text,text,text)',
    'EXECUTE'
  )
  or not has_function_privilege(
    'service_role',
    'public.attach_signed_inspection_pdf_atomic(uuid,uuid,uuid,bigint,text,text,text)',
    'EXECUTE'
  ) then
    raise exception 'Inspection report attachment RPC ACL changed unexpectedly.';
  end if;
end;
$attachment_acl$;

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    'a8280000-0000-4000-8000-000000000001',
    'inspection-report-signer@example.test',
    '{"full_name":"Inspection Report Signer"}'::jsonb
  ),
  (
    'a8280000-0000-4000-8000-000000000002',
    'inspection-report-other@example.test',
    '{"full_name":"Inspection Report Other"}'::jsonb
  ),
  (
    'a8280000-0000-4000-8000-000000000003',
    'inspection-report-outsider@example.test',
    '{"full_name":"Inspection Report Outsider"}'::jsonb
  )
on conflict (id) do nothing;

insert into public.profiles (id, user_id, role, full_name, email, shop_id)
values
  (
    'a8280000-0000-4000-8000-000000000001',
    'a8280000-0000-4000-8000-000000000001',
    'owner',
    'Inspection Report Signer',
    'inspection-report-signer@example.test',
    null
  ),
  (
    'a8280000-0000-4000-8000-000000000002',
    'a8280000-0000-4000-8000-000000000002',
    'advisor',
    'Inspection Report Other',
    'inspection-report-other@example.test',
    null
  ),
  (
    'a8280000-0000-4000-8000-000000000003',
    'a8280000-0000-4000-8000-000000000003',
    'owner',
    'Inspection Report Outsider',
    'inspection-report-outsider@example.test',
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
values
  (
    'a8281000-0000-4000-8000-000000000001',
    'a8280000-0000-4000-8000-000000000001',
    'Inspection Report Runtime',
    'Inspection Report Runtime',
    'complete_10',
    10,
    'internal_demo'
  ),
  (
    'a8281000-0000-4000-8000-000000000002',
    'a8280000-0000-4000-8000-000000000003',
    'Inspection Report Outsider Runtime',
    'Inspection Report Outsider Runtime',
    'complete_10',
    10,
    'internal_demo'
  )
on conflict (id) do update
set billing_entitlement_override = 'internal_demo';

update public.profiles
set shop_id = 'a8281000-0000-4000-8000-000000000001'
where id in (
  'a8280000-0000-4000-8000-000000000001',
  'a8280000-0000-4000-8000-000000000002'
);

update public.profiles
set shop_id = 'a8281000-0000-4000-8000-000000000002'
where id = 'a8280000-0000-4000-8000-000000000003';

insert into public.customers (id, shop_id, user_id, name, email)
values (
  'a8282000-0000-4000-8000-000000000001',
  'a8281000-0000-4000-8000-000000000001',
  'a8280000-0000-4000-8000-000000000001',
  'Inspection Report Customer',
  'inspection-report-customer@example.test'
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
  'a8283000-0000-4000-8000-000000000001',
  'a8281000-0000-4000-8000-000000000001',
  'a8282000-0000-4000-8000-000000000001',
  'INSPECTION-REPORT-ATTACH-1',
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
  'a8284000-0000-4000-8000-000000000001',
  'a8283000-0000-4000-8000-000000000001',
  'Brake inspection',
  'awaiting_approval',
  'pending',
  'pending',
  'inspection',
  'a8281000-0000-4000-8000-000000000001',
  'a8280000-0000-4000-8000-000000000001',
  'medium'
);

insert into public.inspections (
  id,
  work_order_id,
  work_order_line_id,
  shop_id,
  user_id,
  summary,
  is_canonical,
  sync_revision,
  signing_cycle,
  is_draft,
  completed,
  locked,
  status,
  finalized_at,
  finalized_by
)
values (
  'a8285000-0000-4000-8000-000000000001',
  'a8283000-0000-4000-8000-000000000001',
  'a8284000-0000-4000-8000-000000000001',
  'a8281000-0000-4000-8000-000000000001',
  'a8280000-0000-4000-8000-000000000001',
  '{"title":"Brake Inspection","sections":[],"syncRevision":7}'::jsonb,
  true,
  7,
  0,
  false,
  true,
  true,
  'completed',
  '2026-08-28T14:00:00Z',
  'a8280000-0000-4000-8000-000000000001'
);

insert into public.inspection_signatures (
  id,
  inspection_id,
  role,
  signed_by,
  signed_name,
  signing_cycle,
  signed_sync_revision,
  signed_summary,
  signed_at
)
values (
  'a8286000-0000-4000-8000-000000000001',
  'a8285000-0000-4000-8000-000000000001',
  'technician',
  'a8280000-0000-4000-8000-000000000001',
  'Inspection Report Signer',
  0,
  7,
  '{"title":"Brake Inspection","sections":[],"syncRevision":7}'::jsonb,
  '2026-08-28T14:00:00Z'
);

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  'a8280000-0000-4000-8000-000000000001',
  true
);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a8280000-0000-4000-8000-000000000001"}',
  true
);
set local role authenticated;

do $authorized_attachment$
declare
  v_path text :=
    'shops/a8281000-0000-4000-8000-000000000001/' ||
    'work_orders/a8283000-0000-4000-8000-000000000001/' ||
    'inspections/a8285000-0000-4000-8000-000000000001/' ||
    'line_a8284000-0000-4000-8000-000000000001_r7_' ||
    repeat('a', 64) || '.pdf';
  v_result jsonb;
  v_inspection record;
begin
  v_result := public.attach_signed_inspection_pdf_atomic(
    'a8285000-0000-4000-8000-000000000001',
    'a8284000-0000-4000-8000-000000000001',
    'a8280000-0000-4000-8000-000000000001',
    7,
    v_path,
    repeat('a', 64),
    '/api/inspections/a8285000-0000-4000-8000-000000000001/report/pdf'
  );

  if (v_result ->> 'reused')::boolean is distinct from false then
    raise exception 'Initial finalized report attachment was not recorded: %', v_result;
  end if;

  select pdf_storage_path, pdf_sha256, pdf_url, summary, status, locked,
         completed, is_draft, signing_cycle, sync_revision
    into v_inspection
  from public.inspections
  where id = 'a8285000-0000-4000-8000-000000000001';

  if v_inspection.pdf_storage_path is distinct from v_path
     or v_inspection.pdf_sha256 is distinct from repeat('a', 64)
     or v_inspection.pdf_url is distinct from
       '/api/inspections/a8285000-0000-4000-8000-000000000001/report/pdf'
     or v_inspection.summary is distinct from
       '{"title":"Brake Inspection","sections":[],"syncRevision":7}'::jsonb
     or v_inspection.status is distinct from 'completed'
     or v_inspection.locked is distinct from true
     or v_inspection.completed is distinct from true
     or v_inspection.is_draft is distinct from false
     or v_inspection.signing_cycle is distinct from 0::bigint
     or v_inspection.sync_revision is distinct from 7::bigint then
    raise exception 'Report attachment changed finalized inspection evidence: %',
      row_to_json(v_inspection);
  end if;

  if current_setting('profixiq.inspection_sign', true) = 'on' then
    raise exception 'Report attachment leaked its internal signing transition.';
  end if;

  v_result := public.attach_signed_inspection_pdf_atomic(
    'a8285000-0000-4000-8000-000000000001',
    'a8284000-0000-4000-8000-000000000001',
    'a8280000-0000-4000-8000-000000000001',
    7,
    v_path,
    repeat('a', 64),
    '/api/inspections/a8285000-0000-4000-8000-000000000001/report/pdf'
  );

  if (v_result ->> 'reused')::boolean is distinct from true then
    raise exception 'Exact report attachment retry was not idempotent: %', v_result;
  end if;

  if (
    select count(*)
    from public.inspection_signatures
    where inspection_id = 'a8285000-0000-4000-8000-000000000001'
  ) is distinct from 1::bigint then
    raise exception 'Report attachment retry duplicated signature evidence.';
  end if;
end;
$authorized_attachment$;

reset role;

do $finalized_guard_preserved$
declare
  v_denied boolean := false;
begin
  begin
    update public.inspections
    set summary = summary || '{"unexpected":"mutation"}'::jsonb
    where id = 'a8285000-0000-4000-8000-000000000001';
  exception
    when others then
      v_denied := sqlstate = 'P0001'
        and position('finalized inspection evidence is immutable' in lower(sqlerrm)) > 0;
  end;

  if not v_denied then
    raise exception 'Finalized inspection accepted a non-report mutation.';
  end if;
end;
$finalized_guard_preserved$;

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  'a8280000-0000-4000-8000-000000000002',
  true
);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a8280000-0000-4000-8000-000000000002"}',
  true
);
set local role authenticated;

do $same_shop_non_signer_denied$
declare
  v_denied boolean := false;
begin
  begin
    perform public.attach_signed_inspection_pdf_atomic(
      'a8285000-0000-4000-8000-000000000001',
      'a8284000-0000-4000-8000-000000000001',
      'a8280000-0000-4000-8000-000000000002',
      7,
      'shops/a8281000-0000-4000-8000-000000000001/' ||
        'work_orders/a8283000-0000-4000-8000-000000000001/' ||
        'inspections/a8285000-0000-4000-8000-000000000001/' ||
        'line_a8284000-0000-4000-8000-000000000001_r7_' ||
        repeat('a', 64) || '.pdf',
      repeat('a', 64),
      '/api/inspections/a8285000-0000-4000-8000-000000000001/report/pdf'
    );
  exception
    when others then
      v_denied := sqlstate = '42501'
        and position('does not own current inspection evidence' in lower(sqlerrm)) > 0;
  end;

  if not v_denied then
    raise exception 'Same-Shop non-signer attached finalized report evidence.';
  end if;
end;
$same_shop_non_signer_denied$;

reset role;

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  'a8280000-0000-4000-8000-000000000003',
  true
);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a8280000-0000-4000-8000-000000000003"}',
  true
);
set local role authenticated;

do $cross_shop_denied$
declare
  v_denied boolean := false;
begin
  begin
    perform public.attach_signed_inspection_pdf_atomic(
      'a8285000-0000-4000-8000-000000000001',
      'a8284000-0000-4000-8000-000000000001',
      'a8280000-0000-4000-8000-000000000003',
      7,
      'shops/a8281000-0000-4000-8000-000000000001/' ||
        'work_orders/a8283000-0000-4000-8000-000000000001/' ||
        'inspections/a8285000-0000-4000-8000-000000000001/' ||
        'line_a8284000-0000-4000-8000-000000000001_r7_' ||
        repeat('a', 64) || '.pdf',
      repeat('a', 64),
      '/api/inspections/a8285000-0000-4000-8000-000000000001/report/pdf'
    );
  exception
    when others then
      v_denied := sqlstate = '42501'
        and lower(sqlerrm) = 'forbidden';
  end;

  if not v_denied then
    raise exception 'Cross-Shop actor attached finalized report evidence.';
  end if;
end;
$cross_shop_denied$;

reset role;

rollback;
