\set ON_ERROR_STOP on

-- @regression-flow work-orders.inspection-write-authorization
begin;

insert into auth.users (id, email, raw_user_meta_data)
values
  ('76100000-0000-4000-8000-000000000001', 'inspection-auth-owner-a@example.com', '{"full_name":"Inspection Auth Owner A"}'::jsonb),
  ('76100000-0000-4000-8000-000000000002', 'inspection-auth-manager-a@example.com', '{"full_name":"Inspection Auth Manager A"}'::jsonb),
  ('76100000-0000-4000-8000-000000000003', 'inspection-auth-parts-a@example.com', '{"full_name":"Inspection Auth Parts A"}'::jsonb),
  ('76100000-0000-4000-8000-000000000004', 'inspection-auth-assigned-tech@example.com', '{"full_name":"Inspection Auth Assigned Tech"}'::jsonb),
  ('76100000-0000-4000-8000-000000000005', 'inspection-auth-unassigned-tech@example.com', '{"full_name":"Inspection Auth Unassigned Tech"}'::jsonb),
  ('76100000-0000-4000-8000-000000000006', 'inspection-auth-owner-b@example.com', '{"full_name":"Inspection Auth Owner B"}'::jsonb),
  ('76100000-0000-4000-8000-000000000007', 'inspection-auth-imported-manager@example.com', '{"full_name":"Inspection Auth Imported Manager"}'::jsonb),
  ('76100000-0000-4000-8000-000000000008', 'inspection-auth-service-a@example.com', '{"full_name":"Inspection Auth Service A"}'::jsonb),
  ('76100000-0000-4000-8000-000000000009', 'inspection-auth-foreman-a@example.com', '{"full_name":"Inspection Auth Foreman A"}'::jsonb),
  ('76100000-0000-4000-8000-000000000017', 'inspection-auth-imported-profile-anchor@example.com', '{"full_name":"Inspection Auth Imported Profile Anchor"}'::jsonb);

insert into public.profiles (id, user_id, role, full_name)
values
  ('76100000-0000-4000-8000-000000000001', '76100000-0000-4000-8000-000000000001', 'owner', 'Inspection Auth Owner A'),
  ('76100000-0000-4000-8000-000000000002', '76100000-0000-4000-8000-000000000002', 'manager', 'Inspection Auth Manager A'),
  ('76100000-0000-4000-8000-000000000003', '76100000-0000-4000-8000-000000000003', 'parts', 'Inspection Auth Parts A'),
  ('76100000-0000-4000-8000-000000000004', '76100000-0000-4000-8000-000000000004', 'mechanic', 'Inspection Auth Assigned Tech'),
  ('76100000-0000-4000-8000-000000000005', '76100000-0000-4000-8000-000000000005', 'mechanic', 'Inspection Auth Unassigned Tech'),
  ('76100000-0000-4000-8000-000000000006', '76100000-0000-4000-8000-000000000006', 'owner', 'Inspection Auth Owner B'),
  ('76100000-0000-4000-8000-000000000008', '76100000-0000-4000-8000-000000000008', 'service', 'Inspection Auth Service A'),
  ('76100000-0000-4000-8000-000000000009', '76100000-0000-4000-8000-000000000009', 'foreman', 'Inspection Auth Foreman A'),
  ('76100000-0000-4000-8000-000000000017', '76100000-0000-4000-8000-000000000007', 'manager', 'Inspection Auth Imported Manager');

-- The legacy BEFORE INSERT trigger initially mirrors profiles.id into user_id.
-- Keep a valid auth anchor for that insert, then restore the imported profile's
-- distinct authenticated subject before exercising either authorization path.
update public.profiles
set user_id = '76100000-0000-4000-8000-000000000007'
where id = '76100000-0000-4000-8000-000000000017';

insert into public.shops (id, owner_id, business_name, name)
values
  (
    '76300000-0000-4000-8000-000000000001',
    '76100000-0000-4000-8000-000000000001',
    'Inspection Authorization Shop A',
    'Inspection Authorization Shop A'
  ),
  (
    '76300000-0000-4000-8000-000000000002',
    '76100000-0000-4000-8000-000000000006',
    'Inspection Authorization Shop B',
    'Inspection Authorization Shop B'
  );

update public.profiles
set
  shop_id = case
    when id = '76100000-0000-4000-8000-000000000006'::uuid
      then '76300000-0000-4000-8000-000000000002'::uuid
    else '76300000-0000-4000-8000-000000000001'::uuid
  end
where id in (
  '76100000-0000-4000-8000-000000000001',
  '76100000-0000-4000-8000-000000000002',
  '76100000-0000-4000-8000-000000000003',
  '76100000-0000-4000-8000-000000000004',
  '76100000-0000-4000-8000-000000000005',
  '76100000-0000-4000-8000-000000000006',
  '76100000-0000-4000-8000-000000000008',
  '76100000-0000-4000-8000-000000000009',
  '76100000-0000-4000-8000-000000000017'
);

insert into public.work_orders (id, shop_id, custom_id, status)
values
  ('76400000-0000-4000-8000-000000000001', '76300000-0000-4000-8000-000000000001', 'INSP-AUTH-1001', 'in_progress'),
  ('76400000-0000-4000-8000-000000000002', '76300000-0000-4000-8000-000000000002', 'INSP-AUTH-2001', 'in_progress');

insert into public.work_order_lines (
  id,
  shop_id,
  work_order_id,
  line_type,
  status,
  description,
  assigned_tech_id
)
values
  (
    '76500000-0000-4000-8000-000000000001',
    '76300000-0000-4000-8000-000000000001',
    '76400000-0000-4000-8000-000000000001',
    'job',
    'in_progress',
    'Assigned inspection line',
    '76100000-0000-4000-8000-000000000004'
  ),
  (
    '76500000-0000-4000-8000-000000000002',
    '76300000-0000-4000-8000-000000000001',
    '76400000-0000-4000-8000-000000000001',
    'job',
    'in_progress',
    'Shop-wide inspection line',
    null
  ),
  (
    '76500000-0000-4000-8000-000000000003',
    '76300000-0000-4000-8000-000000000001',
    '76400000-0000-4000-8000-000000000001',
    'job',
    'in_progress',
    'Trusted server inspection line',
    null
  ),
  (
    '76500000-0000-4000-8000-000000000004',
    '76300000-0000-4000-8000-000000000002',
    '76400000-0000-4000-8000-000000000002',
    'job',
    'in_progress',
    'Cross-shop inspection line',
    null
  ),
  (
    '76500000-0000-4000-8000-000000000005',
    '76300000-0000-4000-8000-000000000001',
    '76400000-0000-4000-8000-000000000001',
    'job',
    'in_progress',
    'Committed signature replay line',
    '76100000-0000-4000-8000-000000000004'
  );

insert into public.work_order_line_technicians (
  work_order_line_id,
  technician_id,
  assigned_by
) values
  (
    '76500000-0000-4000-8000-000000000001',
    '76100000-0000-4000-8000-000000000004',
    '76100000-0000-4000-8000-000000000001'
  ),
  (
    '76500000-0000-4000-8000-000000000005',
    '76100000-0000-4000-8000-000000000004',
    '76100000-0000-4000-8000-000000000001'
  );

