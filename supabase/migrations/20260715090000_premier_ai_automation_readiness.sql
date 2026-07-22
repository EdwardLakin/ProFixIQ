begin;

create table if not exists public.ai_automation_capability_settings (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  capability text not null,
  enabled boolean not null default false,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_automation_capability_settings_capability_chk check (
    capability in (
      'appointment_intake', 'customer_status_updates',
      'work_order_line_creation', 'quote_preparation',
      'approval_request_delivery', 'parts_ordering',
      'appointment_reminders', 'advisor_follow_up',
      'invoice_preparation', 'payment_collection'
    )
  ),
  unique (shop_id, capability)
);

create table if not exists public.ai_automation_shop_controls (
  shop_id uuid primary key references public.shops(id) on delete cascade,
  automation_paused boolean not null default false,
  pause_reason text,
  paused_at timestamptz,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_automation_evidence (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  capability text not null,
  evidence_key text not null,
  outcome text not null default 'observed',
  source text not null,
  source_entity_type text,
  source_entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  recorded_by uuid references public.profiles(id) on delete set null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_automation_evidence_capability_chk check (
    capability in (
      'appointment_intake', 'customer_status_updates',
      'work_order_line_creation', 'quote_preparation',
      'approval_request_delivery', 'parts_ordering',
      'appointment_reminders', 'advisor_follow_up',
      'invoice_preparation', 'payment_collection'
    )
  ),
  constraint ai_automation_evidence_outcome_chk check (
    outcome in ('observed', 'matched', 'corrected', 'exception', 'critical_failure')
  ),
  unique (shop_id, capability, evidence_key)
);

create index if not exists idx_ai_automation_evidence_readiness
  on public.ai_automation_evidence(shop_id, capability, occurred_at desc);

alter table public.ai_automation_capability_settings enable row level security;
alter table public.ai_automation_shop_controls enable row level security;
alter table public.ai_automation_evidence enable row level security;

create policy ai_automation_capability_settings_shop_select
  on public.ai_automation_capability_settings for select to authenticated
  using (shop_id = public.shop_id_for(auth.uid()));
create policy ai_automation_capability_settings_owner_insert
  on public.ai_automation_capability_settings for insert to authenticated
  with check (
    shop_id = public.shop_id_for(auth.uid()) and exists (
      select 1 from public.profiles p where p.id = auth.uid()
        and p.shop_id = ai_automation_capability_settings.shop_id
        and lower(coalesce(p.role, '')) in ('owner', 'admin')
    )
  );
create policy ai_automation_capability_settings_owner_update
  on public.ai_automation_capability_settings for update to authenticated
  using (
    shop_id = public.shop_id_for(auth.uid()) and exists (
      select 1 from public.profiles p where p.id = auth.uid()
        and p.shop_id = ai_automation_capability_settings.shop_id
        and lower(coalesce(p.role, '')) in ('owner', 'admin')
    )
  )
  with check (shop_id = public.shop_id_for(auth.uid()));

create policy ai_automation_shop_controls_shop_select
  on public.ai_automation_shop_controls for select to authenticated
  using (shop_id = public.shop_id_for(auth.uid()));
create policy ai_automation_shop_controls_owner_insert
  on public.ai_automation_shop_controls for insert to authenticated
  with check (
    shop_id = public.shop_id_for(auth.uid()) and exists (
      select 1 from public.profiles p where p.id = auth.uid()
        and p.shop_id = ai_automation_shop_controls.shop_id
        and lower(coalesce(p.role, '')) in ('owner', 'admin')
    )
  );
create policy ai_automation_shop_controls_owner_update
  on public.ai_automation_shop_controls for update to authenticated
  using (
    shop_id = public.shop_id_for(auth.uid()) and exists (
      select 1 from public.profiles p where p.id = auth.uid()
        and p.shop_id = ai_automation_shop_controls.shop_id
        and lower(coalesce(p.role, '')) in ('owner', 'admin')
    )
  )
  with check (shop_id = public.shop_id_for(auth.uid()));

create policy ai_automation_evidence_shop_select
  on public.ai_automation_evidence for select to authenticated
  using (shop_id = public.shop_id_for(auth.uid()));

grant select, insert, update on public.ai_automation_capability_settings to authenticated;
grant select, insert, update on public.ai_automation_shop_controls to authenticated;
grant select on public.ai_automation_evidence to authenticated;

create or replace function public.ai_automation_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_ai_automation_capability_settings_updated_at
before update on public.ai_automation_capability_settings
for each row execute function public.ai_automation_touch_updated_at();
create trigger trg_ai_automation_shop_controls_updated_at
before update on public.ai_automation_shop_controls
for each row execute function public.ai_automation_touch_updated_at();
create trigger trg_ai_automation_evidence_updated_at
before update on public.ai_automation_evidence
for each row execute function public.ai_automation_touch_updated_at();

insert into public.ai_automation_shop_controls (shop_id, automation_paused)
select id, false from public.shops on conflict (shop_id) do nothing;

create or replace function public.capture_ai_automation_observation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_data jsonb := to_jsonb(new);
  capability_name text := tg_argv[0];
  source_name text := tg_argv[1];
  entity_id_column text := coalesce(tg_argv[2], 'id');
  suffix_column text := nullif(coalesce(tg_argv[3], ''), '');
  entity_id uuid;
  evidence_suffix text := '';
begin
  entity_id := nullif(row_data ->> entity_id_column, '')::uuid;
  if nullif(row_data ->> 'shop_id', '') is null or entity_id is null then
    return new;
  end if;
  if suffix_column is not null then
    evidence_suffix := ':' || coalesce(row_data ->> suffix_column, 'unknown');
  end if;

  insert into public.ai_automation_evidence (
    shop_id, capability, evidence_key, outcome, source,
    source_entity_type, source_entity_id, metadata, occurred_at
  ) values (
    (row_data ->> 'shop_id')::uuid,
    capability_name,
    source_name || ':' || entity_id::text || evidence_suffix,
    'observed', source_name, tg_table_name, entity_id,
    jsonb_strip_nulls(jsonb_build_object(
      'status', row_data ->> 'status',
      'starts_at', row_data ->> 'starts_at',
      'ends_at', row_data ->> 'ends_at'
    )),
    now()
  )
  on conflict (shop_id, capability, evidence_key) do update
  set metadata = excluded.metadata,
      occurred_at = excluded.occurred_at,
      updated_at = now();
  return new;
end;
$$;

create trigger trg_ai_observe_appointment_intake
after insert or update of starts_at, status on public.bookings
for each row when (new.starts_at is not null)
execute function public.capture_ai_automation_observation(
  'appointment_intake', 'booking', 'id', ''
);
create trigger trg_ai_observe_customer_status
after insert or update of status on public.work_orders
for each row execute function public.capture_ai_automation_observation(
  'customer_status_updates', 'work_order_status', 'id', 'status'
);
create trigger trg_ai_observe_work_order_lines
after insert or update on public.work_order_intelligence
for each row execute function public.capture_ai_automation_observation(
  'work_order_line_creation', 'completed_work_order', 'work_order_id', ''
);
create trigger trg_ai_observe_quote_preparation
after insert or update on public.work_order_intelligence
for each row execute function public.capture_ai_automation_observation(
  'quote_preparation', 'completed_work_order', 'work_order_id', ''
);
create trigger trg_ai_observe_parts_ordering
after insert or update on public.purchase_orders
for each row execute function public.capture_ai_automation_observation(
  'parts_ordering', 'purchase_order', 'id', ''
);
create trigger trg_ai_observe_invoice_preparation
after insert or update on public.invoices
for each row execute function public.capture_ai_automation_observation(
  'invoice_preparation', 'invoice', 'id', ''
);
create trigger trg_ai_observe_payment_collection
after insert or update on public.payments
for each row execute function public.capture_ai_automation_observation(
  'payment_collection', 'payment', 'id', ''
);

insert into public.ai_automation_evidence (
  shop_id, capability, evidence_key, outcome, source,
  source_entity_type, source_entity_id, metadata, occurred_at
)
select booking.shop_id, 'appointment_intake',
  'booking:' || booking.id::text, 'observed',
  'booking', 'bookings', booking.id,
  jsonb_build_object(
    'status', booking.status,
    'starts_at', booking.starts_at,
    'ends_at', booking.ends_at
  ),
  coalesce(booking.created_at, now())
from public.bookings booking
where booking.starts_at is not null and booking.shop_id is not null
on conflict (shop_id, capability, evidence_key) do nothing;

insert into public.ai_automation_evidence (
  shop_id, capability, evidence_key, outcome, source,
  source_entity_type, source_entity_id, metadata, occurred_at
)
select work_order.shop_id, 'customer_status_updates',
  'work_order_status:' || work_order.id::text || ':' || coalesce(work_order.status, 'unknown'),
  'observed', 'work_order_status', 'work_orders', work_order.id,
  jsonb_build_object('status', work_order.status),
  coalesce(work_order.updated_at, work_order.created_at, now())
from public.work_orders work_order
where work_order.shop_id is not null
on conflict (shop_id, capability, evidence_key) do nothing;

insert into public.ai_automation_evidence (
  shop_id, capability, evidence_key, outcome, source,
  source_entity_type, source_entity_id, metadata, occurred_at
)
select distinct intelligence.shop_id, capability.name,
  'completed_work_order:' || intelligence.work_order_id::text,
  'observed', 'completed_repair_backfill', 'work_order',
  intelligence.work_order_id, '{}'::jsonb, coalesce(intelligence.created_at, now())
from public.work_order_intelligence intelligence
cross join (values ('work_order_line_creation'), ('quote_preparation')) as capability(name)
on conflict (shop_id, capability, evidence_key) do nothing;

insert into public.ai_automation_evidence (
  shop_id, capability, evidence_key, outcome, source,
  source_entity_type, source_entity_id, metadata, occurred_at
)
select purchase_order.shop_id, 'parts_ordering',
  'purchase_order:' || purchase_order.id::text, 'observed',
  'purchase_order', 'purchase_orders', purchase_order.id,
  jsonb_build_object('status', purchase_order.status),
  coalesce(purchase_order.ordered_at, purchase_order.created_at, now())
from public.purchase_orders purchase_order
on conflict (shop_id, capability, evidence_key) do nothing;

insert into public.ai_automation_evidence (
  shop_id, capability, evidence_key, outcome, source,
  source_entity_type, source_entity_id, metadata, occurred_at
)
select invoice.shop_id, 'invoice_preparation',
  'invoice:' || invoice.id::text, 'observed',
  'invoice', 'invoices', invoice.id,
  jsonb_build_object('status', invoice.status),
  coalesce(invoice.updated_at, invoice.created_at, now())
from public.invoices invoice
on conflict (shop_id, capability, evidence_key) do nothing;

insert into public.ai_automation_evidence (
  shop_id, capability, evidence_key, outcome, source,
  source_entity_type, source_entity_id, metadata, occurred_at
)
select payment.shop_id, 'payment_collection',
  'payment:' || payment.id::text, 'observed',
  'payment', 'payments', payment.id,
  jsonb_build_object('status', payment.status),
  coalesce(payment.updated_at, payment.created_at, now())
from public.payments payment
on conflict (shop_id, capability, evidence_key) do nothing;

commit;