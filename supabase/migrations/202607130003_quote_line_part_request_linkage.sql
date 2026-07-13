-- Forward-only repair for live databases missing durable quote-line linkage.
-- Additive, nullable, and safe for existing data; no backfill required.

alter table public.part_requests
  add column if not exists quote_line_id uuid null;

alter table public.part_request_items
  add column if not exists quote_line_id uuid null;

comment on column public.part_requests.quote_line_id is
  'Canonical pre-approval work_order_quote_lines row that originated this parts request, when applicable. Nullable for existing/manual requests.';

comment on column public.part_request_items.quote_line_id is
  'Canonical pre-approval work_order_quote_lines row that originated this parts request item, when applicable. Nullable for existing/manual items.';

do $$
begin
  if to_regclass('public.work_order_quote_lines') is not null then
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
