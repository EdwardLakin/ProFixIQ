import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const migration = read(
  "supabase/migrations/20260810164500_mobile_dispatch_operations.sql",
);
const assignmentGuard = read(
  "supabase/migrations/20260810165000_mobile_dispatch_assignment_guard.sql",
);
const contract = read("features/scheduling/lib/service-visit-contract.ts");
const commands = read("features/dispatch/server/commands.ts");
const visitsApi = read("app/api/dispatch/visits/[id]/route.ts");
const createVisitApi = read("app/api/dispatch/visits/route.ts");
const boardApi = read("app/api/dispatch/board/route.ts");
const mobileActiveApi = read("app/api/mobile/service-visits/active/route.ts");
const boardUi = read("app/dashboard/dispatch/DispatchBoardClient.tsx");

describe("Mobile dispatch operations", () => {
  it("makes service visits command-owned while preserving read access", () => {
    expect(migration).toContain(
      "revoke insert, update, delete on table public.service_visits from authenticated",
    );
    expect(migration).toContain("create table if not exists public.service_visit_events");
    expect(migration).toContain("grant select on table public.service_visit_events to authenticated");
    expect(migration).toContain("service_visit_events_shop_select");
  });

  it("provides canonical create/update/reschedule/assign/transition commands", () => {
    for (const rpc of [
      "dispatch_create_service_visit_atomic",
      "dispatch_update_service_visit_atomic",
      "dispatch_reschedule_service_visit_atomic",
      "dispatch_assign_service_visit_atomic",
      "dispatch_transition_service_visit_atomic",
    ]) {
      expect(migration).toContain(`public.${rpc}`);
      expect(commands).toContain(`\"${rpc}\"`);
    }
    expect(migration).toContain("scheduler_operation_keys");
    expect(migration).toContain("Service visit changed since it was loaded.");
  });

  it("protects truck capacity and technician capacity independently", () => {
    expect(migration).toContain("dispatch_sync_primary_resource");
    expect(migration).toContain("dispatch_sync_technician_reservation");
    expect(migration).toContain("reservation_role = 'technician'");
    expect(migration).toContain("resource_type = 'technician'");
    expect(migration).toContain("resource_type = 'service_vehicle'");
  });

  it("requires technician ownership before a visit becomes active dispatch", () => {
    expect(assignmentGuard).toContain("guard_service_visit_dispatch_assignment");
    expect(assignmentGuard).toContain(
      "new.status in ('dispatched','en_route','arrived','working','paused','completed')",
    );
    expect(assignmentGuard).toContain("new.assigned_user_id is null");
    expect(assignmentGuard).toContain(
      "A technician must be assigned before a service visit can be dispatched.",
    );
  });

  it("keeps dispatch status separate from work-order repair status", () => {
    expect(contract).toContain('scheduled: ["dispatched", "cancelled"]');
    expect(contract).toContain('dispatched: ["en_route", "cancelled"]');
    expect(contract).toContain('en_route: ["arrived", "cancelled"]');
    expect(contract).toContain('arrived: ["working", "cancelled"]');
    expect(contract).toContain('working: ["paused", "completed"]');
    expect(migration).not.toContain("update public.work_order_lines\n  set status");
    expect(migration).not.toContain("update public.work_orders\n  set status");
  });

  it("stamps dispatch lifecycle evidence without allowing client-side table writes", () => {
    expect(migration).toContain("dispatched_at");
    expect(migration).toContain("travel_started_at");
    expect(migration).toContain("arrived_at");
    expect(migration).toContain("work_started_at");
    expect(migration).toContain("paused_at");
    expect(migration).toContain("completed_at");
    expect(migration).toContain("cancelled_at");
    expect(migration).toContain("dispatch_record_visit_event");
    expect(visitsApi).not.toContain('.from("service_visits")\n      .update');
    expect(createVisitApi).not.toContain('.from("service_visits")');
  });

  it("exposes one staff board and one technician active-job contract", () => {
    expect(migration).toContain("dispatch_board_snapshot");
    expect(migration).toContain("dispatch_mobile_active_snapshot");
    expect(boardApi).toContain("getDispatchBoard");
    expect(mobileActiveApi).toContain("getMobileActiveJobs");
    expect(boardUi).toContain("/api/dispatch/board");
    expect(boardUi).toContain("/api/dispatch/visits/");
    expect(boardUi).not.toContain("createBrowserSupabase");
  });

  it("keeps truck tracking optional but technician ownership explicit", () => {
    expect(boardUi).toContain("Service vehicle");
    expect(boardUi).toContain("(optional)");
    expect(boardUi).toContain("Assign technician first");
    expect(migration).toContain("assigned_user_id");
    expect(migration).toContain("service_vehicle_id");
  });
});
