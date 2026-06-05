-- Customer import dedupe guard
--
-- Production currently contains duplicate customer external_id values per shop, so a
-- plain unique index would fail during deployment. This migration safely:
-- 1. normalizes blank/whitespace-only external_id values to NULL;
-- 2. trims leading/trailing whitespace from populated external_id values;
-- 3. installs a trigger that rejects any new normalized same-shop duplicate;
-- 4. creates the normalized partial unique index only when existing data is clean.
--
-- Duplicate audit query to run before/after cleanup:
-- select shop_id,
--        lower(btrim(external_id)) as normalized_external_id,
--        count(*) as duplicate_count,
--        array_agg(id order by created_at nulls last, id) as customer_ids
-- from public.customers
-- where external_id is not null and btrim(external_id) <> ''
-- group by shop_id, lower(btrim(external_id))
-- having count(*) > 1
-- order by duplicate_count desc, normalized_external_id;

update public.customers
set external_id = null
where external_id is not null
  and btrim(external_id) = '';

update public.customers
set external_id = btrim(external_id)
where external_id is not null
  and external_id <> btrim(external_id);

create or replace function public.prevent_duplicate_customer_external_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.shop_id is null or new.external_id is null or btrim(new.external_id) = '' then
    return new;
  end if;

  new.external_id := btrim(new.external_id);

  -- Serialize competing writes for the same shop/external_id pair so the guard
  -- remains effective even before the unique index can be created on dirty data.
  perform pg_advisory_xact_lock(
    hashtextextended(new.shop_id::text || ':' || lower(new.external_id), 0)
  );

  if exists (
    select 1
    from public.customers c
    where c.shop_id = new.shop_id
      and c.id <> new.id
      and c.external_id is not null
      and lower(btrim(c.external_id)) = lower(new.external_id)
  ) then
    raise exception 'duplicate customer external_id % for shop %', new.external_id, new.shop_id
      using errcode = '23505', constraint = 'customers_shop_external_id_normalized_uq';
  end if;

  return new;
end;
$$;

drop trigger if exists customers_prevent_duplicate_external_id on public.customers;

create trigger customers_prevent_duplicate_external_id
before insert or update of shop_id, external_id on public.customers
for each row
execute function public.prevent_duplicate_customer_external_id();

do $$
begin
  if not exists (
    select 1
    from (
      select shop_id, lower(btrim(external_id)) as normalized_external_id
      from public.customers
      where external_id is not null and btrim(external_id) <> ''
      group by shop_id, lower(btrim(external_id))
      having count(*) > 1
    ) duplicates
  ) then
    create unique index if not exists customers_shop_external_id_normalized_uq
      on public.customers (shop_id, lower(btrim(external_id)))
      where external_id is not null and btrim(external_id) <> '';
  else
    raise warning 'Skipped customers_shop_external_id_normalized_uq because duplicate customer external_id rows still exist. Run the duplicate audit query in this migration, merge duplicate customers, then create the index.';
  end if;
end;
$$;
