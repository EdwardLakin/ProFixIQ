begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';

create index if not exists idx_work_order_quote_lines_source_work_order_line_id
  on public.work_order_quote_lines(source_work_order_line_id)
  where source_work_order_line_id is not null;

notify pgrst, 'reload schema';

commit;
