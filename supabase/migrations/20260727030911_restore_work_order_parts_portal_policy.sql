begin;

alter table public.work_order_parts enable row level security;

drop policy if exists work_order_parts_customer_portal_select
  on public.work_order_parts;

create policy work_order_parts_customer_portal_select
  on public.work_order_parts
  for select
  to authenticated
  using (
    public.profixiq_is_portal_customer_work_order(work_order_id)
  );

notify pgrst, 'reload schema';

commit;
