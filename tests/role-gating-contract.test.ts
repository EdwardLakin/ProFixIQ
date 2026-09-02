import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  canonicalizeRole,
  getActorCapabilities,
  ROLE_GROUPS,
} from "@/features/shared/lib/rbac";
import { TILES } from "@/features/shared/config/tiles";
import { MOBILE_TILES } from "@/features/mobile/config/mobile-tiles";

const read = (path: string) => readFileSync(path, "utf8");

describe("canonical role gating contract", () => {
  it("normalizes technician and lead hand aliases", () => {
    expect(canonicalizeRole("tech")).toBe("mechanic");
    expect(canonicalizeRole("technician")).toBe("mechanic");
    expect(canonicalizeRole("lead")).toBe("lead_hand");
    expect(canonicalizeRole("leadhand")).toBe("lead_hand");
    expect(canonicalizeRole("lead hand")).toBe("lead_hand");
    expect(canonicalizeRole("not-a-real-role")).toBe("unknown");
  });

  it("keeps owner and admin as account administrators", () => {
    expect(ROLE_GROUPS.accountAdministrators).toEqual(["owner", "admin"]);

    for (const role of ROLE_GROUPS.accountAdministrators) {
      const actor = getActorCapabilities({ role });
      expect(actor.canManageUsers).toBe(true);
      expect(actor.canManageBranding).toBe(true);
      expect(actor.canManageBilling).toBe(true);
    }
  });

  it("matches scheduler booking writes to the canonical database roles", () => {
    expect(ROLE_GROUPS.schedulerBookingWriters).toEqual([
      "owner",
      "admin",
      "manager",
      "advisor",
    ]);
  });

  it("limits managers to operational and workforce authority", () => {
    const manager = getActorCapabilities({ role: "manager" });
    expect(manager.canManageWorkforce).toBe(true);
    expect(manager.canManageWorkOrders).toBe(true);
    expect(manager.canAssignWork).toBe(true);
    expect(manager.canViewFinancials).toBe(true);
    expect(manager.canManageUsers).toBe(false);
    expect(manager.canManageBranding).toBe(false);
    expect(manager.canManageBilling).toBe(false);
  });

  it("separates foreman and lead hand quote authority", () => {
    const foreman = getActorCapabilities({ role: "foreman" });
    const leadHand = getActorCapabilities({ role: "leadhand" });

    expect(foreman.canAssignWork).toBe(true);
    expect(foreman.canAuthorizeQuotes).toBe(true);
    expect(leadHand.canAssignWork).toBe(true);
    expect(leadHand.canAuthorizeQuotes).toBe(false);
    expect(foreman.canManageUsers).toBe(false);
    expect(leadHand.canManageUsers).toBe(false);
  });

  it("limits mechanics to assigned work and inspections", () => {
    const mechanic = getActorCapabilities({ role: "mechanic" });
    expect(mechanic.canPerformAssignedWork).toBe(true);
    expect(mechanic.canRunInspections).toBe(true);
    expect(mechanic.canManageWorkOrders).toBe(false);
    expect(mechanic.canAssignWork).toBe(false);
    expect(mechanic.canViewShopWideData).toBe(false);
    expect(mechanic.canAuthorizeQuotes).toBe(false);
    expect(mechanic.canViewFinancials).toBe(false);
  });

  it("keeps financial navigation away from floor roles", () => {
    const desktopBilling = TILES.find((tile) => tile.href === "/billing");
    const mobileReports = MOBILE_TILES.find((tile) => tile.href === "/mobile/reports");
    const mobileBoard = MOBILE_TILES.find(
      (tile) =>
        tile.href === "/mobile/work-orders" && tile.title === "Work Order Board",
    );
    const mechanicWorkOrders = MOBILE_TILES.find(
      (tile) =>
        tile.href === "/mobile/work-orders" && tile.title === "My Work Orders",
    );

    expect(desktopBilling?.roles).not.toContain("mechanic");
    expect(desktopBilling?.roles).not.toContain("lead_hand");
    expect(desktopBilling?.roles).not.toContain("foreman");
    expect(mobileReports?.roles).toEqual(["owner", "admin", "manager"]);
    expect(mobileBoard?.roles).not.toContain("mechanic");
    expect(mechanicWorkOrders?.roles).toEqual(["mechanic"]);
  });
});