-- The production inspection workflow creates the canonical draft when a
-- template is attached, before autosave begins. Seed that established state
-- so this matrix tests the authorization wrapper rather than the unrelated
-- legacy no-row initialization path in the private autosave core.
insert into public.inspections (
  id,
  work_order_id,
  work_order_line_id,
  shop_id,
  user_id,
  summary,
  is_canonical,
  sync_revision,
  is_draft,
  completed,
  locked,
  status,
  updated_at
)
values
  (
    '76600000-0000-4000-8000-000000000001',
    '76400000-0000-4000-8000-000000000001',
    '76500000-0000-4000-8000-000000000001',
    '76300000-0000-4000-8000-000000000001',
    '76100000-0000-4000-8000-000000000004',
    '{"syncRevision":0,"lastUpdated":"2026-08-25T21:00:00Z","sections":[],"quote":[]}'::jsonb,
    true,
    0,
    true,
    false,
    false,
    'draft',
    '2026-08-25T21:00:00Z'
  ),
  (
    '76600000-0000-4000-8000-000000000002',
    '76400000-0000-4000-8000-000000000001',
    '76500000-0000-4000-8000-000000000002',
    '76300000-0000-4000-8000-000000000001',
    '76100000-0000-4000-8000-000000000002',
    '{"syncRevision":0,"lastUpdated":"2026-08-25T21:00:00Z","sections":[],"quote":[]}'::jsonb,
    true,
    0,
    true,
    false,
    false,
    'draft',
    '2026-08-25T21:00:00Z'
  ),
  (
    '76600000-0000-4000-8000-000000000003',
    '76400000-0000-4000-8000-000000000001',
    '76500000-0000-4000-8000-000000000003',
    '76300000-0000-4000-8000-000000000001',
    '76100000-0000-4000-8000-000000000001',
    '{"syncRevision":0,"lastUpdated":"2026-08-25T21:00:00Z","sections":[],"quote":[]}'::jsonb,
    true,
    0,
    true,
    false,
    false,
    'draft',
    '2026-08-25T21:00:00Z'
  ),
  (
    '76600000-0000-4000-8000-000000000004',
    '76400000-0000-4000-8000-000000000001',
    '76500000-0000-4000-8000-000000000005',
    '76300000-0000-4000-8000-000000000001',
    '76100000-0000-4000-8000-000000000004',
    '{"syncRevision":1,"lastUpdated":"2026-08-25T21:00:00Z","sections":[],"quote":[]}'::jsonb,
    true,
    1,
    true,
    false,
    false,
    'draft',
    '2026-08-25T21:00:00Z'
  ),
  (
    '76600000-0000-4000-8000-000000000005',
    null,
    null,
    '76300000-0000-4000-8000-000000000001',
    '76100000-0000-4000-8000-000000000004',
    '{"syncRevision":1,"lastUpdated":"2026-08-25T21:00:00Z","sections":[],"quote":[]}'::jsonb,
    true,
    1,
    true,
    false,
    false,
    'draft',
    '2026-08-25T21:00:00Z'
  );

insert into storage.buckets (id, name, public)
values ('job-photos', 'job-photos', true)
on conflict (id) do nothing;

-- Model an existing dashboard-created broad INSERT policy. The restrictive
-- inspection-photo boundary must still reject unauthorized ip-* paths without
-- changing the established behavior of unrelated legacy job-photo names.
drop policy if exists inspection_photo_fixture_legacy_broad_insert
  on storage.objects;
create policy inspection_photo_fixture_legacy_broad_insert
on storage.objects
for insert
to authenticated
with check (bucket_id = 'job-photos');

do $inspection_authorization_schema$
declare
  v_signature text;
