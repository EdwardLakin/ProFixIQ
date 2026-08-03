begin;

create table if not exists public.owner_report_summaries (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  period_kind text not null
    check (period_kind in ('weekly', 'monthly', 'quarterly', 'yearly')),
  period_start timestamptz not null,
  period_end timestamptz not null,
  metric_version text not null default 'owner_intelligence_v1',
  snapshot_hash text not null,
  summary_text text not null,
  summary_source text not null
    check (summary_source in ('ai', 'deterministic')),
  model text,
  generated_by uuid references auth.users(id) on delete set null,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint owner_report_summaries_period_valid_chk
    check (period_end > period_start),
  constraint owner_report_summaries_text_present_chk
    check (length(trim(summary_text)) > 0),
  unique (
    shop_id,
    period_kind,
    period_start,
    period_end,
    metric_version,
    snapshot_hash
  )
);

create index if not exists owner_report_summaries_shop_period_idx
  on public.owner_report_summaries (
    shop_id,
    period_kind,
    period_start desc,
    generated_at desc
  );

create or replace function public.owner_report_summaries_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists owner_report_summaries_touch_updated_at
  on public.owner_report_summaries;
create trigger owner_report_summaries_touch_updated_at
before update on public.owner_report_summaries
for each row
execute function public.owner_report_summaries_touch_updated_at();

alter table public.owner_report_summaries enable row level security;

drop policy if exists owner_report_summaries_financial_select
  on public.owner_report_summaries;
create policy owner_report_summaries_financial_select
on public.owner_report_summaries
for select
to authenticated
using (
  shop_id = public.current_shop_id()
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.shop_id = owner_report_summaries.shop_id
      and lower(trim(coalesce(p.role, ''))) in ('owner', 'admin', 'manager')
  )
);

drop policy if exists owner_report_summaries_financial_insert
  on public.owner_report_summaries;
create policy owner_report_summaries_financial_insert
on public.owner_report_summaries
for insert
to authenticated
with check (
  shop_id = public.current_shop_id()
  and generated_by = auth.uid()
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.shop_id = owner_report_summaries.shop_id
      and lower(trim(coalesce(p.role, ''))) in ('owner', 'admin', 'manager')
  )
);

drop policy if exists owner_report_summaries_financial_update
  on public.owner_report_summaries;
create policy owner_report_summaries_financial_update
on public.owner_report_summaries
for update
to authenticated
using (
  shop_id = public.current_shop_id()
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.shop_id = owner_report_summaries.shop_id
      and lower(trim(coalesce(p.role, ''))) in ('owner', 'admin', 'manager')
  )
)
with check (
  shop_id = public.current_shop_id()
  and generated_by = auth.uid()
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.shop_id = owner_report_summaries.shop_id
      and lower(trim(coalesce(p.role, ''))) in ('owner', 'admin', 'manager')
  )
);

grant select, insert, update on public.owner_report_summaries to authenticated;

commit;
