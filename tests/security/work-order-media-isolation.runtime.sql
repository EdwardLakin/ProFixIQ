\set ON_ERROR_STOP on

-- @regression-flow work-orders.evidence-isolation
begin;

insert into auth.users (id, email, raw_user_meta_data)
values
  ('57100000-0000-4000-8000-000000000001', 'media-owner-a@example.test', '{"full_name":"Media Owner A"}'::jsonb),
  ('57100000-0000-4000-8000-000000000002', 'media-imported-tech@example.test', '{"full_name":"Media Imported Tech"}'::jsonb),
  ('57200000-0000-4000-8000-000000000002', 'media-imported-tech-profile@example.test', '{"full_name":"Media Imported Tech Profile"}'::jsonb),
  ('57100000-0000-4000-8000-000000000003', 'media-parts-a@example.test', '{"full_name":"Media Parts A"}'::jsonb),
  ('57100000-0000-4000-8000-000000000004', 'media-customer-a@example.test', '{}'::jsonb),
  ('57100000-0000-4000-8000-000000000005', 'media-owner-b@example.test', '{"full_name":"Media Owner B"}'::jsonb)
on conflict (id) do nothing;

-- Auth bootstrap may create canonical id-equals-user profiles.  Remove the two
-- identities that intentionally exercise linked imported staff and pure
-- Customer Portal access before installing their canonical relationships.
delete from public.profiles
where id in (
  '57100000-0000-4000-8000-000000000002',
  '57100000-0000-4000-8000-000000000004'
);

insert into public.profiles (id, user_id, role, full_name)
values
  ('57100000-0000-4000-8000-000000000001', '57100000-0000-4000-8000-000000000001', 'owner', 'Media Owner A'),
  ('57200000-0000-4000-8000-000000000002', '57100000-0000-4000-8000-000000000002', 'mechanic', 'Media Imported Tech'),
  ('57100000-0000-4000-8000-000000000003', '57100000-0000-4000-8000-000000000003', 'parts', 'Media Parts A'),
  ('57100000-0000-4000-8000-000000000005', '57100000-0000-4000-8000-000000000005', 'owner', 'Media Owner B')
on conflict (id) do update
set user_id = excluded.user_id,
    role = excluded.role,
    full_name = excluded.full_name;

insert into public.shops (id, owner_id, business_name, name, plan, user_limit)
values
  ('57300000-0000-4000-8000-000000000001', '57100000-0000-4000-8000-000000000001', 'Media Shop A', 'Media Shop A', 'complete_10', 5),
  ('57300000-0000-4000-8000-000000000002', '57100000-0000-4000-8000-000000000005', 'Media Shop B', 'Media Shop B', 'complete_10', 5)
on conflict (id) do nothing;

update public.profiles
set
  user_id = case
    when id = '57200000-0000-4000-8000-000000000002'::uuid
      then '57100000-0000-4000-8000-000000000002'::uuid
    else user_id
  end,
  shop_id = case
    when id = '57100000-0000-4000-8000-000000000005'::uuid
      then '57300000-0000-4000-8000-000000000002'::uuid
    else '57300000-0000-4000-8000-000000000001'::uuid
  end
where id in (
  '57100000-0000-4000-8000-000000000001',
  '57200000-0000-4000-8000-000000000002',
  '57100000-0000-4000-8000-000000000003',
  '57100000-0000-4000-8000-000000000005'
);

insert into public.customers (id, shop_id, user_id, name, email)
values (
  '57400000-0000-4000-8000-000000000001',
  '57300000-0000-4000-8000-000000000001',
  '57100000-0000-4000-8000-000000000004',
  'Media Customer A',
  'media-customer-a@example.test'
);

insert into public.work_orders (id, shop_id, customer_id, custom_id, status)
values
  ('57500000-0000-4000-8000-000000000001', '57300000-0000-4000-8000-000000000001', '57400000-0000-4000-8000-000000000001', 'MEDIA-A-1001', 'in_progress'),
  ('57500000-0000-4000-8000-000000000002', '57300000-0000-4000-8000-000000000002', null, 'MEDIA-B-1001', 'in_progress');