begin
  if not exists (
    select 1
    from public.workspace_capabilities capability
    where capability.capability_key = 'work_order.inspection.run'
      and capability.access_level = 'manage'
      and not capability.is_protected
  ) then
    raise exception 'Inspection capability was not registered as grantable manage authority.';
  end if;

  if (
    select array_agg(preset.role_key order by preset.role_key)
    from public.workspace_role_capability_presets preset
    where preset.capability_key = 'work_order.inspection.run'
      and preset.effect = 'allow'
  ) is distinct from array[
    'admin', 'advisor', 'foreman', 'lead_hand',
    'manager', 'mechanic', 'owner', 'service'
  ]::text[] then
    raise exception 'Inspection capability presets drifted from established application roles.';
  end if;

  if has_function_privilege(
    'anon',
    'private.save_inspection_progress_v3_core(uuid,uuid,uuid,jsonb,text,timestamptz)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'private.save_inspection_progress_v3_core(uuid,uuid,uuid,jsonb,text,timestamptz)',
    'EXECUTE'
  ) or has_function_privilege(
    'service_role',
    'private.save_inspection_progress_v3_core(uuid,uuid,uuid,jsonb,text,timestamptz)',
    'EXECUTE'
  ) then
    raise exception 'A Data API role can execute the private inspection core.';
  end if;

  if has_function_privilege(
    'anon',
    'private.sign_inspection_core(uuid,text,text,bigint,text,text)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'private.sign_inspection_core(uuid,text,text,bigint,text,text)',
    'EXECUTE'
  ) or has_function_privilege(
    'service_role',
    'private.sign_inspection_core(uuid,text,text,bigint,text,text)',
    'EXECUTE'
  ) or has_function_privilege(
    'anon',
    'private.reopen_inspection_core(uuid,text)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'private.reopen_inspection_core(uuid,text)',
    'EXECUTE'
  ) or has_function_privilege(
    'service_role',
    'private.reopen_inspection_core(uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'A Data API role can execute a private inspection lifecycle core.';
  end if;

  foreach v_signature in array array[
    'private.import_inspection_quote_package_core(uuid,uuid,uuid,uuid,uuid,text,jsonb,timestamptz)',
    'private.attach_signed_inspection_pdf_core(uuid,uuid,uuid,bigint,text,text,text)',
    'private.finalize_inspection_pdf_core(uuid,uuid,uuid,bigint,text,text,text)',
    'private.shop_assistant_reopen_inspection_core(uuid,uuid,uuid,uuid,text)'
  ]
  loop
    if has_function_privilege('anon', v_signature, 'EXECUTE')
       or has_function_privilege('authenticated', v_signature, 'EXECUTE')
       or has_function_privilege('service_role', v_signature, 'EXECUTE') then
      raise exception 'A Data API role can execute a private inspection follow-up core: %', v_signature;
    end if;
  end loop;

  foreach v_signature in array array[
    'private.save_inspection_progress_v3_core(uuid,uuid,uuid,jsonb,text,timestamptz)',
    'private.sign_inspection_core(uuid,text,text,bigint,text,text)',
    'private.reopen_inspection_core(uuid,text)',
    'private.import_inspection_quote_package_core(uuid,uuid,uuid,uuid,uuid,text,jsonb,timestamptz)',
    'private.attach_signed_inspection_pdf_core(uuid,uuid,uuid,bigint,text,text,text)',
    'private.finalize_inspection_pdf_core(uuid,uuid,uuid,bigint,text,text,text)',
    'private.shop_assistant_reopen_inspection_core(uuid,uuid,uuid,uuid,text)'
  ]
  loop
    if not exists (
      select 1
      from pg_catalog.pg_proc function_definition
      cross join lateral pg_catalog.unnest(
        coalesce(function_definition.proconfig, array[]::text[])
      ) setting(value)
      where function_definition.oid = v_signature::regprocedure
        and setting.value in ('search_path=""', 'search_path=')
    ) then
      raise exception 'Private inspection core has a non-empty search path: %', v_signature;
    end if;
  end loop;

  if has_function_privilege(
    'anon',
    'public.sign_inspection(uuid,text,text,bigint,text,text)',
    'EXECUTE'
  ) or not has_function_privilege(
    'authenticated',
    'public.sign_inspection(uuid,text,text,bigint,text,text)',
    'EXECUTE'
  ) or has_function_privilege(
    'anon',
    'public.reopen_inspection(uuid,text)',
    'EXECUTE'
  ) or not has_function_privilege(
    'authenticated',
    'public.reopen_inspection(uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'Inspection lifecycle writer has unsafe execution ACL.';
  end if;

  if has_function_privilege(
    'anon',
    'public.import_inspection_quote_package_atomic(uuid,uuid,uuid,uuid,uuid,text,jsonb,timestamptz)',
    'EXECUTE'
  ) or not has_function_privilege(
    'authenticated',
    'public.import_inspection_quote_package_atomic(uuid,uuid,uuid,uuid,uuid,text,jsonb,timestamptz)',
    'EXECUTE'
  ) or not has_function_privilege(
    'service_role',
    'public.import_inspection_quote_package_atomic(uuid,uuid,uuid,uuid,uuid,text,jsonb,timestamptz)',
    'EXECUTE'
  ) or has_function_privilege(
    'anon',
    'public.attach_signed_inspection_pdf_atomic(uuid,uuid,uuid,bigint,text,text,text)',
    'EXECUTE'
  ) or not has_function_privilege(
    'authenticated',
    'public.attach_signed_inspection_pdf_atomic(uuid,uuid,uuid,bigint,text,text,text)',
    'EXECUTE'
  ) or not has_function_privilege(
    'service_role',
    'public.attach_signed_inspection_pdf_atomic(uuid,uuid,uuid,bigint,text,text,text)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.finalize_inspection_pdf_atomic(uuid,uuid,uuid,bigint,text,text,text)',
    'EXECUTE'
  ) or not has_function_privilege(
    'service_role',
    'public.finalize_inspection_pdf_atomic(uuid,uuid,uuid,bigint,text,text,text)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.shop_assistant_reopen_inspection_atomic(uuid,uuid,uuid,uuid,text)',
    'EXECUTE'
  ) or not has_function_privilege(
    'service_role',
    'public.shop_assistant_reopen_inspection_atomic(uuid,uuid,uuid,uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'Inspection follow-up writer has unsafe execution ACL.';
  end if;

  foreach v_signature in array array[
    'public.save_inspection_progress_atomic(uuid,uuid,uuid,jsonb,text,timestamptz)',
    'public.save_inspection_progress_v2_atomic(uuid,uuid,uuid,jsonb,text,timestamptz)',
    'public.save_inspection_progress_v3_atomic(uuid,uuid,uuid,jsonb,text,timestamptz)'
  ]
  loop
    if has_function_privilege('anon', v_signature, 'EXECUTE')
       or not has_function_privilege('authenticated', v_signature, 'EXECUTE')
       or not has_function_privilege('service_role', v_signature, 'EXECUTE') then
      raise exception 'Inspection writer has unsafe execution ACL: %', v_signature;
    end if;
  end loop;

  if has_function_privilege(
    'anon',
    'private.authorize_work_order_inspection_photo_write(uuid,uuid,uuid,uuid)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'private.authorize_work_order_inspection_photo_write(uuid,uuid,uuid,uuid)',
    'EXECUTE'
  ) or has_function_privilege(
    'service_role',
    'private.authorize_work_order_inspection_photo_write(uuid,uuid,uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'A Data API role can execute the private inspection photo authorizer.';
  end if;

  if has_function_privilege(
    'anon',
    'private.work_order_inspection_photo_storage_insert_access(text,text)',
    'EXECUTE'
  ) or not has_function_privilege(
    'authenticated',
    'private.work_order_inspection_photo_storage_insert_access(text,text)',
    'EXECUTE'
  ) or has_function_privilege(
    'service_role',
    'private.work_order_inspection_photo_storage_insert_access(text,text)',
    'EXECUTE'
  ) then
    raise exception 'Inspection photo Storage helper has unsafe execution ACL.';
  end if;

  if has_function_privilege(
    'anon',
    'public.save_work_order_inspection_photo_evidence_atomic(uuid,uuid,uuid,uuid,text,text,text,text)',
    'EXECUTE'
  ) or not has_function_privilege(
    'authenticated',
    'public.save_work_order_inspection_photo_evidence_atomic(uuid,uuid,uuid,uuid,text,text,text,text)',
    'EXECUTE'
  ) or has_function_privilege(
    'service_role',
    'public.save_work_order_inspection_photo_evidence_atomic(uuid,uuid,uuid,uuid,text,text,text,text)',
    'EXECUTE'
  ) then
    raise exception 'Inspection photo receipt writer has unsafe execution ACL.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc helper
    join pg_catalog.pg_namespace function_schema
      on function_schema.oid = helper.pronamespace
    where function_schema.nspname = 'private'
      and helper.proname in (
        'authorize_work_order_inspection_photo_write',
        'work_order_inspection_photo_storage_insert_access'
      )
      and helper.provolatile = 'v'
      and helper.prosecdef
      and helper.proconfig @> array['search_path=""']::text[]
    group by function_schema.nspname
    having count(*) = 2
  ) then
    raise exception 'Inspection photo helpers are not lock-aware controlled definers.';
  end if;

  if (
    select count(*)
    from pg_catalog.pg_policies policy
    where policy.schemaname = 'storage'
      and policy.tablename = 'objects'
      and (
        (
          policy.policyname = 'job_photos_inspection_photo_insert'
          and lower(policy.permissive) = 'permissive'
        )
        or (
          policy.policyname = 'job_photos_inspection_photo_insert_boundary'
          and lower(policy.permissive) = 'restrictive'
        )
      )
  ) <> 2 then
    raise exception 'Inspection photo Storage policies lost their permissive/restrictive contract.';
  end if;
end
$inspection_authorization_schema$;

-- Parts has neither a preset nor an override. Every installed public writer
-- must deny it before creating an inspection or idempotency receipt.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"76100000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);

do $inspection_parts_denied$
declare
  v_writer text;
  v_denied integer := 0;
  v_actor_spoof_denied boolean := false;
  v_photo_storage_denied boolean := false;
begin
  foreach v_writer in array array[
    'save_inspection_progress_atomic',
    'save_inspection_progress_v2_atomic',
    'save_inspection_progress_v3_atomic'
  ]
  loop
    begin
      execute format(
        'select public.%I($1,$2,$3,$4,$5,$6)',
        v_writer
      ) using
        '76300000-0000-4000-8000-000000000001'::uuid,
        '76500000-0000-4000-8000-000000000002'::uuid,
        '76100000-0000-4000-8000-000000000003'::uuid,
        '{"syncRevision":0,"lastUpdated":"2026-08-25T21:30:00Z","sections":[],"quote":[]}'::jsonb,
        'inspection-auth:parts-denied:' || v_writer,
        '2026-08-25T21:30:00Z'::timestamptz;
    exception when insufficient_privilege then
      v_denied := v_denied + 1;
    end;
  end loop;

  if v_denied <> 3 then
    raise exception 'Parts escaped one or more public inspection writer gates: %/3 denied.', v_denied;
  end if;

  begin
    perform public.save_inspection_progress_v3_atomic(
      '76300000-0000-4000-8000-000000000001',
      '76500000-0000-4000-8000-000000000002',
      '76100000-0000-4000-8000-000000000001',
      '{"syncRevision":0,"lastUpdated":"2026-08-25T21:30:30Z","sections":[],"quote":[]}'::jsonb,
      'inspection-auth:parts-owner-spoof',
      '2026-08-25T21:30:30Z'
    );
  exception when insufficient_privilege then
    v_actor_spoof_denied := true;
  end;

  if not v_actor_spoof_denied then
    raise exception 'Parts actor spoofed an authorized owner identity.';
  end if;

  begin
    insert into storage.objects (
      id, bucket_id, name, owner, owner_id, metadata
    ) values (
      '76800000-0000-4000-8000-000000000001',
      'job-photos',
      'wo/76400000-0000-4000-8000-000000000001/lines/76500000-0000-4000-8000-000000000002/ip-' ||
        repeat('c', 40) || '_' || repeat('d', 32) || '.jpg',
      '76100000-0000-4000-8000-000000000003',
      '76100000-0000-4000-8000-000000000003',
      '{"mimetype":"image/jpeg","size":13}'::jsonb
    );
  exception when insufficient_privilege then
    v_photo_storage_denied := true;
  end;
  if not v_photo_storage_denied then
    raise exception 'Parts bypassed the restrictive inspection photo Storage policy.';
  end if;

  -- The #1557 restriction is deliberately limited to route-generated ip-*
  -- names. A pre-existing permissive policy keeps its legacy non-inspection
  -- path behavior until the later Work Order media isolation migration.
  insert into storage.objects (
    id, bucket_id, name, owner, owner_id, metadata
  ) values (
    '76800000-0000-4000-8000-000000000002',
    'job-photos',
    'wo/76400000-0000-4000-8000-000000000001/lines/76500000-0000-4000-8000-000000000002/legacy-inspection-auth-photo.jpg',
    '76100000-0000-4000-8000-000000000003',
    '76100000-0000-4000-8000-000000000003',
    '{"mimetype":"image/jpeg","size":13}'::jsonb
  );
end
$inspection_parts_denied$;

reset role;

do $inspection_photo_storage_scope_results$
begin
  if exists (
    select 1
    from storage.objects object
    where object.id = '76800000-0000-4000-8000-000000000001'
  ) or exists (
    select 1
    from public.work_order_media media
    where media.storage_path =
      'wo/76400000-0000-4000-8000-000000000001/lines/76500000-0000-4000-8000-000000000002/ip-' ||
      repeat('c', 40) || '_' || repeat('d', 32) || '.jpg'
  ) then
    raise exception 'Denied inspection photo left a durable object or media receipt.';
  end if;
  if not exists (
    select 1
    from storage.objects object
    where object.id = '76800000-0000-4000-8000-000000000002'
  ) then
    raise exception 'Inspection photo boundary changed a legacy non-ip Storage path.';
  end if;
end
$inspection_photo_storage_scope_results$;

-- A mechanic has the inspection capability but remains line-assignment scoped.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"76100000-0000-4000-8000-000000000005","role":"authenticated"}',
  true
);

do $inspection_unassigned_mechanic_denied$
declare
  v_denied boolean := false;
  v_photo_denied boolean := false;
begin
  begin
    perform public.save_inspection_progress_v3_atomic(
      '76300000-0000-4000-8000-000000000001',
      '76500000-0000-4000-8000-000000000001',
      '76100000-0000-4000-8000-000000000005',
      '{"syncRevision":0,"lastUpdated":"2026-08-25T21:31:00Z","sections":[],"quote":[]}'::jsonb,
      'inspection-auth:unassigned-mechanic',
      '2026-08-25T21:31:00Z'
    );
  exception when insufficient_privilege then
    v_denied := true;
  end;

  if not v_denied then
    raise exception 'Unassigned mechanic saved another technician inspection.';
  end if;

  begin
    insert into storage.objects (
      id, bucket_id, name, owner, owner_id, metadata
    ) values (
      '76800000-0000-4000-8000-000000000003',
      'job-photos',
      'wo/76400000-0000-4000-8000-000000000001/lines/76500000-0000-4000-8000-000000000001/ip-' ||
        repeat('e', 40) || '_' || repeat('f', 32) || '.jpg',
      '76100000-0000-4000-8000-000000000005',
      '76100000-0000-4000-8000-000000000005',
      '{"mimetype":"image/jpeg","size":13}'::jsonb
    );
  exception when insufficient_privilege then
    v_photo_denied := true;
  end;
  if not v_photo_denied then
    raise exception 'Unassigned mechanic stored another technician inspection photo.';
  end if;
end
$inspection_unassigned_mechanic_denied$;

reset role;

do $inspection_unassigned_photo_results$
begin
  if exists (
    select 1
    from storage.objects object
    where object.id = '76800000-0000-4000-8000-000000000003'
  ) or exists (
    select 1
    from public.work_order_media media
    where media.storage_path =
      'wo/76400000-0000-4000-8000-000000000001/lines/76500000-0000-4000-8000-000000000001/ip-' ||
      repeat('e', 40) || '_' || repeat('f', 32) || '.jpg'
  ) then
    raise exception 'Unassigned photo denial left a durable evidence receipt.';
  end if;
end
$inspection_unassigned_photo_results$;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"76100000-0000-4000-8000-000000000004","role":"authenticated"}',
  true
);

