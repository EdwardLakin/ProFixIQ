begin;

alter table public.work_order_media
  add column if not exists work_order_line_id uuid references public.work_order_lines(id) on delete set null,
  add column if not exists storage_bucket text,
  add column if not exists storage_path text,
  add column if not exists file_name text,
  add column if not exists content_type text,
  add column if not exists file_size bigint,
  add column if not exists note text,
  add column if not exists source text,
  add column if not exists client_mutation_id text;

create index if not exists idx_work_order_media_line_id
  on public.work_order_media(work_order_line_id);
create index if not exists idx_work_order_media_shop_source
  on public.work_order_media(shop_id, source);
create unique index if not exists uq_work_order_media_storage_object
  on public.work_order_media(shop_id, storage_bucket, storage_path)
  where storage_bucket is not null and storage_path is not null;
create unique index if not exists uq_work_order_media_client_mutation
  on public.work_order_media(shop_id, client_mutation_id)
  where client_mutation_id is not null;

create or replace function public.validate_work_order_media_scope()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_work_order_shop_id uuid;
  v_line_shop_id uuid;
  v_line_work_order_id uuid;
begin
  select shop_id
    into v_work_order_shop_id
  from public.work_orders
  where id = new.work_order_id;

  if v_work_order_shop_id is null or v_work_order_shop_id <> new.shop_id then
    raise exception using errcode = 'P0001', message = 'WORK_ORDER_MEDIA_SCOPE_MISMATCH';
  end if;

  if new.work_order_line_id is not null then
    select shop_id, work_order_id
      into v_line_shop_id, v_line_work_order_id
    from public.work_order_lines
    where id = new.work_order_line_id;

    if v_line_shop_id is null
       or v_line_shop_id <> new.shop_id
       or v_line_work_order_id is distinct from new.work_order_id then
      raise exception using errcode = 'P0001', message = 'WORK_ORDER_MEDIA_LINE_SCOPE_MISMATCH';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_work_order_media_scope on public.work_order_media;
create trigger trg_validate_work_order_media_scope
before insert or update on public.work_order_media
for each row execute function public.validate_work_order_media_scope();

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
begin
  if new.bucket_id <> 'job-photos' then
    return new;
  end if;

  v_match := regexp_match(
    new.name,
    '^wo/([0-9a-fA-F-]{36})/lines/([0-9a-fA-F-]{36})/([^/]+)$'
  );
  if v_match is null then
    raise exception using errcode = 'P0001', message = 'INVALID_JOB_PHOTO_STORAGE_PATH';
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
    raise exception using errcode = 'P0001', message = 'JOB_PHOTO_WORK_ORDER_LINE_MISMATCH';
  end if;

  v_owner_text := coalesce(to_jsonb(new) ->> 'owner_id', to_jsonb(new) ->> 'owner');
  if v_owner_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_owner_id := v_owner_text::uuid;
  end if;

  v_content_type := coalesce(
    to_jsonb(new) #>> '{metadata,mimetype}',
    to_jsonb(new) #>> '{metadata,contentType}',
    'image/jpeg'
  );
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
    'photo',
    new.bucket_id,
    new.name,
    v_file_name,
    v_content_type,
    v_file_size,
    'technician_job_photo',
    nullif(v_client_mutation_id, '')
  )
  on conflict (shop_id, storage_bucket, storage_path)
    where storage_bucket is not null and storage_path is not null
  do update set
    work_order_id = excluded.work_order_id,
    work_order_line_id = excluded.work_order_line_id,
    user_id = coalesce(public.work_order_media.user_id, excluded.user_id),
    file_name = excluded.file_name,
    content_type = excluded.content_type,
    file_size = coalesce(excluded.file_size, public.work_order_media.file_size),
    source = excluded.source,
    client_mutation_id = coalesce(public.work_order_media.client_mutation_id, excluded.client_mutation_id);

  return new;
end;
$$;

drop trigger if exists trg_register_job_photo_storage_object on storage.objects;
create trigger trg_register_job_photo_storage_object
after insert or update of name, metadata on storage.objects
for each row
when (new.bucket_id = 'job-photos')
execute function public.register_job_photo_storage_object();

alter table public.work_order_media enable row level security;

drop policy if exists work_order_media_shop_select on public.work_order_media;
create policy work_order_media_shop_select
on public.work_order_media
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.shop_id = work_order_media.shop_id
  )
);

drop policy if exists work_order_media_shop_insert on public.work_order_media;
create policy work_order_media_shop_insert
on public.work_order_media
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.shop_id = work_order_media.shop_id
  )
);

commit;
