import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync(
  "app/api/parts/requests/[requestId]/dismiss-stale/route.ts",
  "utf8",
);
const migration = readFileSync(
  "supabase/migrations/20260919153000_dismiss_stale_placeholder_parts_requests.sql",
  "utf8",
);
const mobileFlow = readFileSync(
  "features/parts/mobile/MobilePartsWorkOrderFlow.tsx",
  "utf8",
);

describe("stale placeholder Parts request cleanup", () => {
  it("uses a shop-scoped atomic RPC and never hard deletes", () => {
    expect(route).toContain("parts_dismiss_stale_placeholder_request_atomic");
    expect(route).toContain('allowRoles: ["owner", "admin", "manager", "advisor", "parts"]');
    expect(migration).toContain("PARTS_STALE_REQUEST_HAS_ACTIVITY");
    expect(migration).toContain("PARTS_STALE_REQUEST_ALREADY_MATERIALIZED");
    expect(migration).toContain("set status = 'cancelled'::public.part_request_item_status");
    expect(migration).toContain("set status = 'cancelled'::public.part_request_status");
    expect(migration).not.toContain("delete from public.part_requests");
    expect(migration).not.toContain("delete from public.part_request_items");
  });

  it("protects requests with real fulfillment or pricing activity", () => {
    for (const guard of [
      "item.part_id is not null",
      "item.vendor_id is not null",
      "item.po_id is not null",
      "item.location_id is not null",
      "coalesce(item.quoted_price, 0) <> 0",
      "coalesce(item.qty_ordered, 0) > 0",
      "coalesce(item.qty_received, 0) > 0",
      "coalesce(item.qty_consumed, 0) > 0",
    ]) {
      expect(migration).toContain(guard);
    }
  });

  it("marks the linked quote as explicitly no-parts-required", () => {
    expect(migration).toContain("sync_quote_line_pricing_from_parts");
    expect(migration).toContain("'{parts_required}'");
    expect(migration).toContain("'{no_parts_required}'");
  });

  it("offers a mobile no-parts cleanup only for untouched needs-quote placeholders", () => {
    expect(mobileFlow).toContain("canOfferNoPartsRequired");
    expect(mobileFlow).toContain("No parts required");
    expect(mobileFlow).toContain("/dismiss-stale");
    expect(mobileFlow).toContain("Stale request moved to history");
  });
});