do $inspection_assigned_mechanic_allowed$
declare
  v_result jsonb;
  v_photo_result jsonb;
  v_photo_retry jsonb;
  v_photo_path text :=
    'wo/76400000-0000-4000-8000-000000000001/lines/76500000-0000-4000-8000-000000000001/ip-' ||
    repeat('a', 40) || '_' || repeat('b', 32) || '.jpg';
begin
  v_result := public.save_inspection_progress_v3_atomic(
    '76300000-0000-4000-8000-000000000001',
    '76500000-0000-4000-8000-000000000001',
    '76100000-0000-4000-8000-000000000004',
    '{"syncRevision":0,"lastUpdated":"2026-08-25T21:32:00Z","sections":[],"quote":[]}'::jsonb,
    'inspection-auth:assigned-mechanic',
    '2026-08-25T21:32:00Z'
  );

  if not coalesce((v_result ->> 'ok')::boolean, false)
     or coalesce((v_result ->> 'sync_revision')::bigint, -1) <> 1 then
    raise exception 'Assigned mechanic inspection save did not persist: %', v_result;
  end if;

  insert into storage.objects (
    id, bucket_id, name, owner, owner_id, metadata
  ) values (
    '76800000-0000-4000-8000-000000000004',
    'job-photos',
    v_photo_path,
    '76100000-0000-4000-8000-000000000004',
    '76100000-0000-4000-8000-000000000004',
    '{"mimetype":"image/jpeg","size":13}'::jsonb
  );

  v_photo_result := public.save_work_order_inspection_photo_evidence_atomic(
    '76600000-0000-4000-8000-000000000001',
    '76300000-0000-4000-8000-000000000001',
    '76400000-0000-4000-8000-000000000001',
    '76500000-0000-4000-8000-000000000001',
    'job-photos',
    v_photo_path,
    'Assigned inspection item',
    'Assigned inspection evidence'
  );
  if not coalesce((v_photo_result ->> 'inserted')::boolean, false)
     or v_photo_result #>> '{photo,image_url}' is distinct from
       '/storage/v1/object/public/job-photos/' || v_photo_path then
    raise exception 'Assigned mechanic photo receipt did not persist: %', v_photo_result;
  end if;

  v_photo_retry := public.save_work_order_inspection_photo_evidence_atomic(
    '76600000-0000-4000-8000-000000000001',
    '76300000-0000-4000-8000-000000000001',
    '76400000-0000-4000-8000-000000000001',
    '76500000-0000-4000-8000-000000000001',
    'job-photos',
    v_photo_path,
    'Ignored retry item',
    'Ignored retry note'
  );
  if coalesce((v_photo_retry ->> 'inserted')::boolean, true)
     or v_photo_retry #>> '{photo,image_url}' is distinct from
       '/storage/v1/object/public/job-photos/' || v_photo_path then
    raise exception 'Assigned mechanic photo retry was not idempotent: %', v_photo_retry;
  end if;
end
$inspection_assigned_mechanic_allowed$;

-- Standalone inspections predate the Work Order line workflow. A mechanic
-- with the effective capability remains authorized because there is no line
-- assignment to enforce.
select public.sign_inspection(
  '76600000-0000-4000-8000-000000000005',
  'customer',
  'Standalone Customer',
  1,
  null,
  null
);

reset role;

do $inspection_assigned_photo_results$
declare
  v_photo_path text :=
    'wo/76400000-0000-4000-8000-000000000001/lines/76500000-0000-4000-8000-000000000001/ip-' ||
    repeat('a', 40) || '_' || repeat('b', 32) || '.jpg';
begin
  if (
    select count(*)
    from public.work_order_media media
    where media.shop_id = '76300000-0000-4000-8000-000000000001'
      and media.storage_bucket = 'job-photos'
      and media.storage_path = v_photo_path
      and media.user_id = '76100000-0000-4000-8000-000000000004'
  ) <> 1 or (
    select count(*)
    from public.inspection_photos photo
    where photo.inspection_id = '76600000-0000-4000-8000-000000000001'
      and photo.user_id = '76100000-0000-4000-8000-000000000004'
      and photo.image_url =
        '/storage/v1/object/public/job-photos/' || v_photo_path
  ) <> 1 then
    raise exception 'Authorized inspection photo lost its atomic evidence receipts.';
  end if;
end
$inspection_assigned_photo_results$;

do $inspection_standalone_mechanic_results$
begin
  if not exists (
    select 1
    from public.inspection_signatures signature
    where signature.inspection_id = '76600000-0000-4000-8000-000000000005'
      and signature.role = 'customer'
      and signature.signed_name = 'Standalone Customer'
      and signature.signed_by = '76100000-0000-4000-8000-000000000004'
  ) then
    raise exception 'Capability-authorized mechanic could not sign a standalone inspection.';
  end if;
end
$inspection_standalone_mechanic_results$;

-- A committed receipt belongs to the original actor and exact snapshot. A
-- response-loss retry remains recoverable after reassignment, while a new
-- post-reassignment operation is denied.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claim.sub', '', true);

update public.work_order_lines
set assigned_tech_id = '76100000-0000-4000-8000-000000000005',
    assigned_to = '76100000-0000-4000-8000-000000000005'
where id = '76500000-0000-4000-8000-000000000001';

delete from public.work_order_line_technicians
where work_order_line_id = '76500000-0000-4000-8000-000000000001';
insert into public.work_order_line_technicians (
  work_order_line_id,
  technician_id,
  assigned_by
) values (
  '76500000-0000-4000-8000-000000000001',
  '76100000-0000-4000-8000-000000000005',
  '76100000-0000-4000-8000-000000000001'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"76100000-0000-4000-8000-000000000004","role":"authenticated"}',
  true
);

do $inspection_reassigned_receipt$
declare
  v_retry jsonb;
  v_fresh_denied boolean := false;
