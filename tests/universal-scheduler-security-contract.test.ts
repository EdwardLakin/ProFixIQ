import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const security = read(
  "supabase/migrations/20260810033000_universal_scheduler_security_and_rebalance.sql",
);
const assignment = read(
  "supabase/migrations/20260810033500_universal_scheduler_explicit_assignment.sql",
);
const publicAvailability = read("app/api/portal/availability/route.ts");
const assignRoute = read(
  "app/api/scheduling/events/[id]/resource/route.ts",
);

describe("Universal Scheduler security boundaries", () => {
  it("binds supplied actors to the authenticated caller", () => {
    expect(security).toContain("scheduler_actor_matches");
    expect(security).toContain(
      "Scheduling actor does not match the authenticated caller.",
    );
    expect(security).toContain("auth.uid() = p_actor_user_id");
  });

  it("allows anonymous availability only through the public-only projection", () => {
    expect(security).toContain("if not p_public_only");
    expect(security).toContain("Scheduler availability access denied.");
    expect(security).toContain("to anon, authenticated, service_role");
    expect(publicAvailability).not.toContain("availableResourceIds");
    expect(publicAvailability).not.toContain("resources:");
  });

  it("keeps explicit-resource scheduling away from customer RPC callers", () => {
    expect(assignment).toContain(
      "revoke execute on function public.scheduler_apply_booking_command_atomic",
    );
    expect(assignment).toContain("from authenticated");
    expect(assignment).toContain("to service_role");
    expect(security).toContain("scheduler_assign_event_resource_atomic");
    expect(assignRoute).toContain("scheduler_assign_event_resource_atomic");
  });

  it("moves fallback reservations onto real capacity before fallback is ignored", () => {
    expect(security).toContain("scheduler_rebalance_fallback_reservations");
    expect(security).toContain("r.is_fallback = true");
    expect(security).toContain("v_resource.active");
    expect(security).toContain("has active future reservations and cannot be disabled");
  });
});
