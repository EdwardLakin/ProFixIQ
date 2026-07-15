do $$
begin
  if to_regclass('public.work_order_media') is null then
    raise exception 'Phase 6 postcheck failed: work_order_media is missing.';
  end if;

  if to_regclass('storage.objects') is null then
    raise exception 'Phase 6 postcheck failed: storage.objects is missing.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'work_order_media'
      and column_name = 'work_order_line_id'
  ) then
    raise exception 'Phase 6 postcheck failed: work_order_media.work_order_line_id is missing.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'work_order_media'
      and column_name = 'storage_path'
  ) then
    raise exception 'Phase 6 postcheck failed: work_order_media.storage_path is missing.';
  end if;

  if to_regprocedure('public.register_job_photo_storage_object()') is null then
    raise exception 'Phase 6 postcheck failed: job photo registration function is missing.';
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgname = 'trg_register_job_photo_storage_object'
      and tgrelid = 'storage.objects'::regclass
      and not tgisinternal
  ) then
    raise exception 'Phase 6 postcheck failed: storage registration trigger is missing.';
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'work_order_media'
      and indexname = 'uq_work_order_media_storage_object'
  ) then
    raise exception 'Phase 6 postcheck failed: job photo idempotency index is missing.';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'work_order_media'
      and policyname = 'work_order_media_shop_select'
  ) then
    raise exception 'Phase 6 postcheck failed: work_order_media select policy is missing.';
  end if;

  raise notice 'Phase 6 technician mobile reliability postcheck passed.';
end;
$$;
