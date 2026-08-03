-- Supply lifecycle columns required by the work-order-parts relationship index.
-- Existing environments are left unchanged when these columns already exist.

alter table public.work_order_parts
  add column if not exists is_active boolean not null default true,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists lifecycle_status text not null default 'requested';

comment on column public.work_order_parts.is_active is
  'Whether this work-order part remains the active lifecycle record.';
