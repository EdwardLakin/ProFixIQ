-- Complete the historical baseline with canonical part-request dependencies.
--
-- The original production schema predates the repository migration chain and
-- did not include the canonical singular part-request tables in db/sql/schema.sql.
-- Empty databases receive those dependencies before 202607050002. Existing
-- databases are validated against the full baseline manifest and fail closed.

do $$
declare
  v_mode text;
  v_missing text[];
begin
  select mode into v_mode
  from public.profixiq_schema_baselines
  where version = '20260705000000';

  if v_mode is null then
    raise exception using errcode = 'P0001',
      message = 'PROFIXIQ_BASELINE_MISSING: 20260705000000 must run first.';
  end if;

  if v_mode = 'existing' then
    select array_agg(required_table order by required_table)
      into v_missing
    from unnest(array[
      'activity_logs',
      'agent_events',
      'agent_runs',
      'ai_requests',
      'api_keys',
      'apps',
      'audit_logs',
      'bookings',
      'chat_participants',
      'chats',
      'conversation_participants',
      'conversations',
      'customer_bookings',
      'customer_portal_invites',
      'customer_quotes',
      'customer_settings',
      'customers',
      'decoded_vins',
      'defective_parts',
      'dtc_logs',
      'email_logs',
      'email_suppressions',
      'employee_documents',
      'feature_reads',
      'followups',
      'history',
      'inspection_items',
      'inspection_photos',
      'inspection_sessions',
      'inspection_templates',
      'inspections',
      'media_uploads',
      'menu_item_parts',
      'menu_items',
      'menu_pricing',
      'message_reads',
      'messages',
      'notifications',
      'part_barcodes',
      'part_compatibility',
      'part_purchases',
      'part_request_items',
      'part_request_lines',
      'part_requests',
      'part_returns',
      'part_stock',
      'part_stock_summary',
      'part_suppliers',
      'part_warranties',
      'parts',
      'parts_barcodes',
      'parts_messages',
      'parts_quotes',
      'parts_request_messages',
      'parts_requests',
      'profiles',
      'punch_events',
      'purchase_order_items',
      'purchase_order_lines',
      'purchase_orders',
      'quote_lines',
      'shop_hours',
      'shop_parts',
      'shop_profiles',
      'shop_ratings',
      'shop_reviews',
      'shop_schedules',
      'shop_settings',
      'shop_time_off',
      'shop_time_slots',
      'shops',
      'stock_locations',
      'stock_moves',
      'suppliers',
      'tech_sessions',
      'tech_shifts',
      'template_items',
      'usage_logs',
      'user_app_layouts',
      'user_plans',
      'user_widget_layouts',
      'vehicle_media',
      'vehicle_photos',
      'vehicle_recalls',
      'vehicles',
      'vendor_part_numbers',
      'vin_decodes',
      'warranties',
      'warranty_claims',
      'widget_instances',
      'widgets',
      'work_order_approvals',
      'work_order_line_history',
      'work_order_lines',
      'work_order_media',
      'work_order_part_allocations',
      'work_order_parts',
      'work_orders'
    ]::text[]) as required(required_table)
    where to_regclass('public.' || required_table) is null;

    if coalesce(array_length(v_missing, 1), 0) > 0 then
      raise exception using errcode = 'P0001',
        message = 'PARTIAL_PROFIXIQ_SCHEMA: required baseline tables are missing: ' || array_to_string(v_missing, ', ');
    end if;

    return;
  end if;

  if v_mode <> 'bootstrap' then
    raise exception using errcode = 'P0001',
      message = 'PROFIXIQ_BASELINE_MODE_INVALID: ' || coalesce(v_mode, '<null>');
  end if;
end
$$;

-- Types used by later parts lifecycle migrations.
do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'part_request_status'
  ) then
    create type public.part_request_status as enum (
      'requested',
      'quoted',
      'approved',
      'fulfilled',
      'rejected',
      'cancelled'
    );
  end if;

  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'part_request_item_status'
  ) then
    create type public.part_request_item_status as enum (
      'requested',
      'quoted',
      'awaiting_customer_approval',
      'approved',
      'reserved',
      'picking',
      'picked',
      'ordered',
      'partially_received',
      'received',
      'consumed',
      'cancelled'
    );
  end if;
end
$$;

create table if not exists public.part_requests (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  work_order_id uuid references public.work_orders(id) on delete cascade,
  job_id uuid references public.work_order_lines(id) on delete set null,
  quote_line_id uuid,
  requested_by uuid references auth.users(id) on delete set null,
  assigned_to uuid references auth.users(id) on delete set null,
  status public.part_request_status not null default 'requested',
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.part_request_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.part_requests(id) on delete cascade,
  shop_id uuid references public.shops(id) on delete cascade,
  work_order_id uuid references public.work_orders(id) on delete cascade,
  work_order_line_id uuid references public.work_order_lines(id) on delete set null,
  quote_line_id uuid,
  menu_item_id uuid,
  part_id uuid references public.parts(id) on delete set null,
  source_work_order_part_id uuid references public.work_order_parts(id) on delete set null,
  location_id uuid references public.stock_locations(id) on delete set null,
  po_id uuid references public.purchase_orders(id) on delete set null,
  vendor_id uuid,
  description text not null,
  vendor text,
  qty numeric(12,2) not null default 1,
  qty_requested numeric(12,2) not null default 0,
  qty_approved numeric(12,2) not null default 0,
  qty_assigned numeric(12,2) not null default 0,
  qty_reserved numeric(12,2) not null default 0,
  qty_picked numeric(12,2) not null default 0,
  qty_ordered numeric(12,2) not null default 0,
  qty_received numeric(12,2) not null default 0,
  qty_consumed numeric(12,2) not null default 0,
  qty_returned numeric(12,2) not null default 0,
  approved boolean not null default false,
  status public.part_request_item_status not null default 'requested',
  unit_cost numeric(12,2),
  unit_price numeric(12,2),
  quoted_price numeric(12,2),
  markup_pct numeric(8,4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.part_request_lines (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.part_requests(id) on delete cascade,
  work_order_line_id uuid not null references public.work_order_lines(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (request_id, work_order_line_id)
);

create index if not exists idx_part_requests_shop_work_order
  on public.part_requests(shop_id, work_order_id, created_at desc);

create index if not exists idx_part_request_items_request
  on public.part_request_items(request_id, created_at);

create index if not exists idx_part_request_items_shop_work_order
  on public.part_request_items(shop_id, work_order_id, work_order_line_id);

alter table public.part_requests enable row level security;
alter table public.part_request_items enable row level security;
alter table public.part_request_lines enable row level security;
