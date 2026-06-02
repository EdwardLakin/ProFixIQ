-- Phase 5D-1: durable quote-line linkage for canonical parts requests.
-- Adds nullable quote_line_id links from canonical part_requests / part_request_items
-- to work_order_quote_lines without backfilling or constraining existing rows.

alter table public.part_requests
  add column if not exists quote_line_id uuid;

alter table public.part_request_items
  add column if not exists quote_line_id uuid;

comment on column public.part_requests.quote_line_id is
  'Canonical pre-approval work_order_quote_lines row that originated this parts request, when applicable. Nullable for existing/manual requests.';

comment on column public.part_request_items.quote_line_id is
  'Canonical pre-approval work_order_quote_lines row that originated this parts request item, when applicable. Nullable for existing/manual items.';

do $$
begin
  if to_regclass('public.work_order_quote_lines') is null then
    raise notice 'Skipping quote_line_id foreign keys: public.work_order_quote_lines does not exist.';
  else
    if not exists (
      select 1
      from pg_constraint
      where conname = 'part_requests_quote_line_id_fkey'
        and conrelid = 'public.part_requests'::regclass
    ) then
      alter table public.part_requests
        add constraint part_requests_quote_line_id_fkey
        foreign key (quote_line_id)
        references public.work_order_quote_lines(id)
        on delete set null;
    end if;

    if not exists (
      select 1
      from pg_constraint
      where conname = 'part_request_items_quote_line_id_fkey'
        and conrelid = 'public.part_request_items'::regclass
    ) then
      alter table public.part_request_items
        add constraint part_request_items_quote_line_id_fkey
        foreign key (quote_line_id)
        references public.work_order_quote_lines(id)
        on delete set null;
    end if;
  end if;
end $$;

create index if not exists idx_part_requests_shop_quote_line
  on public.part_requests (shop_id, quote_line_id);

create index if not exists idx_part_request_items_shop_quote_line
  on public.part_request_items (shop_id, quote_line_id);

create index if not exists idx_part_request_items_work_order_quote_line
  on public.part_request_items (work_order_id, quote_line_id);
