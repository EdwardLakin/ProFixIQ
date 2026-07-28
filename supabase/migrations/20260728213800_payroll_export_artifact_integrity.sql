-- Make payroll export artifacts deployable, private, and transactionally
-- connected to their database history.

alter table public.payroll_export_batches
  add column if not exists handoff_status text not null default 'pending',
  add column if not exists storage_bucket text,
  add column if not exists storage_path text,
  add column if not exists file_size_bytes bigint,
  add column if not exists file_sha256 text,
  add column if not exists provider_template_version text,
  add column if not exists download_count integer not null default 0,
  add column if not exists last_downloaded_at timestamptz,
  add column if not exists last_downloaded_by uuid
    references public.profiles(id) on delete set null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.payroll_export_batches'::regclass
      and conname = 'payroll_export_batches_handoff_status_chk'
  ) then
    alter table public.payroll_export_batches
      add constraint payroll_export_batches_handoff_status_chk
      check (handoff_status in ('pending', 'generated', 'failed'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.payroll_export_batches'::regclass
      and conname = 'payroll_export_batches_file_size_chk'
  ) then
    alter table public.payroll_export_batches
      add constraint payroll_export_batches_file_size_chk
      check (file_size_bytes is null or file_size_bytes >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.payroll_export_batches'::regclass
      and conname = 'payroll_export_batches_file_sha256_chk'
  ) then
    alter table public.payroll_export_batches
      add constraint payroll_export_batches_file_sha256_chk
      check (file_sha256 is null or file_sha256 ~ '^[0-9a-f]{64}$');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.payroll_export_batches'::regclass
      and conname = 'payroll_export_batches_download_count_chk'
  ) then
    alter table public.payroll_export_batches
      add constraint payroll_export_batches_download_count_chk
      check (download_count >= 0);
  end if;
