-- Digital receipt capture for manual POS payments.
--
-- payment_events/payment_receipts (phase1 financial foundation) record the
-- transaction itself but have no attachment column, and there is no generic
-- "attach a file to X" facility in this codebase - every feature that
-- uploads files rolls its own bucket + table (work_order_media/job-photos
-- is the closest precedent). This follows that exact pattern: a private
-- bucket, a storage-object trigger that server-side resolves shop_id from
-- the path (the client never sets tenant scope itself), and RLS scoped to
-- staff of the owning shop.
--
-- The receipt is uploaded before the payment_event exists (the employee
-- photographs the terminal receipt, then submits the payment form), so the
-- trigger registers the attachment with payment_event_id left null; the
-- manual-payment route links it to the newly created payment_event in the
-- same request once post_payment_event returns.

begin;

create table if not exists public.payment_receipt_attachments (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  payment_event_id uuid references public.payment_events(id) on delete set null,
  invoice_version_id uuid references public.invoice_versions(id) on delete set null,
  storage_bucket text not null,
  storage_path text not null,
  content_type text,
  file_size bigint,
  uploaded_by_user_id uuid,
  client_mutation_id text,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_payment_receipt_attachments_storage_object
  on public.payment_receipt_attachments (shop_id, storage_bucket, storage_path);

create unique index if not exists uq_payment_receipt_attachments_client_mutation
  on public.payment_receipt_attachments (shop_id, client_mutation_id)
  where client_mutation_id is not null;

create index if not exists idx_payment_receipt_attachments_payment_event
  on public.payment_receipt_attachments (payment_event_id)
  where payment_event_id is not null;

create index if not exists idx_payment_receipt_attachments_work_order
  on public.payment_receipt_attachments (work_order_id);

alter table public.payment_receipt_attachments enable row level security;

drop policy if exists payment_receipt_attachments_shop_select on public.payment_receipt_attachments;
create policy payment_receipt_attachments_shop_select
on public.payment_receipt_attachments
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.shop_id = payment_receipt_attachments.shop_id
  )
);

revoke all on public.payment_receipt_attachments from anon;
grant select on public.payment_receipt_attachments to authenticated;
grant select, insert, update, delete on public.payment_receipt_attachments to service_role;

-- Storage bucket + path-scoped RLS, following provision_vehicle_media_buckets
-- exactly: create only if absent, private, no MIME allowlist (photos and
-- PDFs both need to pass), object paths are wo/{work_order_id}/payments/{file}.
insert into storage.buckets (id, name, public, file_size_limit)
values ('payment-receipts', 'payment-receipts', false, 15728640)
on conflict (id) do nothing;

create or replace function public.payment_receipt_object_in_shop(p_work_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.work_orders w
    join public.profiles p on p.id = auth.uid()
    where w.id = p_work_order_id
      and p.shop_id = w.shop_id
      and p.role in (
        'owner', 'admin', 'manager', 'advisor', 'service', 'service_advisor',
        'lead_hand', 'foreman'
      )
  );
$$;

revoke all on function public.payment_receipt_object_in_shop(uuid) from public, anon;
grant execute on function public.payment_receipt_object_in_shop(uuid)
  to authenticated, service_role;

drop policy if exists payment_receipt_objects_select on storage.objects;
create policy payment_receipt_objects_select
on storage.objects for select to authenticated
using (
  bucket_id = 'payment-receipts'
  and public.payment_receipt_object_in_shop(
    nullif((storage.foldername(name))[2], '')::uuid
  )
);

drop policy if exists payment_receipt_objects_insert on storage.objects;
create policy payment_receipt_objects_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'payment-receipts'
  and public.payment_receipt_object_in_shop(
    nullif((storage.foldername(name))[2], '')::uuid
  )
);

drop policy if exists payment_receipt_objects_delete on storage.objects;
create policy payment_receipt_objects_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'payment-receipts'
  and public.payment_receipt_object_in_shop(
    nullif((storage.foldername(name))[2], '')::uuid
  )
);

create or replace function public.register_payment_receipt_storage_object()
returns trigger
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  v_match text[];
  v_work_order_id uuid;
  v_shop_id uuid;
  v_owner_text text;
  v_owner_id uuid;
  v_file_name text;
  v_client_mutation_id text;
  v_content_type text;
  v_file_size bigint;
begin
  if new.bucket_id <> 'payment-receipts' then
    return new;
  end if;

  v_match := regexp_match(
    new.name,
    '^wo/([0-9a-fA-F-]{36})/payments/([^/]+)$'
  );
  if v_match is null then
    raise exception using errcode = 'P0001', message = 'INVALID_PAYMENT_RECEIPT_STORAGE_PATH';
  end if;

  v_work_order_id := v_match[1]::uuid;
  v_file_name := v_match[2];
  v_client_mutation_id := split_part(v_file_name, '_', 1);

  select shop_id
    into v_shop_id
  from public.work_orders
  where id = v_work_order_id;

  if v_shop_id is null then
    raise exception using errcode = 'P0001', message = 'PAYMENT_RECEIPT_WORK_ORDER_NOT_FOUND';
  end if;

  v_owner_text := coalesce(to_jsonb(new) ->> 'owner_id', to_jsonb(new) ->> 'owner');
  if v_owner_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_owner_id := v_owner_text::uuid;
  end if;

  v_content_type := coalesce(
    to_jsonb(new) #>> '{metadata,mimetype}',
    to_jsonb(new) #>> '{metadata,contentType}',
    'application/octet-stream'
  );
  begin
    v_file_size := nullif(to_jsonb(new) #>> '{metadata,size}', '')::bigint;
  exception when invalid_text_representation then
    v_file_size := null;
  end;

  insert into public.payment_receipt_attachments (
    shop_id,
    work_order_id,
    storage_bucket,
    storage_path,
    content_type,
    file_size,
    uploaded_by_user_id,
    client_mutation_id
  ) values (
    v_shop_id,
    v_work_order_id,
    new.bucket_id,
    new.name,
    v_content_type,
    v_file_size,
    v_owner_id,
    nullif(v_client_mutation_id, '')
  )
  on conflict (shop_id, storage_bucket, storage_path)
  do update set
    content_type = excluded.content_type,
    file_size = coalesce(excluded.file_size, public.payment_receipt_attachments.file_size),
    client_mutation_id = coalesce(public.payment_receipt_attachments.client_mutation_id, excluded.client_mutation_id);

  return new;
end;
$$;

drop trigger if exists trg_register_payment_receipt_storage_object on storage.objects;
create trigger trg_register_payment_receipt_storage_object
after insert or update of name, metadata on storage.objects
for each row
when (new.bucket_id = 'payment-receipts')
execute function public.register_payment_receipt_storage_object();

comment on function public.payment_receipt_object_in_shop(uuid) is
  'Authorizes a payment-receipts storage object against the caller''s shop and financial-management role. Object paths are wo/{work_order_id}/payments/{file}.';

notify pgrst, 'reload schema';

commit;
