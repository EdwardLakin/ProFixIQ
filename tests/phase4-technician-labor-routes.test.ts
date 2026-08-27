import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

describe("Phase 4 technician labor route contract", () => {
  it("requires stable operation keys on public punch routes", () => {
    for (const path of [
      "app/api/work-orders/lines/[id]/start/route.ts",
      "app/api/work-orders/lines/[id]/pause/route.ts",
      "app/api/work-orders/lines/[id]/resume/route.ts",
      "app/api/work-orders/lines/[id]/finish/route.ts",
    ]) {
      const source = read(path);
      expect(source.toLowerCase()).toContain("idempotency-key");
      expect(source.toLowerCase()).toMatch(
        /stable idempotency-key is required/,
      );
      expect(source).toContain("requireJobPunchActorAccess");
      expect(source.indexOf("stable Idempotency-Key is required")).toBeLessThan(
        source.indexOf("await requireJobPunchActorAccess"),
      );
    }
  });

  it("leaves receipt-aware capability and assignment authorization at the atomic boundary", () => {
    const authorization = read(
      "features/work-orders/server/authorizeJobPunchTransition.ts",
    );
    expect(authorization).toContain('.from("work_order_lines")');
    expect(authorization).toContain("requireShopScopedApiAccess");
    expect(authorization).not.toContain("requireAssignedJobPunchAccess");

    const migration = read(
      "supabase/migrations/20260825223000_enforce_job_punch_assignment.sql",
    );
    expect(migration).toContain("apply_job_punch_transition_atomic");
    expect(migration).toContain("work_order.job.execute");
    expect(migration).toContain("work_order_line_technicians");
    expect(migration).toContain("An assigned technician is required");
    expect(migration.indexOf("select operation.result")).toBeLessThan(
      migration.indexOf("into v_can_execute"),
    );
  });

  it("routes every job transition through the shared atomic command", () => {
    const helper = read(
      "features/work-orders/server/applyJobPunchTransition.ts",
    );
    expect(helper).toMatch(/\.rpc\(\s*"apply_job_punch_transition_atomic"/);
    expect(helper).not.toContain('.from("work_order_lines")');
    expect(helper).not.toContain(
      '.from("work_order_line_labor_segments").insert',
    );
    expect(helper).not.toContain('.from("work_order_lines").update');
  });

  it("routes assignment through one canonical RPC with no follow-up edits", () => {
    const source = read("app/api/work-orders/assign-line/route.ts");
    expect(source).toMatch(
      /\.rpc\(\s*"assign_work_order_line_technician_atomic"/,
    );
    expect(source).not.toContain('.from("work_order_lines").update');
    expect(source).not.toContain('.from("work_order_line_technicians").upsert');
    expect(source).not.toContain("not fatal for UI");
  });

  it("routes coordinated labor stopping through one RPC", () => {
    const source = read("features/work-orders/server/technicianJobLabor.ts");
    expect(source).toMatch(
      /\.rpc\(\s*"pause_all_active_technician_labor_atomic"/,
    );
    expect(source).not.toContain("closeActiveLaborSegments");
    expect(source).not.toContain("syncLinePunchMirrorFromSegments");
  });

  it("supports persisted event identities for coordinated retries", () => {
    const source = read("features/work-orders/server/technicianJobLabor.ts");
    expect(source).toContain("sourceEventId");
    expect(source).toContain("breakPunchId");
    expect(source).toContain("coordinated-labor-stop");
  });
});
