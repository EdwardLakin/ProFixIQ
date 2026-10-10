-- One-off data repair for WO-000001 (quote line e4c5d0a8-6c15-44a2-9d00-0928c7d835c8).
--
-- Customer approval of the "Steer 1 Left Lining/Shoe" recommendation reused the
-- Brake System Inspection job as its work-order line instead of creating a
-- repair line. This script:
--   1. creates the dedicated, punchable repair line for the approved quote,
--   2. moves the quote's Parts Request and part items onto it,
--   3. points the quote at the new line, and
--   4. restores the inspection job to its pre-approval state.
--
-- Run only AFTER migration 20261010223000_fix_inspection_quote_approval_source_line
-- is applied (it stops the approval trigger from re-activating the inspection
-- line when the quote is repointed). Idempotent: exits without changes once the
-- quote no longer points at its inspection source line.
--
-- Preview (read-only):
--   select q.id, q.status, q.work_order_line_id, l.job_type, l.price_estimate
--   from public.work_order_quote_lines q
--   join public.work_order_lines l on l.id = q.work_order_line_id
--   where q.work_order_line_id = q.source_work_order_line_id
--     and lower(l.job_type::text) = 'inspection';

begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';

do $$
declare
  c_quote_id constant uuid := 'e4c5d0a8-6c15-44a2-9d00-0928c7d835c8';
  v_quote public.work_order_quote_lines%rowtype;
  v_source public.work_order_lines%rowtype;
  v_new_id uuid;
  v_actor uuid;
  v_actor_text text;
  v_guard_state text;
  v_requests integer;
  v_items integer;