end;
$$;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'payroll-exports',
  'payroll-exports',
  false,
  10485760,
  array['text/csv']::text[]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.finalize_payroll_export_atomic(
  p_shop_id uuid,
  p_actor_profile_id uuid,
  p_period_id uuid,
  p_batch_id uuid,
  p_storage_bucket text,
  p_storage_path text,
  p_file_size_bytes bigint,
  p_file_sha256 text,
  p_provider_template_version text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype;
  v_period public.payroll_pay_periods%rowtype;
  v_batch public.payroll_export_batches%rowtype;
  v_now timestamptz := now();
  v_expected_path text;
begin
  if p_shop_id is null
     or p_actor_profile_id is null
     or p_period_id is null
     or p_batch_id is null then
    raise exception 'Shop, actor, period, and export batch are required';
  end if;

  select *
  into v_actor
  from public.profiles profile
  where profile.id = p_actor_profile_id
    and profile.shop_id = p_shop_id;

  if not found then
    raise exception 'Actor is not a member of this shop';
  end if;

  if auth.uid() is not null
     and auth.uid() <> v_actor.id
     and auth.uid() is distinct from v_actor.user_id then
    raise exception 'Actor identity mismatch';
  end if;

  if lower(coalesce(v_actor.role::text, '')) not in ('owner', 'admin') then
    raise exception 'Only an owner or admin can export payroll';
  end if;

  select *
  into v_period
  from public.payroll_pay_periods period
  where period.id = p_period_id
    and period.shop_id = p_shop_id
  for update;

  if not found then
    raise exception 'Pay period not found';
  end if;

  select *
  into v_batch
  from public.payroll_export_batches batch
  where batch.id = p_batch_id
    and batch.shop_id = p_shop_id
    and batch.period_id = p_period_id
  for update;

  if not found then
    raise exception 'Payroll export batch not found';
  end if;

  v_expected_path :=
    p_shop_id::text || '/' || p_period_id::text || '/' || p_batch_id::text || '.csv';

  if p_storage_bucket is distinct from 'payroll-exports'
     or nullif(trim(p_storage_path), '') is distinct from v_expected_path then
    raise exception 'Payroll export artifact path is invalid';
  end if;
  if p_file_size_bytes is null or p_file_size_bytes <= 0 then
    raise exception 'Payroll export artifact is empty';
  end if;
  if p_file_sha256 is null or p_file_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Payroll export checksum is invalid';
  end if;
  if nullif(trim(p_provider_template_version), '') is null then
    raise exception 'Payroll export template version is required';
  end if;

  if v_period.status = 'exported'
     and v_batch.status = 'generated'
     and v_batch.handoff_status = 'generated'
     and v_batch.storage_bucket = p_storage_bucket
     and v_batch.storage_path = p_storage_path
     and v_batch.file_size_bytes = p_file_size_bytes
     and v_batch.file_sha256 = p_file_sha256
     and v_batch.provider_template_version = p_provider_template_version then
    return jsonb_build_object(
      'ok', true,
      'batch_id', p_batch_id,
      'period_id', p_period_id,
      'reused', true
    );
  end if;

  if v_period.status <> 'approved' then
    raise exception 'Payroll period must be approved before export';
  end if;
  if v_batch.status not in ('pending', 'generated') then
    raise exception 'Payroll export batch cannot be finalized from its current state';
  end if;

  update public.payroll_export_batches
  set
    status = 'generated',
    handoff_status = 'generated',
    storage_bucket = p_storage_bucket,
    storage_path = p_storage_path,
    file_size_bytes = p_file_size_bytes,
    file_sha256 = p_file_sha256,
    provider_template_version = p_provider_template_version,
    exported_at = coalesce(exported_at, v_now),
    exported_by = p_actor_profile_id,
    updated_at = v_now
  where id = p_batch_id
    and shop_id = p_shop_id;

  update public.payroll_pay_periods
  set
    status = 'exported',
    exported_at = v_now,
    exported_by = p_actor_profile_id,
    locked_at = coalesce(locked_at, v_now),
    updated_at = v_now
  where id = p_period_id
    and shop_id = p_shop_id;

  insert into public.audit_logs (
    actor_id,
    action,
    target,
    metadata
  ) values (
    p_actor_profile_id,
    'payroll.export.generated',
    p_batch_id::text,
    jsonb_build_object(
      'shop_id', p_shop_id,
      'target_type', 'payroll_export_batch',
      'period_id', p_period_id,
      'batch_id', p_batch_id,
      'provider_type', v_batch.provider_type,
      'row_count', v_batch.row_count,
      'has_artifact', true,
      'file_sha256', p_file_sha256,
      'file_size_bytes', p_file_size_bytes
    )
  );

  return jsonb_build_object(
    'ok', true,
    'batch_id', p_batch_id,
    'period_id', p_period_id,
    'reused', false
  );
end;
$$;

create or replace function public.record_payroll_export_download_atomic(
  p_shop_id uuid,
  p_actor_profile_id uuid,
  p_batch_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype;
  v_batch public.payroll_export_batches%rowtype;
  v_now timestamptz := now();
  v_download_count integer;
begin
  if p_shop_id is null
     or p_actor_profile_id is null
     or p_batch_id is null then
    raise exception 'Shop, actor, and export batch are required';
  end if;

  select *
  into v_actor
  from public.profiles profile
  where profile.id = p_actor_profile_id
    and profile.shop_id = p_shop_id;

  if not found then
    raise exception 'Actor is not a member of this shop';
  end if;

  if auth.uid() is not null
     and auth.uid() <> v_actor.id
     and auth.uid() is distinct from v_actor.user_id then
    raise exception 'Actor identity mismatch';
  end if;

  if lower(coalesce(v_actor.role::text, '')) not in (
    'owner',
    'admin',
    'manager'
  ) then
    raise exception 'Payroll review access is required';
  end if;

  select *
  into v_batch
  from public.payroll_export_batches batch
  where batch.id = p_batch_id
    and batch.shop_id = p_shop_id
  for update;

  if not found then
    raise exception 'Payroll export batch not found';
  end if;
  if v_batch.status <> 'generated'
     or v_batch.handoff_status <> 'generated'
     or v_batch.storage_bucket is null
     or v_batch.storage_path is null then
    raise exception 'Payroll export artifact is not available';
  end if;

  update public.payroll_export_batches
  set
    download_count = download_count + 1,
    last_downloaded_at = v_now,
    last_downloaded_by = p_actor_profile_id,
    updated_at = v_now
  where id = p_batch_id
    and shop_id = p_shop_id
  returning download_count into v_download_count;

  insert into public.audit_logs (
    actor_id,
    action,
    target,
    metadata
  ) values (
    p_actor_profile_id,
    'payroll.export.downloaded',
    p_batch_id::text,
    jsonb_build_object(
      'shop_id', p_shop_id,
      'target_type', 'payroll_export_batch',
      'period_id', v_batch.period_id,
      'batch_id', p_batch_id,
      'provider_type', v_batch.provider_type,
      'file_sha256', v_batch.file_sha256,
      'file_size_bytes', v_batch.file_size_bytes,
      'download_count', v_download_count
    )
  );

  return jsonb_build_object(
    'ok', true,
    'batch_id', p_batch_id,
    'download_count', v_download_count
  );
end;
$$;

revoke all on function public.finalize_payroll_export_atomic(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  bigint,
  text,
  text
) from public, anon;
grant execute on function public.finalize_payroll_export_atomic(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  bigint,
  text,
  text
) to authenticated, service_role;

revoke all on function public.record_payroll_export_download_atomic(
  uuid,
  uuid,
  uuid
) from public, anon;
grant execute on function public.record_payroll_export_download_atomic(
  uuid,
  uuid,
  uuid
) to authenticated, service_role;

comment on function public.finalize_payroll_export_atomic(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  bigint,
  text,
  text
) is
  'Atomically connects a private payroll artifact, its pay period lock, and its audit event.';

comment on function public.record_payroll_export_download_atomic(
  uuid,
  uuid,
  uuid
) is
  'Atomically increments payroll artifact access evidence and records the named actor.';
