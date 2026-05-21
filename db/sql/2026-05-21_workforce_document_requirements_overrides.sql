-- Workforce Required Document Matrix Phase B2.1 (migration-only)
-- Adds shop-scoped override storage. Code-level defaults remain authoritative fallback.
-- Existing behavior requires zero rows in this table.

create table if not exists public.workforce_document_requirements (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  workforce_role text,
  workforce_category text,
  doc_type text not null,
  label text not null,
  is_required boolean not null default true,
  expires_required boolean not null default false,
  expires_warning_days integer not null default 30,
  accept_statuses text[] not null default array['active','approved','accepted']::text[],
  review_statuses text[] not null default array['received','pending','review','needs_review']::text[],
  priority integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  constraint workforce_document_requirements_doc_type_chk
    check (doc_type in ('drivers_license','certification','tax_form','other')),
  constraint workforce_document_requirements_expires_warning_days_chk
    check (expires_warning_days between 0 and 365),
  constraint workforce_document_requirements_accept_statuses_not_empty_chk
    check (coalesce(array_length(accept_statuses, 1), 0) > 0),
  constraint workforce_document_requirements_review_statuses_not_empty_chk
    check (coalesce(array_length(review_statuses, 1), 0) > 0)
);

comment on table public.workforce_document_requirements is
  'Shop-specific workforce required document overrides. Code defaults remain fallback; no rows are required for existing behavior.';

create index if not exists idx_workforce_doc_requirements_shop_active
  on public.workforce_document_requirements (shop_id, is_active);

create index if not exists idx_workforce_doc_requirements_target_doc_active
  on public.workforce_document_requirements (shop_id, workforce_role, workforce_category, doc_type, is_active);

create index if not exists idx_workforce_doc_requirements_shop_doc_active
  on public.workforce_document_requirements (shop_id, doc_type, is_active);

create unique index if not exists workforce_doc_requirements_active_target_doc_uniq
  on public.workforce_document_requirements (
    shop_id,
    coalesce(workforce_role, ''),
    coalesce(workforce_category, ''),
    doc_type
  )
  where is_active = true;

alter table public.workforce_document_requirements enable row level security;

drop policy if exists workforce_document_requirements_shop_select on public.workforce_document_requirements;
create policy workforce_document_requirements_shop_select
  on public.workforce_document_requirements
  for select
  to authenticated
  using (shop_id = public.current_shop_id());

drop policy if exists workforce_document_requirements_shop_insert on public.workforce_document_requirements;
create policy workforce_document_requirements_shop_insert
  on public.workforce_document_requirements
  for insert
  to authenticated
  with check (shop_id = public.current_shop_id());

drop policy if exists workforce_document_requirements_shop_update on public.workforce_document_requirements;
create policy workforce_document_requirements_shop_update
  on public.workforce_document_requirements
  for update
  to authenticated
  using (shop_id = public.current_shop_id())
  with check (shop_id = public.current_shop_id());

-- Intentionally no DELETE policy: hard delete is disallowed through RLS.
-- Future write-path API enforces owner/admin role checks.

drop trigger if exists trg_workforce_document_requirements_updated_at on public.workforce_document_requirements;
create trigger trg_workforce_document_requirements_updated_at
  before update on public.workforce_document_requirements
  for each row
  execute function public.update_updated_at_column();
