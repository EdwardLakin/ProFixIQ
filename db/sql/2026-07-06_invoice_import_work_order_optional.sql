-- Historical invoice imports are read-only billing records. They should attach to a
-- matched work order when one exists, but they must not require one or create one.
--
-- Root cause guardrail: some deployed databases have an invoice validation trigger
-- whose function raises: 'invoice <id> must belong to a work_order'. That trigger is
-- valid for normal in-app invoice creation, but it blocks historical imports whose
-- metadata marks them as imported/read_only/import_type=invoice_csv.

create or replace function public.invoice_is_historical_import(p_metadata jsonb)
returns boolean
language sql
immutable
as $$
  select coalesce((p_metadata->>'imported')::boolean, false)
     and coalesce((p_metadata->>'read_only')::boolean, false)
     and p_metadata->>'import_type' = 'invoice_csv'
$$;

create or replace function public.enforce_invoice_work_order_for_active_invoices()
returns trigger
language plpgsql
as $$
begin
  if new.work_order_id is null
     and not public.invoice_is_historical_import(coalesce(new.metadata::jsonb, '{}'::jsonb)) then
    raise exception 'invoice % must belong to a work_order', new.id
      using errcode = '23514';
  end if;

  return new;
end;
$$;

do $$
declare
  trigger_record record;
begin
  -- Remove only invoice triggers backed by functions containing the exact failure
  -- message. This preserves unrelated invoice triggers/policies/defaults.
  for trigger_record in
    select t.tgname
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_proc p on p.oid = t.tgfoid
    where n.nspname = 'public'
      and c.relname = 'invoices'
      and not t.tgisinternal
      and pg_get_functiondef(p.oid) like '%must belong to a work_order%'
  loop
    execute format('drop trigger if exists %I on public.invoices', trigger_record.tgname);
  end loop;
end $$;

drop trigger if exists enforce_invoice_work_order_for_active_invoices on public.invoices;
create trigger enforce_invoice_work_order_for_active_invoices
before insert or update of work_order_id, metadata
on public.invoices
for each row
execute function public.enforce_invoice_work_order_for_active_invoices();

comment on function public.enforce_invoice_work_order_for_active_invoices() is
  'Requires work_order_id for normal active invoices while allowing read-only historical invoice_csv imports to keep work_order_id null.';

-- Align deployed invoice check constraints with the historical invoice import path.
-- Exact prior definitions observed in deployed environments:
--   invoices_work_order_id_required_chk: check (work_order_id is not null)
--   invoices_paid_requires_paid_at_chk: check (status <> 'paid' or paid_at is not null)
-- The replacement keeps normal invoices protected while allowing only read-only
-- invoice_csv imports to omit work_order_id. The paid rule remains unchanged.

alter table public.invoices
  drop constraint if exists invoices_work_order_id_required_chk;

alter table public.invoices
  add constraint invoices_work_order_id_required_chk
  check (
    work_order_id is not null
    or public.invoice_is_historical_import(coalesce(metadata::jsonb, '{}'::jsonb))
  ) not valid;

alter table public.invoices
  drop constraint if exists invoices_paid_requires_paid_at_chk;

alter table public.invoices
  add constraint invoices_paid_requires_paid_at_chk
  check (status <> 'paid' or paid_at is not null) not valid;

comment on constraint invoices_work_order_id_required_chk on public.invoices is
  'Normal invoices require work_order_id; read-only historical invoice_csv imports may store legacy invoice records without creating active work orders.';

comment on constraint invoices_paid_requires_paid_at_chk on public.invoices is
  'Paid invoices, including historical imports, must include paid_at; the importer derives paid_at from paid_date or invoice_date for paid CSV rows.';
