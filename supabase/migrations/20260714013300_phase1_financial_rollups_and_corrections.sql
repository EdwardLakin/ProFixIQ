begin;

alter table public.invoices
  add column if not exists paid_total numeric(14,2) not null default 0,
  add column if not exists refunded_total numeric(14,2) not null default 0,
  add column if not exists outstanding_total numeric(14,2) not null default 0,
  add column if not exists paid_at timestamptz;

alter table public.work_orders
  add column if not exists payment_status text not null default 'unpaid',
  add column if not exists outstanding_balance numeric(14,2) not null default 0,
  add column if not exists paid_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'work_orders_payment_status_check'
      and conrelid = 'public.work_orders'::regclass
  ) then
    alter table public.work_orders
      add constraint work_orders_payment_status_check
      check (payment_status in ('unpaid','partially_paid','paid','refunded','disputed'));
  end if;
end $$;

create or replace function public.sync_invoice_version_financial_rollup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_net_paid numeric;
  v_payment_status text;
begin
  v_net_paid := greatest(new.paid_total - new.refunded_total, 0);
  v_payment_status := case
    when new.lifecycle_status = 'paid' and new.outstanding_total <= 0.01 then 'paid'
    when new.lifecycle_status = 'partially_paid' then 'partially_paid'
    when new.refunded_total > 0 and v_net_paid <= 0.01 then 'refunded'
    else 'unpaid'
  end;

  update public.invoices
  set
    status = case
      when new.lifecycle_status = 'paid' then 'paid'
      when new.lifecycle_status = 'partially_paid' then 'partially_paid'
      when new.lifecycle_status = 'voided' then 'voided'
      when new.lifecycle_status = 'superseded' then 'superseded'
      else status
    end,
    paid_total = new.paid_total,
    refunded_total = new.refunded_total,
    outstanding_total = new.outstanding_total,
    paid_at = case when new.lifecycle_status = 'paid' then coalesce(paid_at, now()) else null end
  where id = new.invoice_id;

  update public.work_orders
  set
    payment_status = v_payment_status,
    outstanding_balance = new.outstanding_total,
    paid_at = case when v_payment_status = 'paid' then coalesce(paid_at, now()) else null end
  where id = new.work_order_id
    and shop_id = new.shop_id;

  return new;
end;
$$;

drop trigger if exists invoice_versions_sync_financial_rollup on public.invoice_versions;
create trigger invoice_versions_sync_financial_rollup
after insert or update of lifecycle_status, paid_total, refunded_total
on public.invoice_versions
for each row execute function public.sync_invoice_version_financial_rollup();

create or replace function public.guard_invoice_version_reissue()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1 from public.invoice_versions iv
    where iv.work_order_id = new.work_order_id
      and iv.id <> new.id
      and iv.lifecycle_status = 'paid'
      and iv.outstanding_total <= 0.01
  ) then
    raise exception 'Paid invoices require a credit or explicit correction before reissue';
  end if;
  return new;
end;
$$;

drop trigger if exists invoice_versions_guard_reissue on public.invoice_versions;
create trigger invoice_versions_guard_reissue
before insert on public.invoice_versions
for each row execute function public.guard_invoice_version_reissue();

create or replace function public.link_superseded_invoice_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous_id uuid;
begin
  select id into v_previous_id
  from public.invoice_versions
  where work_order_id = new.work_order_id
    and id <> new.id
    and lifecycle_status in ('issued','partially_paid')
  order by version_number desc
  limit 1
  for update;

  if v_previous_id is not null then
    update public.invoice_versions
    set lifecycle_status = 'superseded', superseded_by_invoice_version_id = new.id
    where id = v_previous_id;

    update public.invoice_versions
    set supersedes_invoice_version_id = v_previous_id
    where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists invoice_versions_link_superseded on public.invoice_versions;
create trigger invoice_versions_link_superseded
after insert on public.invoice_versions
for each row execute function public.link_superseded_invoice_version();

create or replace function public.void_invoice_version(
  p_shop_id uuid,
  p_invoice_version_id uuid,
  p_actor_user_id uuid,
  p_reason text,
  p_operation_key text
) returns public.invoice_versions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version public.invoice_versions;
begin
  if coalesce(trim(p_reason),'') = '' then raise exception 'Void reason is required'; end if;
  if coalesce(trim(p_operation_key),'') = '' then raise exception 'Operation key is required'; end if;

  select * into v_version
  from public.invoice_versions
  where id = p_invoice_version_id and shop_id = p_shop_id
  for update;
  if not found then raise exception 'Invoice version not found'; end if;
  if v_version.lifecycle_status = 'voided' then return v_version; end if;
  if v_version.paid_total - v_version.refunded_total > 0.01 then
    raise exception 'Paid invoices must be refunded or credited before voiding';
  end if;
  if v_version.lifecycle_status not in ('issued','partially_paid','superseded') then
    raise exception 'Invoice version cannot be voided from current state';
  end if;

  update public.invoice_versions
  set lifecycle_status = 'voided', voided_at = now(), voided_by = p_actor_user_id, void_reason = p_reason
  where id = p_invoice_version_id
  returning * into v_version;

  insert into public.financial_domain_outbox(shop_id,aggregate_type,aggregate_id,event_type,dedupe_key,payload)
  values(p_shop_id,'invoice_version',v_version.id,'invoice.voided','invoice.voided:' || p_operation_key,
    jsonb_build_object('invoice_version_id',v_version.id,'work_order_id',v_version.work_order_id,'reason',p_reason))
  on conflict do nothing;

  return v_version;
end;
$$;

revoke all on function public.void_invoice_version(uuid,uuid,uuid,text,text) from public, authenticated;
grant execute on function public.void_invoice_version(uuid,uuid,uuid,text,text) to service_role;

update public.invoice_versions set updated_at = updated_at;

commit;
