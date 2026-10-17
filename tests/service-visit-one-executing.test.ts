import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { DispatchCommandError } from "@/features/dispatch/server/commands";
import { dispatchErrorResponse } from "@/features/dispatch/server/http";

const INDEX = "service_visits_one_executing_per_work_order_uniq";
const read = (p: string) => readFileSync(p, "utf8");

describe("one executing visit per work order", () => {
  it("maps the index violation to a clear 409 for dispatch routes", async () => {
    const error = new DispatchCommandError(
      `duplicate key value violates unique constraint "${INDEX}"`,
      "23505",
    );
    const response = dispatchErrorResponse(error);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "This work order already has a visit in progress." });
  });

  it("leaves other errors on their existing mapping", () => {
    expect(dispatchErrorResponse(new DispatchCommandError("Dispatch visit creation denied.", "42501")).status).toBe(403);
    expect(dispatchErrorResponse(new DispatchCommandError("Service visit changed since it was loaded.", "40001")).status).toBe(409);
    // An unrelated unique violation is NOT presented as "visit in progress".
    expect(
      dispatchErrorResponse(
        new DispatchCommandError('duplicate key value violates unique constraint "service_visits_booking_unique"', "23505"),
      ).status,
    ).toBe(400);
  });

  it("maps the mobile replay transition the same way", () => {
    const route = read("app/api/mobile/service-visits/[id]/transition/route.ts");
    expect(route).toContain(INDEX);
    expect(route).toContain("This work order already has a visit in progress.");
  });

  it("the migration only restricts executing statuses and never repairs data", () => {
    const sql = read("supabase/migrations/20261017023929_service_visit_one_executing_per_work_order.sql");
    expect(sql).toContain(INDEX);
    expect(sql).toMatch(/status in \('dispatched', 'en_route', 'arrived', 'working', 'paused'\)/);
    // `scheduled` must stay unrestricted (multi-day jobs, return trips booked ahead).
    const predicate = sql.slice(sql.indexOf("create unique index"), sql.indexOf("comment on index"));
    expect(predicate).not.toContain("'scheduled'");
    expect(sql).not.toMatch(/\b(delete|update)\s+(from\s+)?public\.service_visits\b/i);
    expect(sql).not.toMatch(/\bdrop\s+(table|policy|trigger|function)\b/i);
    expect(sql).toContain("Resolve them first");
  });

  it("is covered by a runtime SQL test wired into clean replay", () => {
    expect(read(".github/workflows/supabase-clean-replay-audit.yml")).toContain(
      "tests/security/service-visit-one-executing.runtime.sql",
    );
  });
});