describe("enforcement layers", () => {
  it("fails unknown API roles closed", () => {
    const source = read("features/shared/lib/server/admin-access.ts");
    expect(source).toContain("if (!actor.isKnownRole)");
    expect(source).toContain('NextResponse.json({ error: "Forbidden" }, { status: 403 })');
  });

  it("uses assignment capability for assignment APIs", () => {
    for (const path of [
      "app/api/assignables/route.ts",
      "app/api/work-orders/assign-line/route.ts",
      "app/api/work-orders/assign-all/route.ts",
    ]) {
      expect(read(path)).toContain("requiredWorkspaceCapability");
      expect(read(path)).toContain(
        "WORKSPACE_CAPABILITIES.manageWorkOrderAssignments",
      );
    }
  });

  it("server-gates sensitive desktop and mobile pages", () => {
    for (const path of [
      "app/billing/layout.tsx",
      "app/work-orders/board/page.tsx",
      "app/work-orders/create/page.tsx",
      "app/work-orders/view/page.tsx",
      "app/work-orders/quote-review/page.tsx",
      "app/mobile/reports/layout.tsx",
      "app/mobile/technicians/layout.tsx",
      "app/mobile/work-orders/create/layout.tsx",
    ]) {
      expect(read(path)).toContain("requireShopPageAccess");
    }
    expect(read("app/mobile/appointments/layout.tsx")).toContain(
      "requireCanonicalShopOrFieldPageAccess",
    );
  });

  it("replaces role-blind work-order RLS with role and assignment policies", () => {
    const migration = read(
      "supabase/migrations/20260716100000_role_gated_work_order_rls.sql",
    );

    expect(migration).toContain("profixiq_current_role");
    expect(migration).toContain("profixiq_is_assigned_to_line");
    expect(migration).toContain("profixiq_is_assigned_to_work_order");
    expect(migration).toContain("work_orders_role_select");
    expect(migration).toContain("work_order_lines_role_update");
    expect(migration).toContain("work_order_line_technicians_role_insert");
    expect(migration).toContain("public.profixiq_current_role() = 'mechanic'");
    expect(migration).toContain("public.profixiq_current_role() in ('owner', 'admin')");
  });

  it("makes direct assignment writes RPC-only and effective-capability readable", () => {
    const migration = read(
      "supabase/migrations/20260820150023_enforce_workspace_assignment_boundaries.sql",
    );

    expect(migration).toContain(
      "workspace_actor_can_manage_work_order_assignments",
    );
    expect(migration).toContain("work_orders_workspace_assignment_select");
    expect(migration).toContain(
      "work_order_lines_workspace_assignment_select",
    );
    expect(migration).toContain(
      "work_order_line_technicians_workspace_assignment_select",
    );
    expect(migration).toContain(
      "column_name not in ('assigned_tech_id', 'assigned_to')",
    );
    expect(migration).toContain(
      "trg_work_order_line_assignment_capability",
    );
    expect(migration).toContain(
      "revoke insert, update, delete on table public.work_order_line_technicians",
    );

    const workOrderClient = read("app/work-orders/[id]/Client.tsx");
    const focusedJob = read(
      "features/work-orders/components/workorders/FocusedJobModal.tsx",
    );
    expect(workOrderClient).toContain(
      "WORKSPACE_CAPABILITIES.manageWorkOrderAssignments",
    );
    expect(focusedJob).toContain("canAssignTechnician");

    const addJobModal = read(
      "features/work-orders/components/workorders/AddJobModal.tsx",
    );
    expect(addJobModal).not.toContain("assignedTechId");
    expect(addJobModal).not.toContain("techId");
    expect(addJobModal).not.toContain(
      "WORKSPACE_CAPABILITIES.manageWorkOrderAssignments",
    );
  });
});