begin
  v_retry := public.save_inspection_progress_v3_atomic(
    '76300000-0000-4000-8000-000000000001',
    '76500000-0000-4000-8000-000000000001',
    '76100000-0000-4000-8000-000000000004',
    '{"syncRevision":0,"lastUpdated":"2026-08-25T21:32:00Z","sections":[],"quote":[]}'::jsonb,
    'inspection-auth:assigned-mechanic',
    '2026-08-25T21:32:00Z'
  );
  if not coalesce((v_retry ->> 'idempotent')::boolean, false) then
    raise exception 'Committed inspection receipt was lost after reassignment: %', v_retry;
  end if;

  begin
    perform public.save_inspection_progress_v3_atomic(
      '76300000-0000-4000-8000-000000000001',
      '76500000-0000-4000-8000-000000000001',
      '76100000-0000-4000-8000-000000000004',
      '{"syncRevision":1,"lastUpdated":"2026-08-25T21:32:30Z","sections":[],"quote":[]}'::jsonb,
      'inspection-auth:reassigned-fresh-denied',
      '2026-08-25T21:32:30Z'
    );
  exception when insufficient_privilege then
    v_fresh_denied := true;
  end;
  if not v_fresh_denied then
    raise exception 'Reassigned mechanic created fresh inspection progress.';
  end if;
end
$inspection_reassigned_receipt$;

reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claim.sub', '', true);

update public.work_order_lines
set assigned_tech_id = '76100000-0000-4000-8000-000000000004',
    assigned_to = null
where id = '76500000-0000-4000-8000-000000000001';
delete from public.work_order_line_technicians
where work_order_line_id = '76500000-0000-4000-8000-000000000001';
insert into public.work_order_line_technicians (
  work_order_line_id,
  technician_id,
  assigned_by
) values (
  '76500000-0000-4000-8000-000000000001',
  '76100000-0000-4000-8000-000000000004',
  '76100000-0000-4000-8000-000000000001'
);

-- Signature role describes staff-captured evidence, not a caller privilege.
-- An assigned mechanic can capture customer acknowledgement; after dispatch
-- reassigns the line, only the exact committed actor/role/cycle/revision/name
-- retry remains recoverable.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"76100000-0000-4000-8000-000000000004","role":"authenticated"}',
  true
);

select public.sign_inspection(
  '76600000-0000-4000-8000-000000000004',
  'customer',
  'Captured Customer',
  1,
  null,
  null
);

reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claim.sub', '', true);

update public.work_order_lines
set assigned_tech_id = '76100000-0000-4000-8000-000000000005',
    assigned_to = '76100000-0000-4000-8000-000000000005'
where id = '76500000-0000-4000-8000-000000000005';
delete from public.work_order_line_technicians
where work_order_line_id = '76500000-0000-4000-8000-000000000005';
insert into public.work_order_line_technicians (
  work_order_line_id,
  technician_id,
  assigned_by
) values (
  '76500000-0000-4000-8000-000000000005',
  '76100000-0000-4000-8000-000000000005',
  '76100000-0000-4000-8000-000000000001'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"76100000-0000-4000-8000-000000000004","role":"authenticated"}',
  true
);

do $inspection_committed_signature_replay$
declare
  v_name_denied boolean := false;
  v_role_denied boolean := false;
  v_revision_denied boolean := false;
begin
  perform public.sign_inspection(
    '76600000-0000-4000-8000-000000000004',
    'customer',
    'Captured Customer',
    1,
    null,
    null
  );

  begin
    perform public.sign_inspection(
      '76600000-0000-4000-8000-000000000004',
      'customer',
      'Different Customer',
      1,
      null,
      null
    );
  exception when insufficient_privilege then
    v_name_denied := true;
  end;

  begin
    perform public.sign_inspection(
      '76600000-0000-4000-8000-000000000004',
      'advisor',
      'Captured Customer',
      1,
      null,
      null
    );
  exception when insufficient_privilege then
    v_role_denied := true;
  end;

  begin
    perform public.sign_inspection(
      '76600000-0000-4000-8000-000000000004',
      'customer',
      'Captured Customer',
      2,
      null,
      null
    );
  exception when insufficient_privilege then
    v_revision_denied := true;
  end;

  if not v_name_denied or not v_role_denied or not v_revision_denied then
    raise exception 'Reassigned mechanic escaped exact committed signature replay binding.';
  end if;
end
$inspection_committed_signature_replay$;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"76100000-0000-4000-8000-000000000005","role":"authenticated"}',
  true
);

do $inspection_committed_signature_wrong_actor$
declare
  v_denied boolean := false;
begin
  begin
    perform public.sign_inspection(
      '76600000-0000-4000-8000-000000000004',
      'customer',
      'Captured Customer',
      1,
      null,
      null
    );
  exception when others then
    v_denied := sqlerrm like '%already signed for that role%';
  end;
  if not v_denied then
    raise exception 'A different assigned actor replayed committed customer evidence.';
  end if;
end
$inspection_committed_signature_wrong_actor$;

reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claim.sub', '', true);

update public.work_order_lines
set assigned_tech_id = '76100000-0000-4000-8000-000000000004',
    assigned_to = null
where id = '76500000-0000-4000-8000-000000000005';
delete from public.work_order_line_technicians
where work_order_line_id = '76500000-0000-4000-8000-000000000005';
insert into public.work_order_line_technicians (
  work_order_line_id,
  technician_id,
  assigned_by
) values (
  '76500000-0000-4000-8000-000000000005',
  '76100000-0000-4000-8000-000000000004',
  '76100000-0000-4000-8000-000000000001'
);

do $inspection_committed_signature_results$
begin
  if (
    select count(*)
    from public.inspection_signatures signature
    where signature.inspection_id = '76600000-0000-4000-8000-000000000004'
      and signature.role = 'customer'
      and signature.signed_by = '76100000-0000-4000-8000-000000000004'
      and signature.signed_name = 'Captured Customer'
      and signature.signing_cycle = 0
      and signature.signed_sync_revision = 1
  ) <> 1 or exists (
    select 1
    from public.inspection_signatures signature
    where signature.inspection_id = '76600000-0000-4000-8000-000000000004'
      and signature.role <> 'customer'
  ) then
    raise exception 'Committed signature replay changed immutable evidence.';
  end if;
end
$inspection_committed_signature_results$;

-- Shop-wide managers do not need line assignment.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"76100000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

select public.save_inspection_progress_v3_atomic(
  '76300000-0000-4000-8000-000000000001',
  '76500000-0000-4000-8000-000000000002',
  '76100000-0000-4000-8000-000000000002',
  '{"syncRevision":0,"lastUpdated":"2026-08-25T21:33:00Z","sections":[],"quote":[]}'::jsonb,
  'inspection-auth:manager-receipt',
  '2026-08-25T21:33:00Z'
);

select public.sign_inspection(
  '76600000-0000-4000-8000-000000000002',
  'advisor',
  'Client-supplied name is not authoritative',
  1,
  null,
  null
);

do $inspection_manager_reopen_allowed$
declare
  v_result jsonb;
begin
  v_result := public.reopen_inspection(
    '76600000-0000-4000-8000-000000000002',
    'Correct a verified inspection finding'
  );
  if coalesce((v_result ->> 'already_open')::boolean, true)
     or coalesce((v_result ->> 'signing_cycle')::bigint, -1) <> 1 then
    raise exception 'Authorized manager could not reopen an inspection: %', v_result;
  end if;
end
$inspection_manager_reopen_allowed$;

reset role;

-- The same effective capability protects the other authenticated canonical
-- lifecycle commands; Parts cannot sign or reopen by calling RPCs directly.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"76100000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);

do $inspection_lifecycle_parts_denied$
declare
  v_sign_denied boolean := false;
  v_customer_sign_denied boolean := false;
  v_reopen_denied boolean := false;
begin
  begin
    perform public.sign_inspection(
      '76600000-0000-4000-8000-000000000002',
      'advisor',
      'Spoofed Advisor',
      1,
      null,
      null
    );
  exception when insufficient_privilege then
    v_sign_denied := true;
  end;

  begin
    perform public.sign_inspection(
      '76600000-0000-4000-8000-000000000002',
      'customer',
      'Spoofed Customer',
      1,
      null,
      null
    );
  exception when insufficient_privilege then
    v_customer_sign_denied := true;
  end;

  begin
    perform public.reopen_inspection(
      '76600000-0000-4000-8000-000000000002',
      'Unauthorized correction attempt'
    );
  exception when insufficient_privilege then
    v_reopen_denied := true;
  end;

  if not v_sign_denied
     or not v_customer_sign_denied
     or not v_reopen_denied then
    raise exception 'Parts bypassed a canonical inspection lifecycle command.';
  end if;
