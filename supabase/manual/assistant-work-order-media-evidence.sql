-- AI Assistant diagnostic image evidence for work orders.
-- Additive metadata on the existing canonical work_order_media table.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'work_order_media',
  'work_order_media',
  true,
  6291456,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.work_order_media
  add column if not exists work_order_line_id uuid references public.work_order_lines(id) on delete set null,
  add column if not exists storage_bucket text,
  add column if not exists storage_path text,
  add column if not exists file_name text,
  add column if not exists content_type text,
  add column if not exists file_size bigint,
  add column if not exists note text,
  add column if not exists source text;

create index if not exists idx_work_order_media_line_id on public.work_order_media(work_order_line_id);
create index if not exists idx_work_order_media_shop_source on public.work_order_media(shop_id, source);
create index if not exists idx_work_order_media_storage_path on public.work_order_media(storage_path) where storage_path is not null;

create or replace function public.validate_work_order_media_scope()
returns trigger
language plpgsql
as $$
declare
  wo_shop_id uuid;
  line_shop_id uuid;
  line_work_order_id uuid;
begin
  select shop_id into wo_shop_id from public.work_orders where id = new.work_order_id;
  if wo_shop_id is null or wo_shop_id <> new.shop_id then
    raise exception 'work_order_media.shop_id must match work_orders.shop_id';
  end if;

  if new.work_order_line_id is not null then
    select shop_id, work_order_id into line_shop_id, line_work_order_id
    from public.work_order_lines
    where id = new.work_order_line_id;

    if line_shop_id is null or line_shop_id <> new.shop_id then
      raise exception 'work_order_media.work_order_line_id must match shop_id';
    end if;
    if line_work_order_id is distinct from new.work_order_id then
      raise exception 'work_order_media.work_order_line_id must match work_order_id';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_work_order_media_scope on public.work_order_media;
create trigger trg_validate_work_order_media_scope
before insert or update on public.work_order_media
for each row execute function public.validate_work_order_media_scope();

alter table public.work_order_media enable row level security;

-- Keep policies conservative and shop-scoped. These are additive/replaceable names only.
drop policy if exists work_order_media_shop_select on public.work_order_media;
create policy work_order_media_shop_select on public.work_order_media
for select using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.shop_id = work_order_media.shop_id
  )
);

drop policy if exists work_order_media_shop_insert on public.work_order_media;
create policy work_order_media_shop_insert on public.work_order_media
for insert with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.shop_id = work_order_media.shop_id
  )
);
