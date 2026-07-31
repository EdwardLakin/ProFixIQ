import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260731162625_repair_parts_quote_linkage_p0.sql",
  "utf8",
);
const sourceLineIndexMigration = readFileSync(
  "supabase/migrations/20260731165621_index_parts_quote_source_line.sql",
  "utf8",
);
const quoteRoute = readFileSync(
  "app/api/parts/requests/items/[itemId]/quote-save/route.ts",
  "utf8",
);
const queuePage = readFileSync("app/parts/requests/page.tsx", "utf8");
const detailPage = readFileSync("app/parts/requests/[id]/page.tsx", "utf8");

describe("P0 parts quote linkage repair", () => {
  it("uses one manual-part quote-readiness contract in SQL and application code", () => {
    expect(migration).toContain(
      "create or replace function public.part_request_item_is_quote_ready",
    );
    expect(migration).toContain("p_requested_part_number");
    expect(migration).not.toContain(
      "v_new_status::text = 'quoted'\n          and nullif(trim(pri.description), '') is not null\n          and pri.part_id is not null",
    );
    expect(quoteRoute).toContain("isPartsRequestItemPriced");
    expect(quoteRoute).not.toContain("const quoteComplete = Boolean(partId)");
    expect(queuePage).toContain("requested_part_number");
    expect(detailPage).toContain("const selectedPartId = String(");
  });

  it("creates one canonical quote line for a source repair line", () => {
    expect(migration).toContain(
      "create or replace function public.parts_ensure_request_quote_line",
    );
    expect(migration).toContain("source_work_order_line_id");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("set quote_line_id = v_quote.id");
    expect(migration).toContain("set quote_line_id = v_quote.id,");
    expect(sourceLineIndexMigration).toContain(
      "on public.work_order_quote_lines(source_work_order_line_id)",
    );
  });

  it("rolls up every active request batch instead of only the newest", () => {
    expect(migration).toContain("with active_requests as");
    expect(migration).toContain("'source', 'canonical_active_part_requests'");
    expect(migration).toContain("'request_ids', to_jsonb(v_request_ids)");
    expect(migration).toContain("'batch_count', cardinality(v_request_ids)");
    expect(migration).not.toContain("and pri.request_id = v_request_id");
  });

  it("reuses and activates the originating line on approval", () => {
    expect(migration).toContain(
      "coalesce(v_quote.work_order_line_id, v_quote.source_work_order_line_id)",
    );
    expect(migration).toContain(
      "create or replace function public.activate_source_work_order_line_from_quote",
    );
    expect(migration).toContain("approval_state = 'approved'");
    expect(migration).toContain("then 'active'");
    expect(migration).toContain(
      "perform set_config('app.parts_lifecycle_reconciling', '1', true)",
    );
  });

  it("backfills by invariant without embedding production row IDs", () => {
    expect(migration).toContain("Safe generic backfill");
    expect(migration).toContain(
      "perform public.parts_reconcile_request_lifecycle(r.id)",
    );
    expect(migration).not.toContain("cffb0b81-4dfb-466d-bcc3-94a35acf24e6");
    expect(migration).not.toContain("6027521a-af49-4116-9d64-629deea334a0");
  });

  it("removes anonymous write paths and enables RLS", () => {
    expect(migration).toContain(
      "drop function if exists public.create_part_request_with_items(uuid, jsonb, uuid, text)",
    );
    for (const table of [
      "parts_backup_20260708",
      "parts_lifecycle_operations",
      "shop_users",
    ]) {
      expect(migration).toContain(
        `alter table public.${table} enable row level security`,
      );
    }
    expect(migration).toContain("shop_users_actor_can_manage");
  });

  it("labels request batches and repair lines without exposing database IDs", () => {
    expect(detailPage).toContain('"Initial request"');
    expect(detailPage).toContain("`Additional request ${batchNumber}`");
    expect(detailPage).toContain("Repair line:");
    expect(detailPage).not.toContain("#{r.req.id.slice(0, 8)}");
  });
});
