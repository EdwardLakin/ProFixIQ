import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const route = read("app/api/offline/technician-work-orders/route.ts");
const download = read(
  "features/work-orders/mobile/technicianOfflineDownload.ts",
);
const queuePage = read("app/mobile/tech/queue/page.tsx");
const queue = read("features/mobile/technician/MobileTechnicianQueue.tsx");

describe("technician assigned-work offline download", () => {
  it("authenticates the actor and resolves only their shop assignments", () => {
    expect(route).toContain("auth.getUser()");
    expect(route).toContain("canPerformAssignedWork");
    expect(route).toContain("assigned_tech_id.eq.${user.id}");
    expect(route).toContain("assigned_to.eq.${user.id}");
    expect(route).toContain('from("work_order_line_technicians")');
    expect(route).toContain('.eq("technician_id", user.id)');
    expect(route).toContain('.eq("shop_id", profile.shop_id)');
  });

  it("keeps authenticated table policies around downloaded business records", () => {
    expect(route).toContain(
      "normal table policies remain the final authorization boundary",
    );
    expect(route).toContain('authClient.rpc(\n    "set_current_shop_id"');
    expect(route.indexOf('"set_current_shop_id"')).toBeLessThan(
      route.indexOf('.from("work_orders")'),
    );
    expect(route).toContain("chunks(workOrderIds)");
    expect(route).not.toContain(".limit(50)");
    expect(route).toContain("await authClient");
    expect(route).toMatch(/authClient\s*\.from\("work_order_lines"\)/);
    expect(route).toMatch(/authClient\s*\.from\("work_order_quote_lines"\)/);
    expect(route).toContain("quotesResult.error");
    expect(route).toContain('"Cache-Control": "private, no-store"');
  });

  it("writes the bundle and every detail alias under one tenant scope", () => {
    expect(download).toContain("result.scope.userId !== args.scope.userId");
    expect(download).toContain("result.scope.shopId !== args.scope.shopId");
    expect(download).toContain('BUNDLE_KIND = "technician-assigned-work"');
    expect(download).toContain('kind: "mobile-work-order-detail"');
    expect(download).toContain("item.workOrder.custom_id");
    expect(download).toContain("await cacheTechnicianOfflineBundle(result)");
    expect(download).toContain("listOfflineSnapshots");
    expect(download).toContain("existingDetails");
    expect(download).toContain("staleAliases");
    expect(download).toContain("removeOfflineSnapshots");
  });

  it("loads the assigned queue from IndexedDB and exposes an explicit download", () => {
    expect(queuePage).toContain("MobileTechnicianQueue");
    expect(queue).toContain("getCachedTechnicianWork");
    expect(queue).toContain("applyOfflineBundle(cached.data)");
    expect(queue).toContain("Download assigned work");
    expect(queue).toContain("navigator.storage?.persist?.()");
    expect(queue).toContain("No assigned work has been downloaded");
  });
});