insert into public.customer_portal_invites (
  id,
  shop_id,
  customer_id,
  work_order_id,
  email,
  token,
  accepted_at,
  accepted_by_user_id,
  revoked_at
)
values (
  '57400000-0000-4000-8000-000000000002',
  '57300000-0000-4000-8000-000000000001',
  '57400000-0000-4000-8000-000000000001',
  '57500000-0000-4000-8000-000000000001',
  'media-customer-a@example.test',
  '57400000-0000-4000-8000-000000000003',
  now(),
  '57100000-0000-4000-8000-000000000004',
  null
);

insert into public.work_order_lines (
  id, shop_id, work_order_id, line_type, status, description
)
values
  ('57600000-0000-4000-8000-000000000001', '57300000-0000-4000-8000-000000000001', '57500000-0000-4000-8000-000000000001', 'job', 'in_progress', 'Media line A'),
  ('57600000-0000-4000-8000-000000000002', '57300000-0000-4000-8000-000000000002', '57500000-0000-4000-8000-000000000002', 'job', 'in_progress', 'Media line B'),
  ('57600000-0000-4000-8000-000000000003', '57300000-0000-4000-8000-000000000001', '57500000-0000-4000-8000-000000000001', 'job', 'in_progress', 'Media line A unassigned');

update public.work_order_lines
set assigned_tech_id = '57200000-0000-4000-8000-000000000002'
where id = '57600000-0000-4000-8000-000000000001';

-- Clean replay intentionally starts without dashboard-provisioned Storage
-- buckets. Install the private bucket contract inside this rolled-back fixture
-- before inserting objects that reference it.
insert into storage.buckets (id, name, public)
values ('job-photos', 'job-photos', false)
on conflict (id) do update set public = false;

insert into storage.objects (
  id, bucket_id, name, owner, owner_id, metadata
)
values
  (
    '57700000-0000-4000-8000-000000000001',
    'job-photos',
    'wo/57500000-0000-4000-8000-000000000001/lines/57600000-0000-4000-8000-000000000001/57700000-0000-4000-8000-000000000011_internal.jpg',
    '57100000-0000-4000-8000-000000000001',
    '57100000-0000-4000-8000-000000000001',
    '{"mimetype":"image/jpeg","size":10,"fixture":"internal-a"}'::jsonb
  ),
  (
    '57700000-0000-4000-8000-000000000002',
    'job-photos',
    'wo/57500000-0000-4000-8000-000000000001/lines/57600000-0000-4000-8000-000000000001/57700000-0000-4000-8000-000000000012_customer.jpg',
    '57100000-0000-4000-8000-000000000002',
    '57100000-0000-4000-8000-000000000002',
    '{"mimetype":"image/jpeg","size":11,"fixture":"customer-a"}'::jsonb
  ),
  (
    '57700000-0000-4000-8000-000000000003',
    'job-photos',
    'wo/57500000-0000-4000-8000-000000000002/lines/57600000-0000-4000-8000-000000000002/57700000-0000-4000-8000-000000000013_internal.jpg',
    '57100000-0000-4000-8000-000000000005',
    '57100000-0000-4000-8000-000000000005',
    '{"mimetype":"image/jpeg","size":12,"fixture":"internal-b"}'::jsonb
  );

update public.work_order_media
set visibility = 'customer'
where storage_path = 'wo/57500000-0000-4000-8000-000000000001/lines/57600000-0000-4000-8000-000000000001/57700000-0000-4000-8000-000000000012_customer.jpg';