end
$inspection_lifecycle_parts_denied$;

reset role;

-- Authorization runs before receipt lookup: an unauthorized Parts actor
-- cannot replay a manager operation key to recover its result.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"76100000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);

do $inspection_receipt_replay_denied$
declare
  v_denied boolean := false;
begin
  begin
    perform public.save_inspection_progress_v3_atomic(
      '76300000-0000-4000-8000-000000000001',
      '76500000-0000-4000-8000-000000000002',
      '76100000-0000-4000-8000-000000000003',
      '{"syncRevision":0,"lastUpdated":"2026-08-25T21:33:00Z","sections":[],"quote":[]}'::jsonb,
      'inspection-auth:manager-receipt',
      '2026-08-25T21:33:00Z'
    );
  exception when insufficient_privilege then
    v_denied := true;
  end;

  if not v_denied then
    raise exception 'Unauthorized actor replayed an authorized inspection receipt.';
  end if;
end
$inspection_receipt_replay_denied$;

reset role;

-- A capable actor cannot retarget the SECURITY DEFINER writer to another
-- tenant by supplying that shop and line directly.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"76100000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

do $inspection_cross_shop_denied$
declare
  v_denied boolean := false;
begin
  begin
    perform public.save_inspection_progress_v3_atomic(
      '76300000-0000-4000-8000-000000000002',
      '76500000-0000-4000-8000-000000000004',
      '76100000-0000-4000-8000-000000000001',
      '{"syncRevision":0,"lastUpdated":"2026-08-25T21:33:30Z","sections":[],"quote":[]}'::jsonb,
      'inspection-auth:cross-shop-denied',
      '2026-08-25T21:33:30Z'
    );
  exception when insufficient_privilege then
    v_denied := true;
  end;

  if not v_denied then
    raise exception 'Shop A owner wrote inspection progress in Shop B.';
  end if;
end
$inspection_cross_shop_denied$;

reset role;

-- A service-role route still acts for a supplied shop actor; it does not turn
-- an unauthorized actor into a trusted inspection writer.
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

do $inspection_service_actor_binding$
declare
  v_parts_denied boolean := false;
  v_owner_result jsonb;
begin
  begin
    perform public.save_inspection_progress_v3_atomic(
      '76300000-0000-4000-8000-000000000001',
      '76500000-0000-4000-8000-000000000003',
      '76100000-0000-4000-8000-000000000003',
      '{"syncRevision":0,"lastUpdated":"2026-08-25T21:34:00Z","sections":[],"quote":[]}'::jsonb,
      'inspection-auth:service-parts-denied',
      '2026-08-25T21:34:00Z'
    );
  exception when insufficient_privilege then
    v_parts_denied := true;
  end;

  if not v_parts_denied then
    raise exception 'Service role bypassed the supplied Parts actor capability.';
  end if;

  v_owner_result := public.save_inspection_progress_v3_atomic(
    '76300000-0000-4000-8000-000000000001',
    '76500000-0000-4000-8000-000000000003',
    '76100000-0000-4000-8000-000000000001',
    '{"syncRevision":0,"lastUpdated":"2026-08-25T21:35:00Z","sections":[],"quote":[]}'::jsonb,
    'inspection-auth:service-owner',
    '2026-08-25T21:35:00Z'
  );

  if not coalesce((v_owner_result ->> 'ok')::boolean, false) then
    raise exception 'Service route could not save for an authorized owner actor.';
  end if;
end
$inspection_service_actor_binding$;

reset role;

insert into public.quote_lifecycle_operation_keys (
  shop_id,
  operation_name,
  operation_key,
  actor_user_id,
  work_order_id,
  result
) values (
  '76300000-0000-4000-8000-000000000002',
  'inspection_quote_import',
  'inspection-auth:shop-b-hidden',
  '76100000-0000-4000-8000-000000000006',
  '76400000-0000-4000-8000-000000000002',
  '{"ok":true,"sourceWorkOrderLineId":"76500000-0000-4000-8000-000000000004"}'::jsonb
);

-- The compatibility import accepts activated/imported profiles through their
-- linked auth subject, authorizes the exact source line, and binds a receipt to
-- both actor and work order before the private quote/parts engine can replay it.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"76100000-0000-4000-8000-000000000007","role":"authenticated"}',
  true
);

do $inspection_import_linked_actor$
declare
  v_result jsonb;
  v_items jsonb := '[{"id":"76700000-0000-4000-8000-000000000001","description":"Imported identity finding","findingIdentity":"inspection-auth:linked-manager-finding","parts":[{"description":"Imported identity part","qty":1}]}]'::jsonb;
begin
  v_result := public.import_inspection_quote_package_atomic(
    '76300000-0000-4000-8000-000000000001',
    '76400000-0000-4000-8000-000000000001',
    '76600000-0000-4000-8000-000000000002',
    null,
    '76100000-0000-4000-8000-000000000017',
    'inspection-auth:linked-manager-import',
    v_items,
    '2026-08-25T21:35:30Z'
  );

  if not coalesce((v_result ->> 'ok')::boolean, false)
     or coalesce((v_result ->> 'idempotent')::boolean, true) then
    raise exception 'Imported profile could not execute the authorized inspection import: %', v_result;
  end if;
  if not exists (
    select 1
    from public.quote_lifecycle_operation_keys receipt
    where receipt.shop_id = '76300000-0000-4000-8000-000000000001'
      and receipt.operation_name = 'inspection_quote_import'
      and receipt.operation_key = 'inspection-auth:linked-manager-import'
      and receipt.actor_user_id = '76100000-0000-4000-8000-000000000007'
      and receipt.work_order_id = '76400000-0000-4000-8000-000000000001'
  ) then
    raise exception 'Imported profile inspection receipt lost its auth actor or work-order binding.';
  end if;
  if exists (
    select 1
    from public.quote_lifecycle_operation_keys receipt
    where receipt.shop_id = '76300000-0000-4000-8000-000000000002'
      and receipt.operation_key = 'inspection-auth:shop-b-hidden'
  ) then
    raise exception 'Imported profile receipt visibility crossed the Shop boundary.';
  end if;
  if not exists (
    select 1
    from public.work_order_quote_lines quote_line
    where quote_line.id = '76700000-0000-4000-8000-000000000001'
      and quote_line.shop_id = '76300000-0000-4000-8000-000000000001'
      and quote_line.work_order_id = '76400000-0000-4000-8000-000000000001'
      and quote_line.suggested_by = '76100000-0000-4000-8000-000000000007'
  ) or not exists (
    select 1
    from public.part_requests request
    where request.shop_id = '76300000-0000-4000-8000-000000000001'
      and request.work_order_id = '76400000-0000-4000-8000-000000000001'
      and request.quote_line_id = '76700000-0000-4000-8000-000000000001'
      and request.requested_by = '76100000-0000-4000-8000-000000000007'
  ) then
    raise exception 'Imported profile alias wrote a non-canonical inspection audit actor.';
  end if;
end
$inspection_import_linked_actor$;

reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

do $inspection_import_service_binding$
declare
  v_linked_retry_result jsonb;
  v_items jsonb := '[{"id":"76700000-0000-4000-8000-000000000001","description":"Imported identity finding","findingIdentity":"inspection-auth:linked-manager-finding","parts":[{"description":"Imported identity part","qty":1}]}]'::jsonb;
  v_replay_denied boolean := false;
  v_unassigned_denied boolean := false;
  v_assigned_result jsonb;
  v_reassigned_retry jsonb;
  v_reassigned_fresh_denied boolean := false;
