import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  activatePasswordProfile,
  PASSWORD_ACTIVATION_RETRY_MESSAGE,
} from "@/features/auth/lib/passwordActivation";
import { convertFleetServiceRequest } from "@/features/fleet/lib/convertFleetServiceRequest";
import {
  filterAllocationsNotBackedByCanonicalParts,
  summarizeCanonicalPartAllocations,
} from "@/features/work-orders/lib/display/workOrderParts";

const read = (path: string) => readFileSync(path, "utf8");

describe("Codex review follow-up hardening", () => {
  it("keeps password activation retryable without exposing database details", async () => {
    const eq = vi.fn().mockResolvedValue({ error: { message: "raw postgres policy detail" } });
    const update = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ update }));
    const result = await activatePasswordProfile({ from } as never, "user-id");
    expect(result).toEqual({
      ok: false,
      userMessage: PASSWORD_ACTIVATION_RETRY_MESSAGE,
      detail: "raw postgres policy detail",
    });
    expect(PASSWORD_ACTIVATION_RETRY_MESSAGE).not.toContain("postgres");
  });

  it("executes fleet conversion through a testable request boundary", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ workOrderId: "wo-1" }),
    });
    await expect(convertFleetServiceRequest("request-1", fetchMock as never)).resolves.toBe("wo-1");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/fleet/service-requests/convert-to-work-order",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ serviceRequestId: "request-1" }),
      }),
    );
  });

  it("merges linked allocation details while retaining only standalone rows", () => {
    const part = { id: "part-row", source_parts_request_item_id: "request-item" };
    const allocations = [
      { id: "linked-1", work_order_part_id: "part-row", location_id: "loc-a", qty: 4 },
      { id: "linked-2", source_request_item_id: "request-item", location_id: "loc-b", qty: 2 },
      { id: "manual", work_order_part_id: null, source_request_item_id: null, location_id: "loc-c", qty: 1 },
    ];
    expect(summarizeCanonicalPartAllocations(part, allocations)).toEqual({
      allocatedQuantity: 6,
      locations: ["loc-a", "loc-b"],
    });
    expect(filterAllocationsNotBackedByCanonicalParts(allocations, [part])).toEqual([
      allocations[2],
    ]);
  });

  it("contains the database guards required by the reviewed migrations", () => {
    const migration = read("supabase/migrations/20260804120000_codex_review_followup_hardening.sql");
    for (const contract of [
      "sync_profile_shop_membership",
      "FLEET_REQUEST_NOT_CONVERTIBLE",
      "old.status::text in ('completed','closed','cancelled','declined','rejected')",
      "operation', 'apply_stock_move",
      "stock_moves_shop_reference_idx",
      "historical_po_receipt_reconciliation",
      "parts_create_and_attach_inventory_atomic",
      "technician_notes",
      "OTHER_TECHNICIANS_STILL_PUNCHED_IN",
      "round(p_qty,2) is distinct from p_qty",
      "'owner','admin','manager','lead_hand','foreman','parts'",
      "array_agg(move.location_id order by move.location_id)",
      "inventory_reconciliation_exceptions enable row level security",
      "revoke all on table public.inventory_reconciliation_exceptions",
    ]) {
      expect(migration).toContain(contract);
    }
    expect(migration).not.toContain("min(move.location_id)");
  });

  it("keeps mobile optimistic shift state and exact fleet conversion capability", () => {
    expect(read("features/mobile/components/MobileShiftTracker.tsx")).toContain(
      'new CustomEvent("profixiq:mobile-shift-updated"',
    );
    expect(read("features/mobile/dashboard/MobileTechHome.tsx")).toContain(
      "if (detail?.queued || !navigator.onLine) return",
    );
    expect(read("features/fleet/components/FleetServiceRequestsPage.tsx")).toContain(
      "canConvertServiceRequestToWorkOrder",
    );
    expect(read("features/fleet/components/FleetServiceRequestsPage.tsx")).toContain(
      'item.status === "open"',
    );
  });

  it("requires validated work orders and parts permissions across the workbench", () => {
    const createPage = read("features/work-orders/app/work-orders/create/page.tsx");
    expect(createPage).toContain("workOrderId={hasValidatedWorkOrder");
    expect(createPage).toContain("disabled={!hasValidatedWorkOrder}");
    expect(createPage).toContain("CREATE_WORK_ORDER_STALE_EVENT");
    expect(createPage).toContain("requireMutableWorkOrder");
    expect(createPage.indexOf("const [error, setError]")).toBeLessThan(
      createPage.indexOf("const handleStaleDraft"),
    );
    expect(read("features/work-orders/components/NewWorkOrderLineForm.tsx")).toContain(
      "requireMutableWorkOrder",
    );
    expect(read("features/work-orders/components/MenuQuickAdd.tsx")).toContain(
      "requireMutableWorkOrder",
    );
    expect(
      read("app/api/admin/staff-invite-candidates/[id]/create-user/route.ts"),
    ).toContain("rollbackProvisionedCandidateUser");
    expect(read("app/api/admin/users/[id]/route.ts")).toContain(
      "Restoring the previous role also failed",
    );
    expect(read("app/api/parts/_lib/lifecycleCommand.ts")).toContain(
      'requiredCapability: "canManageParts"',
    );
    expect(read("app/api/parts/_lib/receivePartRequestItem.ts")).toContain(
      'requiredCapability: "canManageParts"',
    );
  });
});