do $media_isolation_contract$
begin
  if not exists (
    select 1
    from storage.buckets bucket
    where bucket.id = 'job-photos'
      and bucket.public is false
  ) then
    raise exception 'Job-photo bucket is not private.';
  end if;

  if has_table_privilege('anon', 'public.work_order_media', 'SELECT')
     or has_table_privilege('anon', 'public.work_order_media', 'INSERT')
     or has_table_privilege('anon', 'public.work_order_media', 'UPDATE')
     or has_table_privilege('authenticated', 'public.work_order_media', 'DELETE')
     or has_table_privilege('authenticated', 'public.work_order_media', 'TRUNCATE') then
    raise exception 'Work Order media relation grants remain broader than the intended browser contract.';
  end if;

  if has_function_privilege(
    'anon',
    'private.job_photo_object_access(text,text,text)',
    'EXECUTE'
  ) or not has_function_privilege(
    'authenticated',
    'private.job_photo_object_access(text,text,text)',
    'EXECUTE'
  ) then
    raise exception 'Job-photo storage helper grants are incorrect.';
  end if;

  if has_function_privilege(
    'anon',
    'private.work_order_media_write_access(uuid,uuid,uuid)',
    'EXECUTE'
  ) or not has_function_privilege(
    'authenticated',
    'private.work_order_media_write_access(uuid,uuid,uuid)',
    'EXECUTE'
  ) or has_function_privilege(
    'service_role',
    'private.work_order_media_write_access(uuid,uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'Work Order media write helper grants are incorrect.';
  end if;

  if not exists (
    select 1
    from pg_proc helper
    join pg_namespace function_schema
      on function_schema.oid = helper.pronamespace
    where function_schema.nspname = 'private'
      and helper.proname = 'work_order_media_write_access'
      and helper.pronargs = 3
      and helper.provolatile = 'v'
      and helper.prosecdef
      and helper.proconfig @> array['search_path=""']::text[]
  ) or not exists (
    select 1
    from pg_proc helper
    join pg_namespace function_schema
      on function_schema.oid = helper.pronamespace
    where function_schema.nspname = 'private'
      and helper.proname = 'job_photo_object_access'
      and helper.pronargs = 3
      and helper.provolatile = 'v'
      and helper.prosecdef
      and helper.proconfig @> array['search_path=""']::text[]
  ) then
    raise exception 'Work Order media write helpers do not preserve lock-aware volatility.';
  end if;

  if not exists (
    select 1
    from pg_proc validator
    join pg_namespace function_schema
      on function_schema.oid = validator.pronamespace
    where function_schema.nspname = 'public'
      and validator.proname = 'validate_work_order_media_scope'
      and validator.pronargs = 0
      and validator.prorettype = 'trigger'::regtype
      and validator.prosecdef
      and validator.proconfig @> array['search_path=""']::text[]
  ) then
    raise exception 'Work Order media scope validation is not running through the controlled definer boundary.';
  end if;

  if has_function_privilege(
    'anon',
    'public.validate_work_order_media_scope()',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.validate_work_order_media_scope()',
    'EXECUTE'
  ) or has_function_privilege(
    'service_role',
    'public.validate_work_order_media_scope()',
    'EXECUTE'
  ) then
    raise exception 'Work Order media scope trigger remains directly executable.';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'work_order_media'
      and policyname = 'work_order_media_select'
  ) then
    raise exception 'The drifted broad media read policy still exists.';
  end if;
end
$media_isolation_contract$;

