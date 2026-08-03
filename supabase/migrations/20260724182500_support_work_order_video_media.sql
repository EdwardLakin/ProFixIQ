begin;

create or replace function public.register_job_photo_storage_object()
returns trigger
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  v_match text[];
  v_work_order_id uuid;
  v_work_order_line_id uuid;
  v_shop_id uuid;
  v_owner_text text;
  v_owner_id uuid;
  v_file_name text;
  v_client_mutation_id text;
  v_content_type text;
  v_file_size bigint;
  v_kind text;
  v_source text;
begin
  if new.bucket_id <> 'job-photos' then
    return new;
  end if;

  v_match := regexp_match(
    new.name,
    '^wo/([0-9a-fA-F-]{36})/lines/([0-9a-fA-F-]{36})/([^/]+)$'
  );
  if v_match is null then
    raise exception using errcode = 'P0001', message = 'INVALID_JOB_MEDIA_STORAGE_PATH';
  end if;

  v_work_order_id := v_match[1]::uuid;
  v_work_order_line_id := v_match[2]::uuid;
  v_file_name := v_match[3];
  v_client_mutation_id := split_part(v_file_name, '_', 1);

  select wo.shop_id
    into v_shop_id
  from public.work_orders wo
  join public.work_order_lines wol
    on wol.work_order_id = wo.id
   and wol.id = v_work_order_line_id
   and wol.shop_id = wo.shop_id
  where wo.id = v_work_order_id;

  if v_shop_id is null then
    raise exception using errcode = 'P0001', message = 'JOB_MEDIA_WORK_ORDER_LINE_MISMATCH';
  end if;

  v_owner_text := coalesce(to_jsonb(new) ->> 'owner_id', to_jsonb(new) ->> 'owner');
  if v_owner_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_owner_id := v_owner_text::uuid;
  end if;

  v_content_type := coalesce(
    to_jsonb(new) #>> '{metadata,mimetype}',
    to_jsonb(new) #>> '{metadata,contentType}',
    case
      when new.name ~* '\.(mov|m4v|mp4|webm)$' then 'video/mp4'
      else 'image/jpeg'
    end
  );

  v_kind := case
    when v_content_type ilike 'video/%' or new.name ~* '\.(mov|m4v|mp4|webm)$' then 'video'
    else 'photo'
  end;

  v_source := case
    when v_kind = 'video' then 'technician_job_video'
    else 'technician_job_photo'
  end;

  begin
    v_file_size := nullif(to_jsonb(new) #>> '{metadata,size}', '')::bigint;
  exception when invalid_text_representation then
    v_file_size := null;
  end;

  insert into public.work_order_media (
    shop_id,
    work_order_id,
    work_order_line_id,
    user_id,
    url,
    kind,
    storage_bucket,
    storage_path,
    file_name,
    content_type,
    file_size,
    source,
    client_mutation_id
  ) values (
    v_shop_id,
    v_work_order_id,
    v_work_order_line_id,
    v_owner_id,
    '/storage/v1/object/public/' || new.bucket_id || '/' || new.name,
    v_kind,
    new.bucket_id,
    new.name,
    v_file_name,
    v_content_type,
    v_file_size,
    v_source,
    nullif(v_client_mutation_id, '')
  )
  on conflict (shop_id, storage_bucket, storage_path)
    where storage_bucket is not null and storage_path is not null
  do update set
    work_order_id = excluded.work_order_id,
    work_order_line_id = excluded.work_order_line_id,
    user_id = coalesce(public.work_order_media.user_id, excluded.user_id),
    kind = excluded.kind,
    file_name = excluded.file_name,
    content_type = excluded.content_type,
    file_size = coalesce(excluded.file_size, public.work_order_media.file_size),
    source = excluded.source,
    client_mutation_id = coalesce(public.work_order_media.client_mutation_id, excluded.client_mutation_id);

  return new;
end;
$$;

commit;