begin
  v_linked_retry_result := public.import_inspection_quote_package_atomic(
    '76300000-0000-4000-8000-000000000001',
    '76400000-0000-4000-8000-000000000001',
    '76600000-0000-4000-8000-000000000002',
    null,
    '76100000-0000-4000-8000-000000000007',
    'inspection-auth:linked-manager-import',
    v_items,
    '2026-08-25T21:35:30Z'
  );
  if not coalesce((v_linked_retry_result ->> 'idempotent')::boolean, false)
     or not exists (
       select 1
       from public.quote_lifecycle_operation_keys receipt
       where receipt.shop_id = '76300000-0000-4000-8000-000000000001'
         and receipt.operation_name = 'inspection_quote_import'
         and receipt.operation_key = 'inspection-auth:linked-manager-import'
         and receipt.actor_user_id = '76100000-0000-4000-8000-000000000007'
     ) then
    raise exception 'Linked auth subject did not recover its profile-alias receipt: %', v_linked_retry_result;
  end if;

  begin
    perform public.import_inspection_quote_package_atomic(
      '76300000-0000-4000-8000-000000000001',
      '76400000-0000-4000-8000-000000000001',
      '76600000-0000-4000-8000-000000000002',
      null,
      '76100000-0000-4000-8000-000000000001',
      'inspection-auth:linked-manager-import',
      '[]'::jsonb,
      '2026-08-25T21:35:30Z'
    );
  exception when others then
    v_replay_denied :=
      sqlerrm like '%different actor, work order, or source line%';
  end;
  if not v_replay_denied then
    raise exception 'Unauthorized actor replayed an inspection import receipt.';
  end if;

  begin
    perform public.import_inspection_quote_package_atomic(
      '76300000-0000-4000-8000-000000000001',
      '76400000-0000-4000-8000-000000000001',
      '76600000-0000-4000-8000-000000000001',
      null,
      '76100000-0000-4000-8000-000000000005',
      'inspection-auth:unassigned-import',
      '[]'::jsonb,
      '2026-08-25T21:35:40Z'
    );
  exception when insufficient_privilege then
    v_unassigned_denied := true;
  end;
  if not v_unassigned_denied then
    raise exception 'Unassigned mechanic imported inspection findings.';
  end if;

  v_assigned_result := public.import_inspection_quote_package_atomic(
    '76300000-0000-4000-8000-000000000001',
    '76400000-0000-4000-8000-000000000001',
    '76600000-0000-4000-8000-000000000001',
    null,
    '76100000-0000-4000-8000-000000000004',
    'inspection-auth:assigned-import',
    '[]'::jsonb,
    '2026-08-25T21:35:50Z'
  );
  if not coalesce((v_assigned_result ->> 'ok')::boolean, false) then
    raise exception 'Assigned mechanic could not import inspection findings: %', v_assigned_result;
  end if;

  update public.work_order_lines
  set assigned_tech_id = '76100000-0000-4000-8000-000000000005',
      assigned_to = '76100000-0000-4000-8000-000000000005'
  where id = '76500000-0000-4000-8000-000000000001';
  delete from public.work_order_line_technicians
  where work_order_line_id = '76500000-0000-4000-8000-000000000001';
  insert into public.work_order_line_technicians (
    work_order_line_id,
    technician_id,
    assigned_by
  ) values (
    '76500000-0000-4000-8000-000000000001',
    '76100000-0000-4000-8000-000000000005',
    '76100000-0000-4000-8000-000000000001'
  );

  v_reassigned_retry := public.import_inspection_quote_package_atomic(
    '76300000-0000-4000-8000-000000000001',
    '76400000-0000-4000-8000-000000000001',
    '76600000-0000-4000-8000-000000000001',
    null,
    '76100000-0000-4000-8000-000000000004',
    'inspection-auth:assigned-import',
    '[]'::jsonb,
    '2026-08-25T21:35:50Z'
  );
  if not coalesce((v_reassigned_retry ->> 'idempotent')::boolean, false) then
    raise exception 'Committed inspection import receipt was lost after reassignment: %', v_reassigned_retry;
  end if;

  begin
    perform public.import_inspection_quote_package_atomic(
      '76300000-0000-4000-8000-000000000001',
      '76400000-0000-4000-8000-000000000001',
      '76600000-0000-4000-8000-000000000001',
      null,
      '76100000-0000-4000-8000-000000000004',
      'inspection-auth:assigned-import-after-reassignment',
      '[]'::jsonb,
      '2026-08-25T21:35:51Z'
    );
  exception when insufficient_privilege then
    v_reassigned_fresh_denied := true;
  end;
  if not v_reassigned_fresh_denied then
    raise exception 'Reassigned mechanic created a fresh inspection import.';
  end if;

  update public.work_order_lines
  set assigned_tech_id = '76100000-0000-4000-8000-000000000004',
      assigned_to = null
  where id = '76500000-0000-4000-8000-000000000001';
  delete from public.work_order_line_technicians
  where work_order_line_id = '76500000-0000-4000-8000-000000000001';
  insert into public.work_order_line_technicians (
    work_order_line_id,
    technician_id,
    assigned_by
  ) values (
    '76500000-0000-4000-8000-000000000001',
    '76100000-0000-4000-8000-000000000004',
    '76100000-0000-4000-8000-000000000001'
  );
end
$inspection_import_service_binding$;

-- PDF finalization remains service-only, but the service credential cannot
-- substitute an unauthorized actor or bypass exact-line mechanic assignment.
do $inspection_pdf_service_binding$
declare
  v_parts_denied boolean := false;
  v_unassigned_denied boolean := false;
  v_result jsonb;
begin
  begin
    perform public.finalize_inspection_pdf_atomic(
      '76600000-0000-4000-8000-000000000003',
      '76500000-0000-4000-8000-000000000003',
      '76100000-0000-4000-8000-000000000003',
      1,
      'ignored',
      repeat('a', 64),
      null
    );
  exception when insufficient_privilege then
    v_parts_denied := true;
  end;
  if not v_parts_denied then
    raise exception 'Service role finalized an inspection for a denied actor.';
  end if;

  begin
    perform public.finalize_inspection_pdf_atomic(
      '76600000-0000-4000-8000-000000000001',
      '76500000-0000-4000-8000-000000000001',
      '76100000-0000-4000-8000-000000000005',
      1,
      'ignored',
      repeat('b', 64),
      null
    );
  exception when insufficient_privilege then
    v_unassigned_denied := true;
  end;
  if not v_unassigned_denied then
    raise exception 'Unassigned mechanic finalized another technician inspection.';
  end if;

  v_result := public.finalize_inspection_pdf_atomic(
    '76600000-0000-4000-8000-000000000003',
    '76500000-0000-4000-8000-000000000003',
    '76100000-0000-4000-8000-000000000017',
    1,
    'shops/76300000-0000-4000-8000-000000000001/work_orders/76400000-0000-4000-8000-000000000001/inspections/76600000-0000-4000-8000-000000000003/line_76500000-0000-4000-8000-000000000003_r1_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.pdf',
    repeat('a', 64),
    'https://example.invalid/inspection-auth-final.pdf'
  );
  if not coalesce((v_result ->> 'ok')::boolean, false) then
    raise exception 'Authorized imported service actor could not finalize the inspection PDF: %', v_result;
  end if;
  if (
    select inspection.finalized_by
    from public.inspections inspection
    where inspection.id = '76600000-0000-4000-8000-000000000003'
  ) is distinct from '76100000-0000-4000-8000-000000000007'::uuid then
    raise exception 'Imported finalization profile was not mapped to its auth subject.';
  end if;
end
$inspection_pdf_service_binding$;

-- A terminal Assistant action is still private data. Effective capability is
-- rechecked by the public wrapper before the private core can return its replay.
insert into public.shop_assistant_threads (id, shop_id, user_id, title)
values
  (
    '76800000-0000-4000-8000-000000000001',
    '76300000-0000-4000-8000-000000000001',
    '76100000-0000-4000-8000-000000000003',
    'Denied inspection replay fixture'
  ),
  (
    '76800000-0000-4000-8000-000000000002',
    '76300000-0000-4000-8000-000000000001',
    '76100000-0000-4000-8000-000000000001',
    'Authorized inspection replay fixture'
  ),
  (
    '76800000-0000-4000-8000-000000000003',
    '76300000-0000-4000-8000-000000000001',
    '76100000-0000-4000-8000-000000000008',
    'Preset-capable service-role replay fixture'
  ),
  (
    '76800000-0000-4000-8000-000000000004',
    '76300000-0000-4000-8000-000000000001',
    '76100000-0000-4000-8000-000000000009',
    'Preset-capable foreman-role replay fixture'
  );

