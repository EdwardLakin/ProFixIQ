import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

const desktop = read("app/work-orders/[id]/Client.tsx");
const mobile = read("features/work-orders/mobile/MobileWorkOrderClient.tsx");
const focusedJob = read("features/work-orders/mobile/MobileFocusedJob.tsx");
const offlineRoute = read("app/api/offline/technician-work-orders/route.ts");
const offlineTypes = read(
  "features/work-orders/mobile/technicianOfflineTypes.ts",
);
const contextLoader = read(
  "features/work-orders/lib/data/loadCanonicalWorkOrderLineContext.ts",
);
const migration = read(
  "supabase/migrations/20260726231759_work_order_detail_source_of_truth.sql",
);

describe("cross-device work-order source of truth", () => {
  it("makes desktop and mobile use the same tenant-scoped line-context loader", () => {
    expect(desktop).toContain("loadCanonicalWorkOrderLineContext");
    expect(mobile).toContain("loadCanonicalWorkOrderLineContext");
    expect(contextLoader).toContain('.from("work_order_parts")');
    expect(contextLoader).toContain('.from("work_order_part_allocations")');
    expect(contextLoader).toContain('.from("part_requests")');
    expect(contextLoader).toContain('.from("work_order_line_technicians")');
    expect(contextLoader).toContain('.in("work_order_id", workOrderIds)');
    expect(contextLoader).toContain('.eq("shop_id", input.shopId)');
    expect(contextLoader).toContain('.eq("is_active", true)');
  });

  it("renders canonical parts and pricing on mobile instead of an empty placeholder", () => {
    expect(mobile).not.toContain("parts={[]}");
    expect(mobile).toContain("lineContext.allocationsByLine[ln.id]");
    expect(mobile).toContain("lineContext.canonicalPartsByLine[line.id]");
    expect(mobile).toContain("resolveWorkOrderLinePricing");
    expect(mobile).toContain("partsCount={pricing?.partsCount ?? 0}");
  });

  it("refreshes mobile when any canonical line-context table changes", () => {
    for (const table of [
      "work_order_parts",
      "work_order_part_allocations",
      "part_requests",
      "work_order_line_technicians",
    ]) {
      expect(mobile).toContain(`table: "${table}"`);
    }
  });

  it("carries the same context and labor rate into downloaded work orders", () => {
    expect(offlineRoute).toContain("loadCanonicalWorkOrderLineContext");
    expect(offlineRoute).toContain("lineContext:");
    expect(offlineRoute).toContain("shopLaborRate");
    expect(offlineTypes).toContain(
      "lineContext: CanonicalWorkOrderLineContext",
    );
    expect(offlineTypes).toContain("shopLaborRate: number | null");
    expect(focusedJob).toContain(
      "cached.snapshot.lineContext?.allocationsByLine[id]",
    );
    expect(focusedJob).toContain(
      "cached.snapshot.lineContext?.canonicalPartsByLine[id]",
    );
  });

  it("allows only role-authorized staff or assigned mechanics to read parts", () => {
    expect(migration).toContain("create policy work_order_parts_role_select");
    expect(migration).toContain("shop_id = (select public.current_shop_id())");
    expect(migration).toContain(
      "(select public.profixiq_current_role()) = 'mechanic'",
    );
    expect(migration).toContain("public.profixiq_is_assigned_to_line");
    expect(migration).toContain("public.profixiq_is_assigned_to_work_order");
    expect(migration).toContain(
      "create policy work_order_parts_customer_portal_select",
    );
    expect(migration).not.toContain("for update\nto authenticated");
  });
});