-- Linked/imported technicians must retain legitimate same-Shop upload,
-- retry, direct media, and annotation behavior without inheriting another
-- actor's object ownership.
select set_config(
  'request.jwt.claims',
  '{"sub":"57100000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;

do $media_imported_tech$
declare
  v_media_id uuid;
  v_cross_shop_denied boolean := false;
  v_cross_shop_media_denied boolean := false;
  v_owner_spoof_denied boolean := false;
  v_unassigned_storage_denied boolean := false;
  v_unassigned_media_denied boolean := false;
begin
  if (
    select count(*)
    from storage.objects
    where bucket_id = 'job-photos'
      and name like 'wo/57500000-0000-4000-8000-000000000001/%'
  ) <> 2 then
    raise exception 'Imported technician cannot read same-Shop job photos.';
  end if;

  if exists (
    select 1
    from storage.objects
    where bucket_id = 'job-photos'
      and name like 'wo/57500000-0000-4000-8000-000000000002/%'
  ) then
    raise exception 'Imported technician can read another Shop job photo.';
  end if;

  -- Another actor owns the internal image.  This update must affect zero rows.
  update storage.objects
  set metadata = metadata || '{"tampered":true}'::jsonb
  where bucket_id = 'job-photos'
    and name = 'wo/57500000-0000-4000-8000-000000000001/lines/57600000-0000-4000-8000-000000000001/57700000-0000-4000-8000-000000000011_internal.jpg';
  if found then
    raise exception 'Imported technician updated another actor''s object.';
  end if;

  update storage.objects
  set metadata = metadata || '{"retried":true}'::jsonb
  where bucket_id = 'job-photos'
    and name = 'wo/57500000-0000-4000-8000-000000000001/lines/57600000-0000-4000-8000-000000000001/57700000-0000-4000-8000-000000000012_customer.jpg';
  if not found then
    raise exception 'Imported technician cannot retry their own upload.';
  end if;

  insert into storage.objects (
    id, bucket_id, name, owner, owner_id, metadata
  ) values (
    '57700000-0000-4000-8000-000000000004',
    'job-photos',
    'wo/57500000-0000-4000-8000-000000000001/lines/57600000-0000-4000-8000-000000000001/57700000-0000-4000-8000-000000000014_retry.jpg',
    '57100000-0000-4000-8000-000000000002',
    '57100000-0000-4000-8000-000000000002',
    '{"mimetype":"image/jpeg","size":13,"fixture":"tech-retry"}'::jsonb
  );

  begin
    insert into storage.objects (
      id, bucket_id, name, owner, owner_id, metadata
    ) values (
      '57700000-0000-4000-8000-000000000008',
      'job-photos',
      'wo/57500000-0000-4000-8000-000000000001/lines/57600000-0000-4000-8000-000000000003/57700000-0000-4000-8000-000000000018_unassigned.jpg',
      '57100000-0000-4000-8000-000000000002',
      '57100000-0000-4000-8000-000000000002',
      '{"mimetype":"image/jpeg"}'::jsonb
    );
  exception when insufficient_privilege then
    v_unassigned_storage_denied := true;
  end;
  if not v_unassigned_storage_denied then
    raise exception 'Imported technician wrote storage for an unassigned repair line.';
  end if;

  begin
    insert into public.work_order_media (
      shop_id,
      work_order_id,
      work_order_line_id,
      user_id,
      url,
      kind,
      source,
      client_mutation_id
    ) values (
      '57300000-0000-4000-8000-000000000001',
      '57500000-0000-4000-8000-000000000001',
      '57600000-0000-4000-8000-000000000003',
      '57100000-0000-4000-8000-000000000002',
      'https://example.test/imported-tech-unassigned.jpg',
      'photo',
      'runtime_test',
      'media-runtime:imported-tech-unassigned'
    );
  exception when insufficient_privilege then
    v_unassigned_media_denied := true;
  end;
  if not v_unassigned_media_denied then
    raise exception 'Imported technician wrote media for an unassigned repair line.';
  end if;

  begin
    insert into storage.objects (
      id, bucket_id, name, owner, owner_id, metadata
    ) values (
      '57700000-0000-4000-8000-000000000005',
      'job-photos',
      'wo/57500000-0000-4000-8000-000000000002/lines/57600000-0000-4000-8000-000000000002/57700000-0000-4000-8000-000000000015_cross.jpg',
      '57100000-0000-4000-8000-000000000002',
      '57100000-0000-4000-8000-000000000002',
      '{"mimetype":"image/jpeg"}'::jsonb
    );
  exception when insufficient_privilege then
    v_cross_shop_denied := true;
  end;
  if not v_cross_shop_denied then
    raise exception 'Imported technician inserted a cross-Shop storage object.';
  end if;

  begin
    insert into public.work_order_media (
      shop_id,
      work_order_id,
      work_order_line_id,
      user_id,
      url,
      kind,
      source,
      client_mutation_id
    ) values (
      '57300000-0000-4000-8000-000000000002',
      '57500000-0000-4000-8000-000000000002',
      '57600000-0000-4000-8000-000000000002',
      '57100000-0000-4000-8000-000000000002',
      'https://example.test/imported-tech-cross-shop.jpg',
      'photo',
      'runtime_test',
      'media-runtime:imported-tech-cross-shop'
    );
  exception when insufficient_privilege then
    v_cross_shop_media_denied := true;
  end;
  if not v_cross_shop_media_denied then
    raise exception 'Imported technician inserted cross-Shop Work Order media.';
  end if;

  begin
    insert into storage.objects (
      id, bucket_id, name, owner, owner_id, metadata
    ) values (
      '57700000-0000-4000-8000-000000000006',
      'job-photos',
      'wo/57500000-0000-4000-8000-000000000001/lines/57600000-0000-4000-8000-000000000001/57700000-0000-4000-8000-000000000016_spoof.jpg',
      '57100000-0000-4000-8000-000000000001',
      '57100000-0000-4000-8000-000000000001',
      '{"mimetype":"image/jpeg"}'::jsonb
    );
  exception when insufficient_privilege then
    v_owner_spoof_denied := true;
  end;
  if not v_owner_spoof_denied then
    raise exception 'Imported technician spoofed another storage owner.';
  end if;

  insert into public.work_order_media (
    shop_id,
    work_order_id,
    work_order_line_id,
    user_id,
    url,
    kind,
    source,
    client_mutation_id
  ) values (
    '57300000-0000-4000-8000-000000000001',
    '57500000-0000-4000-8000-000000000001',
    '57600000-0000-4000-8000-000000000001',
    '57100000-0000-4000-8000-000000000002',
    'https://example.test/imported-tech-direct.jpg',
    'photo',
    'runtime_test',
    'media-runtime:imported-tech-direct'
  );

  select id into v_media_id
  from public.work_order_media
  where storage_path = 'wo/57500000-0000-4000-8000-000000000001/lines/57600000-0000-4000-8000-000000000001/57700000-0000-4000-8000-000000000012_customer.jpg';

  perform public.save_work_order_media_annotation_atomic(
    v_media_id,
    '[]'::jsonb,
    'customer',
    'media-runtime:imported-tech-annotation'
  );

  if not exists (
    select 1
    from public.work_order_media_annotations
    where media_id = v_media_id
      and created_by = '57100000-0000-4000-8000-000000000002'
      and visibility = 'customer'
  ) then
    raise exception 'Imported technician annotation did not preserve auth ownership.';
  end if;
end
$media_imported_tech$;

reset role;
select set_config('request.jwt.claims', '', true);

-- A completed annotation receipt and object ownership do not survive repair-
-- line reassignment. Authorization must precede idempotency and every direct
-- media/Storage write decision.
update public.work_order_lines
set assigned_tech_id = null
where id = '57600000-0000-4000-8000-000000000001';

select set_config(
  'request.jwt.claims',
  '{"sub":"57100000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;

do $media_reassigned_tech$
declare
  v_media_id uuid;
  v_receipt_denied boolean := false;
  v_storage_denied boolean := false;
begin
  select id into strict v_media_id
  from public.work_order_media
  where storage_path = 'wo/57500000-0000-4000-8000-000000000001/lines/57600000-0000-4000-8000-000000000001/57700000-0000-4000-8000-000000000012_customer.jpg';

  begin
    perform public.save_work_order_media_annotation_atomic(
      v_media_id,
      '[]'::jsonb,
      'customer',
      'media-runtime:imported-tech-annotation'
    );
  exception when insufficient_privilege then
    v_receipt_denied := true;
  end;
  if not v_receipt_denied then
    raise exception 'Reassigned technician replayed an annotation receipt.';
  end if;

  begin
    insert into storage.objects (
      id, bucket_id, name, owner, owner_id, metadata
    ) values (
      '57700000-0000-4000-8000-000000000009',
      'job-photos',
      'wo/57500000-0000-4000-8000-000000000001/lines/57600000-0000-4000-8000-000000000001/57700000-0000-4000-8000-000000000019_reassigned.jpg',
      '57100000-0000-4000-8000-000000000002',
      '57100000-0000-4000-8000-000000000002',
      '{"mimetype":"image/jpeg"}'::jsonb
    );
  exception when insufficient_privilege then
    v_storage_denied := true;
  end;
  if not v_storage_denied then
    raise exception 'Reassigned technician wrote a new job-photo object.';
  end if;

  update public.work_order_media
  set visibility = 'customer'
  where client_mutation_id = 'media-runtime:imported-tech-direct';
  if found then
    raise exception 'Reassigned technician updated prior Work Order media.';
  end if;
end;
$media_reassigned_tech$;

reset role;
select set_config('request.jwt.claims', '', true);

-- Parts can consume same-Shop evidence but cannot upload or annotate it.
select set_config(
  'request.jwt.claims',
  '{"sub":"57100000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);
set local role authenticated;

do $media_parts$
declare
  v_media_id uuid;
  v_insert_denied boolean := false;
  v_media_insert_denied boolean := false;
  v_annotation_denied boolean := false;
begin
  if (
    select count(*)
    from storage.objects
    where bucket_id = 'job-photos'
      and name like 'wo/57500000-0000-4000-8000-000000000001/%'
  ) <> 3 then
    raise exception 'Parts cannot read the complete same-Shop evidence set.';
  end if;

  begin
    insert into storage.objects (
      id, bucket_id, name, owner, owner_id, metadata
    ) values (
      '57700000-0000-4000-8000-000000000007',
      'job-photos',
      'wo/57500000-0000-4000-8000-000000000001/lines/57600000-0000-4000-8000-000000000001/57700000-0000-4000-8000-000000000017_parts.jpg',
      '57100000-0000-4000-8000-000000000003',
      '57100000-0000-4000-8000-000000000003',
      '{"mimetype":"image/jpeg"}'::jsonb
    );
  exception when insufficient_privilege then
    v_insert_denied := true;
  end;
  if not v_insert_denied then
    raise exception 'Parts inserted a job-photo object.';
  end if;

  begin
    insert into public.work_order_media (
      shop_id,
      work_order_id,
      work_order_line_id,
      user_id,
      url,
      kind,
      source,
      client_mutation_id
    ) values (
      '57300000-0000-4000-8000-000000000001',
      '57500000-0000-4000-8000-000000000001',
      '57600000-0000-4000-8000-000000000001',
      '57100000-0000-4000-8000-000000000003',
      'https://example.test/parts-direct.jpg',
      'photo',
      'runtime_test',
      'media-runtime:parts-direct'
    );
  exception when insufficient_privilege then
    v_media_insert_denied := true;
  end;
  if not v_media_insert_denied then
    raise exception 'Parts inserted Work Order media.';
  end if;

  select id into v_media_id
  from public.work_order_media
  where storage_path = 'wo/57500000-0000-4000-8000-000000000001/lines/57600000-0000-4000-8000-000000000001/57700000-0000-4000-8000-000000000011_internal.jpg';

  begin
    perform public.save_work_order_media_annotation_atomic(
      v_media_id,
      '[]'::jsonb,
      'internal',
      'media-runtime:parts-denied'
    );
  exception when insufficient_privilege then
    v_annotation_denied := true;
  end;
  if not v_annotation_denied then
    raise exception 'Parts annotated Work Order evidence.';
  end if;
end
$media_parts$;

reset role;
select set_config('request.jwt.claims', '', true);

-- A pure customer receives only the one customer-visible object/media/markup
-- associated with their own Work Order; internal and other-Shop evidence stay
-- invisible even when object names are known.
select set_config(
  'request.jwt.claims',
  '{"sub":"57100000-0000-4000-8000-000000000004","role":"authenticated"}',
  true
);
set local role authenticated;

do $media_customer$
begin
  if (
    select count(*)
    from storage.objects
    where bucket_id = 'job-photos'
  ) <> 1 or not exists (
    select 1
    from storage.objects
    where name = 'wo/57500000-0000-4000-8000-000000000001/lines/57600000-0000-4000-8000-000000000001/57700000-0000-4000-8000-000000000012_customer.jpg'
  ) then
    raise exception 'Customer storage visibility is not restricted to customer-visible evidence.';
  end if;

  if (
    select count(*)
    from public.work_order_media
  ) <> 1 or (
    select count(*)
    from public.work_order_media_annotations
  ) <> 1 then
    raise exception 'Customer media or annotation visibility escaped its canonical boundary.';
  end if;
end
$media_customer$;

reset role;
select set_config('request.jwt.claims', '', true);

-- Revocation must immediately remove every customer evidence read path,
-- including the SECURITY DEFINER Storage helper.
update public.customer_portal_invites
set revoked_at = now()
where id = '57400000-0000-4000-8000-000000000002';

select set_config(
  'request.jwt.claims',
  '{"sub":"57100000-0000-4000-8000-000000000004","role":"authenticated"}',
  true
);
set local role authenticated;

do $media_revoked_customer$
begin
  if exists (
    select 1 from storage.objects where bucket_id = 'job-photos'
  ) or exists (
    select 1 from public.work_order_media
  ) or exists (
    select 1 from public.work_order_media_annotations
  ) then
    raise exception 'Revoked customer retained Work Order evidence access.';
  end if;
end
$media_revoked_customer$;

reset role;
select set_config('request.jwt.claims', '', true);

-- Same-Shop managers may manage another actor's object, but guessed paths in
-- another tenant remain invisible and immutable.
select set_config(
  'request.jwt.claims',
  '{"sub":"57100000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

do $media_owner_a$
begin
  update storage.objects
  set metadata = metadata || '{"manager_reviewed":true}'::jsonb
  where bucket_id = 'job-photos'
    and name = 'wo/57500000-0000-4000-8000-000000000001/lines/57600000-0000-4000-8000-000000000001/57700000-0000-4000-8000-000000000012_customer.jpg';
  if not found then
    raise exception 'Same-Shop owner cannot manage another actor''s evidence object.';
  end if;

  update storage.objects
  set metadata = metadata || '{"cross_shop_tamper":true}'::jsonb
  where bucket_id = 'job-photos'
    and name = 'wo/57500000-0000-4000-8000-000000000002/lines/57600000-0000-4000-8000-000000000002/57700000-0000-4000-8000-000000000013_internal.jpg';
  if found then
    raise exception 'Shop A owner updated Shop B evidence.';
  end if;

  if exists (
    select 1
    from storage.objects
    where bucket_id = 'job-photos'
      and name like 'wo/57500000-0000-4000-8000-000000000002/%'
  ) then
    raise exception 'Shop A owner can read Shop B evidence.';
  end if;
end
$media_owner_a$;

reset role;
select set_config('request.jwt.claims', '', true);

select set_config(
  'request.jwt.claims',
  '{"sub":"57100000-0000-4000-8000-000000000005","role":"authenticated"}',
  true
);
set local role authenticated;

do $media_owner_b$
begin
  if (
    select count(*)
    from storage.objects
    where bucket_id = 'job-photos'
  ) <> 1 or not exists (
    select 1
    from storage.objects
    where name like 'wo/57500000-0000-4000-8000-000000000002/%'
  ) then
    raise exception 'Shop B owner evidence scope is incorrect.';
  end if;
end
$media_owner_b$;

reset role;
select set_config('request.jwt.claims', '', true);

rollback;