insert into public.shop_assistant_actions (
  id,
  thread_id,
  shop_id,
  requested_by,
  confirmed_by,
  tool_name,
  domain,
  risk,
  status,
  input,
  preview,
  result,
  idempotency_key,
  target_versions,
  expires_at,
  confirmed_at,
  execution_started_at,
  execution_finished_at
) values
  (
    '76900000-0000-4000-8000-000000000001',
    '76800000-0000-4000-8000-000000000001',
    '76300000-0000-4000-8000-000000000001',
    '76100000-0000-4000-8000-000000000003',
    '76100000-0000-4000-8000-000000000003',
    'reopen_inspection',
    'work_orders',
    'high',
    'succeeded',
    '{}'::jsonb,
    '{}'::jsonb,
    '{"ok":true,"summary":"private denied result"}'::jsonb,
    'inspection-auth:assistant-denied-replay',
    '{}'::jsonb,
    now() + interval '1 hour',
    now(),
    now(),
    now()
  ),
  (
    '76900000-0000-4000-8000-000000000002',
    '76800000-0000-4000-8000-000000000002',
    '76300000-0000-4000-8000-000000000001',
    '76100000-0000-4000-8000-000000000001',
    '76100000-0000-4000-8000-000000000001',
    'reopen_inspection',
    'work_orders',
    'high',
    'succeeded',
    '{}'::jsonb,
    '{}'::jsonb,
    '{"ok":true,"summary":"authorized replay"}'::jsonb,
    'inspection-auth:assistant-authorized-replay',
    '{}'::jsonb,
    now() + interval '1 hour',
    now(),
    now(),
    now()
  ),
  (
    '76900000-0000-4000-8000-000000000003',
    '76800000-0000-4000-8000-000000000003',
    '76300000-0000-4000-8000-000000000001',
    '76100000-0000-4000-8000-000000000008',
    '76100000-0000-4000-8000-000000000008',
    'reopen_inspection',
    'work_orders',
    'high',
    'succeeded',
    '{}'::jsonb,
    '{}'::jsonb,
    '{"ok":true,"summary":"private role-denied result"}'::jsonb,
    'inspection-auth:assistant-role-denied-replay',
    '{}'::jsonb,
    now() + interval '1 hour',
    now(),
    now(),
    now()
  ),
  (
    '76900000-0000-4000-8000-000000000004',
    '76800000-0000-4000-8000-000000000004',
    '76300000-0000-4000-8000-000000000001',
    '76100000-0000-4000-8000-000000000009',
    '76100000-0000-4000-8000-000000000009',
    'reopen_inspection',
    'work_orders',
    'high',
    'succeeded',
    '{}'::jsonb,
    '{}'::jsonb,
    '{"ok":true,"summary":"private foreman-denied result"}'::jsonb,
    'inspection-auth:assistant-foreman-denied-replay',
    '{}'::jsonb,
    now() + interval '1 hour',
    now(),
    now(),
    now()
  );

do $inspection_assistant_replay_binding$
declare
  v_denied boolean := false;
  v_foreman_denied boolean := false;
  v_role_denied boolean := false;
  v_result jsonb;
begin
  begin
    perform public.shop_assistant_reopen_inspection_atomic(
      '76900000-0000-4000-8000-000000000001',
      '76300000-0000-4000-8000-000000000001',
      '76100000-0000-4000-8000-000000000003',
      '76600000-0000-4000-8000-000000000003',
      'Unauthorized action replay'
    );
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'Denied Assistant actor replayed a completed inspection reopen action.';
  end if;

  begin
    perform public.shop_assistant_reopen_inspection_atomic(
      '76900000-0000-4000-8000-000000000003',
      '76300000-0000-4000-8000-000000000001',
      '76100000-0000-4000-8000-000000000008',
      '76600000-0000-4000-8000-000000000003',
      'Disallowed role action replay'
    );
  exception when insufficient_privilege then
    v_role_denied := true;
  end;
  if not v_role_denied then
    raise exception 'Preset-capable service Assistant role replayed a completed inspection reopen action.';
  end if;

  begin
    perform public.shop_assistant_reopen_inspection_atomic(
      '76900000-0000-4000-8000-000000000004',
      '76300000-0000-4000-8000-000000000001',
      '76100000-0000-4000-8000-000000000009',
      '76600000-0000-4000-8000-000000000003',
      'Disallowed foreman role action replay'
    );
  exception when insufficient_privilege then
    v_foreman_denied := true;
  end;
  if not v_foreman_denied then
    raise exception 'Preset-capable foreman Assistant role replayed a completed inspection reopen action.';
  end if;

  v_result := public.shop_assistant_reopen_inspection_atomic(
    '76900000-0000-4000-8000-000000000002',
    '76300000-0000-4000-8000-000000000001',
    '76100000-0000-4000-8000-000000000001',
    '76600000-0000-4000-8000-000000000003',
    'Authorized action replay'
  );
  if not coalesce((v_result ->> 'idempotent')::boolean, false)
     or v_result ->> 'summary' is distinct from 'authorized replay' then
    raise exception 'Authorized Assistant action replay changed behavior: %', v_result;
  end if;
end
$inspection_assistant_replay_binding$;

reset role;

-- Explicit Workspace decisions override presets: a deliberate Parts grant is
-- honored, while an individual manager deny fails closed.
insert into public.staff_capability_overrides (
  shop_id,
  profile_id,
  capability_key,
  effect,
  changed_by_profile_id
) values
  (
    '76300000-0000-4000-8000-000000000001',
    '76100000-0000-4000-8000-000000000003',
    'work_order.inspection.run',
    'allow',
    '76100000-0000-4000-8000-000000000001'
  ),
  (
    '76300000-0000-4000-8000-000000000001',
    '76100000-0000-4000-8000-000000000002',
    'work_order.inspection.run',
    'deny',
    '76100000-0000-4000-8000-000000000001'
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"76100000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

do $inspection_manager_override_denied$
declare
  v_denied boolean := false;
  v_customer_sign_denied boolean := false;
begin
  begin
    perform public.save_inspection_progress_v3_atomic(
      '76300000-0000-4000-8000-000000000001',
      '76500000-0000-4000-8000-000000000002',
      '76100000-0000-4000-8000-000000000002',
      '{"syncRevision":1,"lastUpdated":"2026-08-25T21:36:00Z","sections":[],"quote":[]}'::jsonb,
      'inspection-auth:manager-explicit-deny',
      '2026-08-25T21:36:00Z'
    );
  exception when insufficient_privilege then
    v_denied := true;
  end;

  if not v_denied then
    raise exception 'Individual inspection deny did not override the manager preset.';
  end if;

  begin
    perform public.sign_inspection(
      '76600000-0000-4000-8000-000000000002',
      'customer',
      'Denied Manager Customer Evidence',
      1,
      null,
      null
    );
  exception when insufficient_privilege then
    v_customer_sign_denied := true;
  end;
  if not v_customer_sign_denied then
    raise exception 'Customer evidence role bypassed an explicit manager capability deny.';
  end if;
end
$inspection_manager_override_denied$;

reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"76100000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);

select public.save_inspection_progress_v3_atomic(
  '76300000-0000-4000-8000-000000000001',
  '76500000-0000-4000-8000-000000000002',
  '76100000-0000-4000-8000-000000000003',
  '{"syncRevision":1,"lastUpdated":"2026-08-25T21:37:00Z","sections":[],"quote":[]}'::jsonb,
  'inspection-auth:parts-explicit-allow',
  '2026-08-25T21:37:00Z'
);

reset role;
select set_config('request.jwt.claims', '', true);
select set_config('request.jwt.claim.role', '', true);

do $inspection_authorization_results$
begin
  if (
    select count(*)
    from public.inspections inspection
    where inspection.shop_id = '76300000-0000-4000-8000-000000000001'
      and inspection.is_canonical
  ) <> 5 then
    raise exception 'Denied inspection attempts changed canonical inspection cardinality.';
  end if;

  if (
    select count(*)
    from public.mobile_operation_keys receipt
    where receipt.shop_id = '76300000-0000-4000-8000-000000000001'
      and receipt.operation_name = 'save_inspection_progress'
      and receipt.operation_key like 'inspection-auth:%'
  ) <> 4 then
    raise exception 'Denied inspection attempts created receipts or authorized receipts were lost.';
  end if;

  if exists (
    select 1
    from public.inspections inspection
    where inspection.shop_id = '76300000-0000-4000-8000-000000000002'
  ) then
    raise exception 'Inspection authorization test crossed the tenant boundary.';
  end if;
end
$inspection_authorization_results$;

set constraints all immediate;
rollback;