begin
  select * into v_quote
  from public.work_order_quote_lines
  where id = c_quote_id
  for update;
  if not found then
    raise exception 'Quote line % not found', c_quote_id;
  end if;

  if v_quote.work_order_line_id is null
     or v_quote.work_order_line_id is distinct from v_quote.source_work_order_line_id then
    raise notice 'Quote line % is not merged into its source line; nothing to repair', c_quote_id;
    return;
  end if;

  select * into v_source
  from public.work_order_lines
  where id = v_quote.work_order_line_id
    and shop_id = v_quote.shop_id
    and work_order_id = v_quote.work_order_id
  for update;
  if not found then
    raise exception 'Source work-order line % not found', v_quote.work_order_line_id;
  end if;
  if lower(btrim(coalesce(v_source.job_type::text, ''))) <> 'inspection'
     and nullif(btrim(coalesce(v_quote.metadata ->> 'source_inspection_id', '')), '') is null then
    raise exception 'Quote line % is not inspection-sourced; refusing to repair', c_quote_id;
  end if;

  v_actor_text := v_quote.metadata ->> 'customer_actor_user_id';
  if v_actor_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_actor := v_actor_text::uuid;
  end if;

  select id into v_new_id
  from public.work_order_lines
  where shop_id = v_quote.shop_id
    and work_order_id = v_quote.work_order_id
    and (
      external_id = 'quote_line:' || v_quote.id::text
      or source_row_id = v_quote.id
    )
  order by created_at
  limit 1
  for update;

  if v_new_id is null then
    insert into public.work_order_lines(
      shop_id, work_order_id, vehicle_id, description, job_type,
      status, line_status, approval_state, approval_at, approval_by,
      quoted_at, labor_time, price_estimate, complaint, cause,
      correction, notes, external_id, source_row_id, intake_json
    ) values (
      v_quote.shop_id,
      v_quote.work_order_id,
      v_quote.vehicle_id,
      coalesce(nullif(trim(v_quote.description), ''), nullif(trim(v_quote.ai_complaint), ''), 'Approved quote line'),
      case
        when lower(trim(coalesce(v_quote.job_type::text, ''))) in (
          'diagnosis', 'inspection', 'maintenance', 'repair', 'tech-suggested'
        ) then lower(trim(v_quote.job_type::text))
        else 'repair'
      end,
      'awaiting',
      'authorized',
      'approved',
      coalesce(v_quote.approved_at, now()),
      v_actor,
      coalesce(v_quote.sent_to_customer_at, v_quote.created_at, now()),
      coalesce(v_quote.labor_hours, v_quote.est_labor_hours),
      coalesce(v_quote.grand_total, v_quote.subtotal, coalesce(v_quote.labor_total, 0) + coalesce(v_quote.parts_total, 0)),
      coalesce(nullif(trim(v_quote.ai_complaint), ''), nullif(trim(v_quote.notes), ''), nullif(trim(v_quote.description), '')),
      nullif(trim(v_quote.ai_cause), ''),
      nullif(trim(v_quote.ai_correction), ''),
      nullif(trim(v_quote.notes), ''),
      'quote_line:' || v_quote.id::text,
      v_quote.id,
      jsonb_build_object(
        'source', 'work_order_quote_lines',
        'quote_line_id', v_quote.id,
        'quote_line_metadata', coalesce(v_quote.metadata, '{}'::jsonb),
        'customer_approved_at', v_quote.approved_at,
        'customer_approved_by', v_actor,
        'labor_total', v_quote.labor_total,
        'parts_total', v_quote.parts_total,
        'subtotal', v_quote.subtotal,
        'tax_total', v_quote.tax_total,
        'grand_total', v_quote.grand_total,
        'repaired_from_source_line_id', v_source.id
      )
    ) returning id into v_new_id;
  end if;

  -- part_request_items anchors are immutable once set; this one-off move is the
  -- only sanctioned exception. Restore the guard before leaving the block.
  select t.tgenabled::text into v_guard_state
  from pg_catalog.pg_trigger t
  where t.tgrelid = 'public.part_request_items'::regclass
    and t.tgname = 'trg_prevent_part_request_item_anchor_changes';
  if v_guard_state is distinct from 'O' then
    raise exception 'Unexpected anchor guard state %', v_guard_state;
  end if;
  execute 'alter table public.part_request_items disable trigger trg_prevent_part_request_item_anchor_changes';

  update public.part_requests
  set job_id = v_new_id
  where shop_id = v_quote.shop_id
    and work_order_id = v_quote.work_order_id
    and quote_line_id = v_quote.id
    and job_id = v_source.id;
  get diagnostics v_requests = row_count;

  update public.part_request_items
  set work_order_line_id = v_new_id
  where shop_id = v_quote.shop_id
    and work_order_id = v_quote.work_order_id
    and quote_line_id = v_quote.id
    and work_order_line_id = v_source.id;
  get diagnostics v_items = row_count;

  execute 'alter table public.part_request_items enable trigger trg_prevent_part_request_item_anchor_changes';

  update public.work_order_quote_lines
  set work_order_line_id = v_new_id,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'materialized_work_order_line_id', v_new_id
      )
  where id = v_quote.id;

  -- Undo what the approval trigger wrote onto the inspection job.
  update public.work_order_lines
  set price_estimate = null,
      quoted_at = null,
      approval_state = null,
      line_status = null,
      approval_at = null,
      approval_by = null,
      status = 'awaiting',
      updated_at = now()
  where id = v_source.id;

  if not exists (
       select 1 from public.work_order_lines
       where id = v_new_id and external_id = 'quote_line:' || v_quote.id::text
     )
     or exists (
       select 1 from public.part_request_items
       where quote_line_id = v_quote.id and work_order_line_id is distinct from v_new_id
     )
     or exists (
       select 1 from public.part_requests
       where quote_line_id = v_quote.id and job_id is distinct from v_new_id
     )
     or not exists (
       select 1 from public.work_order_quote_lines
       where id = v_quote.id and work_order_line_id = v_new_id
     ) then
    raise exception 'WO repair postcheck failed for quote %', v_quote.id;
  end if;

  raise notice 'Repaired quote %: repair line %, % request(s) and % item(s) moved off inspection line %',
    v_quote.id, v_new_id, v_requests, v_items, v_source.id;
end;
$$;

commit;
