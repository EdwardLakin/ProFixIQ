begin;

-- Older production shops can predate the invoice dependency baseline. Because
-- that baseline uses CREATE TABLE IF NOT EXISTS, it cannot add this audit
-- column to an already-existing invoices table. Invoice finalization writes
-- the actor through this column, so reconcile the shape explicitly.
alter table public.invoices
  add column if not exists created_by uuid;

do $block$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.invoices'::regclass
      and conname = 'invoices_created_by_fkey'
  ) then
    alter table public.invoices
      add constraint invoices_created_by_fkey
      foreign key (created_by)
      references auth.users(id)
      on delete set null
      not valid;
  end if;
end
$block$;

alter table public.invoices
  validate constraint invoices_created_by_fkey;

do $block$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'invoices'
      and column_name = 'created_by'
      and data_type = 'uuid'
  ) then
    raise exception 'invoices.created_by reconciliation failed';
  end if;
end
$block$;

commit;
