import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const causeCorrectionModal = readFileSync(
  "features/work-orders/components/workorders/CauseCorrectionModal.tsx",
  "utf8",
);
const assistantModal = readFileSync(
  "features/work-orders/components/workorders/AiAssistantModal.tsx",
  "utf8",
);
const vehicleHistoryModal = readFileSync(
  "features/work-orders/components/workorders/VehicleHistoryModal.tsx",
  "utf8",
);
const vehicleHistoryRoute = readFileSync(
  "app/api/work-orders/[id]/vehicle-history/route.ts",
  "utf8",
);
const focusedJobModal = readFileSync(
  "features/work-orders/components/workorders/FocusedJobModal.tsx",
  "utf8",
);
const mobileFocusedJob = readFileSync(
  "features/work-orders/mobile/MobileFocusedJob.tsx",
  "utf8",
);

describe("work-order modal sizing, theme, and vehicle history", () => {
  it("gives cause and correction a large responsive shell without nested scrolling", () => {
    expect(causeCorrectionModal).toContain('title="COMPLETE JOB"');
    expect(causeCorrectionModal).toContain('size="lg"');
    expect(causeCorrectionModal).not.toContain('className="max-h-[70vh]');
  });

  it("uses the shared premium shell for the desktop assistant", () => {
    expect(assistantModal).toContain(
      'import ModalShell from "@/features/shared/components/ModalShell"',
    );
    expect(assistantModal).toContain('title="ASK PROFIXIQ"');
    expect(assistantModal).toContain('size="lg"');
    expect(assistantModal).toContain("Nothing is changed automatically.");
    expect(assistantModal).not.toContain(
      'className="var(--theme-gradient-panel)"',
    );
  });

  it("loads canonical prior work orders through a shop-authorized server route", () => {
    expect(vehicleHistoryModal).toContain('title="VEHICLE HISTORY"');
    expect(vehicleHistoryModal).toContain('size="xl"');
    expect(vehicleHistoryModal).toContain("/vehicle-history?lineId=");
    expect(vehicleHistoryModal).toContain('{ cache: "no-store" }');
    expect(vehicleHistoryModal).not.toContain('from("history")');
    expect(vehicleHistoryModal).not.toContain("createBrowserSupabase");

    expect(vehicleHistoryRoute).toContain("requireShopScopedApiAccess({");
    expect(vehicleHistoryRoute).toContain("allowRoles: ALLOWED_ROLES");
    expect(vehicleHistoryRoute).toContain("createAdminSupabase()");
    expect(vehicleHistoryRoute).toContain('.from("work_orders")');
    expect(vehicleHistoryRoute).toContain('.from("work_order_lines")');
    expect(vehicleHistoryRoute).not.toContain('.from("history")');
    expect(vehicleHistoryRoute).toContain('.eq("shop_id", shopId)');
    expect(vehicleHistoryRoute).toContain(
      '.eq("vehicle_id", currentWorkOrder.vehicle_id)',
    );
    expect(vehicleHistoryRoute).toContain('.neq("id", currentWorkOrder.id)');
    expect(vehicleHistoryRoute).toContain(
      '.in("status", ["completed", "ready_to_invoice", "invoiced"])',
    );
    expect(vehicleHistoryRoute).toContain('.is("voided_at", null)');
    expect(vehicleHistoryRoute).toContain(
      'access.canonicalRole === "mechanic"',
    );
    expect(vehicleHistoryRoute).toContain(
      '.from("work_order_line_technicians")',
    );
    expect(vehicleHistoryRoute).toContain("UUID_PATTERN.test");
  });

  it("passes the current work order identity from desktop and mobile", () => {
    expect(focusedJobModal).toContain("workOrderId={workOrder.id}");
    expect(focusedJobModal).toContain("workOrderLineId={line.id}");
    expect(mobileFocusedJob).toContain("workOrderId={workOrder.id}");
    expect(mobileFocusedJob).toContain("workOrderLineId={line.id}");
  });
});
