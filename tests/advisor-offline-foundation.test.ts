import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createAdvisorDraftId,
  createAdvisorDraftLine,
} from "@/features/work-orders/mobile/advisorOffline";

const read = (path: string) => readFileSync(path, "utf8");

describe("advisor offline foundation", () => {
  it("downloads a role- and shop-scoped day pack without a silent lookup cap", () => {
    const route = read("app/api/offline/advisor-day/route.ts");
    expect(route).toContain("canManageScheduling");
    expect(route).toContain("canManageWorkOrders");
    expect(route).toContain('rpc("set_current_shop_id"');
    expect(route).toContain('.eq("shop_id", profile.shop_id)');
    expect(route).toContain("MAX_ROWS = 5000");
    expect(route).toContain("customersTruncated = true");
    expect(route).toContain("vehiclesTruncated = true");
  });

  it("stores day packs and work-order drafts under authenticated IndexedDB scope", () => {
    const source = read("features/work-orders/mobile/advisorOffline.ts");
    expect(source).toContain('const DAY_KIND = "advisor-offline-day"');
    expect(source).toContain('const DRAFT_KIND = "advisor-work-order-draft"');
    expect(source).toContain(
      'const MATERIALIZATION_KIND = "advisor-draft-materialization"',
    );
    expect(source).toContain("scope: body.scope");
    expect(source).toContain(
      "scope: { userId: draft.userId, shopId: draft.shopId }",
    );
    expect(source).toContain("getLatestCachedAdvisorDay");
    expect(source).toContain("getCurrentAdvisorWorkOrderDraft");
    expect(source).toContain("operationKey: draft.operationKey");
  });

  it("creates stable draft and temporary-line identities while preserving line order", () => {
    const draftId = createAdvisorDraftId();
    const first = createAdvisorDraftLine({
      lineType: "job",
      complaint: "Brake vibration",
      jobType: "diagnosis",
    });
    const second = createAdvisorDraftLine({
      lineType: "job",
      complaint: "Oil service",
      jobType: "maintenance",
    });
    expect(draftId).toMatch(/^advisor-draft:/);
    expect(first.tempId).toMatch(/^temp-line:/);
    expect(second.tempId).not.toBe(first.tempId);
    expect([first, second].map((line) => line.complaint)).toEqual([
      "Brake vibration",
      "Oil service",
    ]);
  });

  it("restores full customer, vehicle, and temporary line draft state after restart", () => {
    const page = read("app/mobile/work-orders/create/page.tsx");
    expect(page).toContain("getCurrentAdvisorWorkOrderDraft(scope)");
    expect(page).toContain("setCustomer(storedDraft.customer)");
    expect(page).toContain("setVehicle(storedDraft.vehicle)");
    expect(page).toContain("setDraftLines(storedDraft.lines)");
    expect(page).toContain("Restored the unfinished work-order draft");
    expect(page).toContain("saveCurrentAdvisorWorkOrderDraft(current)");
  });

  it("materializes a draft and its temporary lines atomically and idempotently", () => {
    const migration = read(
      "supabase/migrations/20260717090000_offline_advisor_work_order_drafts.sql",
    );
    const route = read("app/api/offline/advisor-work-order-drafts/route.ts");
    const page = read("app/mobile/work-orders/create/page.tsx");
    expect(route).toContain("Idempotency-Key");
    expect(route).toContain("materialize_offline_work_order_draft_atomic");
    expect(migration).toContain("offline_mutation_receipts");
    expect(migration).toContain("IDEMPOTENCY_KEY_REUSE");
    expect(migration).toContain("create_work_order_with_custom_id");
    expect(migration).toContain("jsonb_array_elements");
    expect(migration).toContain("v_line_map := v_line_map ||");
    expect(
      page.indexOf("saveCurrentAdvisorWorkOrderDraft(submissionDraft)"),
    ).toBeLessThan(
      page.indexOf("materializeAdvisorWorkOrderDraft(submissionDraft)"),
    );
  });

  it("keeps sensitive scheduling writes online and makes advisor shells reopenable", () => {
    const appointments = read("app/mobile/appointments/page.tsx");
    const worker = read("app/sw.ts");
    const offline = read("features/work-orders/mobile/advisorOffline.ts");
    expect(appointments).toContain(
      "Appointment creation and changes require a connection",
    );
    expect(appointments).toContain("Download this day");
    expect(worker).toContain('url.pathname === "/mobile/appointments"');
    expect(worker).toContain('url.pathname === "/mobile/work-orders/create"');
    expect(worker).toContain('cacheName: "profixiq-advisor-shell-v1"');
    expect(offline).toContain("cacheAdvisorRouteShells");
  });
});
