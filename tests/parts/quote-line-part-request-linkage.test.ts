import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/202607130003_quote_line_part_request_linkage.sql",
  "utf8",
);
const canonicalQuoteHelper = readFileSync(
  "features/work-orders/lib/work-orders/canonicalQuoteLines.ts",
  "utf8",
);
const generatedTypes = readFileSync(
  "features/shared/types/types/supabase.ts",
  "utf8",
);

describe("quote-line part request linkage schema", () => {
  it("adds nullable quote_line_id columns idempotently without backfill", () => {
    expect(migration).toContain("alter table public.part_requests");
    expect(migration).toContain("add column if not exists quote_line_id uuid null");
    expect(migration).toContain("alter table public.part_request_items");
    expect(migration).not.toMatch(/update\s+public\.(part_requests|part_request_items)/i);
  });

  it("adds quote-line foreign keys only when the canonical quote table exists", () => {
    expect(migration).toContain("to_regclass('public.work_order_quote_lines') is not null");
    expect(migration).toContain("constraint part_requests_quote_line_id_fkey");
    expect(migration).toContain("constraint part_request_items_quote_line_id_fkey");
    expect(migration).toContain("references public.work_order_quote_lines(id)");
    expect(migration).toContain("on delete set null");
  });

  it("adds the intended lookup indexes", () => {
    expect(migration).toContain("idx_part_requests_shop_quote_line");
    expect(migration).toContain("on public.part_requests (shop_id, quote_line_id)");
    expect(migration).toContain("idx_part_request_items_shop_quote_line");
    expect(migration).toContain("on public.part_request_items (shop_id, quote_line_id)");
    expect(migration).toContain("idx_part_request_items_work_order_quote_line");
    expect(migration).toContain("on public.part_request_items (work_order_id, quote_line_id)");
  });

  it("matches the canonical quote helper's selected and inserted quote_line_id columns", () => {
    expect(canonicalQuoteHelper).toContain('if (!source || parts.length === 0) continue;');
    expect(canonicalQuoteHelper).toContain('.eq("shop_id", input.shopId)');
    expect(canonicalQuoteHelper).toContain('.eq("work_order_id", input.workOrderId)');
    expect(canonicalQuoteHelper).toContain('.eq("quote_line_id", input.quoteLineId)');
    expect(canonicalQuoteHelper).toContain('quote_line_id: input.quoteLineId');
    expect(canonicalQuoteHelper).toContain('.eq("quote_line_id", quoteLineId)');
    expect(canonicalQuoteHelper).toContain('quote_line_id: quoteLineId');
    expect(canonicalQuoteHelper).toContain('.select("id, description")');
    expect(generatedTypes).toContain("quote_line_id: string | null");
    expect(generatedTypes).toContain("quote_line_id?: string | null");
  });
});
