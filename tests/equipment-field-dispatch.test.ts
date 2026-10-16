import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  buildDispatchNotifications,
  DispatchWorkOrderSchema,
  FieldCallSchema,
} from "@/features/equipment/dispatch/lib/equipmentDispatch";
import {
  EquipmentDispatchError,
  equipmentDispatchHttpStatus,
} from "@/features/equipment/dispatch/server/equipmentDispatchService";

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const base = { workOrderId: U(1), mode: "mobile" as const };

describe("dispatch request validation", () => {
  it("requires a technician and location to dispatch now", () => {
    const r = DispatchWorkOrderSchema.safeParse({ ...base, dispatchNow: true });
    expect(r.success).toBe(false);
    const fields = r.success ? [] : r.error.issues.map((i) => i.path[0]);
    expect(fields).toContain("leadUserId");
    expect(fields).toContain("serviceAddressId");
  });

  it("accepts Now with lead, support and location", () => {
    const r = DispatchWorkOrderSchema.safeParse({
      ...base, dispatchNow: true, leadUserId: U(2), supportUserIds: [U(3)], serviceAddressId: U(4),
    });
    expect(r.success).toBe(true);
  });

  it("rejects Now combined with a schedule, and unpaired or inverted times", () => {
    const t = (h: number) => `2026-11-01T${String(h).padStart(2, "0")}:00:00Z`;
    expect(DispatchWorkOrderSchema.safeParse({
      ...base, dispatchNow: true, leadUserId: U(2), serviceAddressId: U(4), scheduledStart: t(9), scheduledEnd: t(10),
    }).success).toBe(false);
    expect(DispatchWorkOrderSchema.safeParse({ ...base, scheduledStart: t(9) }).success).toBe(false);
    expect(DispatchWorkOrderSchema.safeParse({ ...base, scheduledStart: t(10), scheduledEnd: t(9) }).success).toBe(false);
  });

  it("does not allow supporting technicians on a scheduled visit yet", () => {
    const t = (h: number) => `2026-11-01T${String(h).padStart(2, "0")}:00:00Z`;
    expect(DispatchWorkOrderSchema.safeParse({
      ...base, leadUserId: U(2), supportUserIds: [U(3)], scheduledStart: t(9), scheduledEnd: t(10),
    }).success).toBe(false);
    expect(DispatchWorkOrderSchema.safeParse({
      ...base, leadUserId: U(2), scheduledStart: t(9), scheduledEnd: t(10),
    }).success).toBe(true);
  });

  it("requires a lead before supporting technicians and forbids duplicates", () => {
    expect(DispatchWorkOrderSchema.safeParse({ ...base, supportUserIds: [U(3)] }).success).toBe(false);
    expect(DispatchWorkOrderSchema.safeParse({ ...base, leadUserId: U(2), supportUserIds: [U(2)] }).success).toBe(false);
  });

  it("only allows a service vehicle on a field visit", () => {
    expect(DispatchWorkOrderSchema.safeParse({ workOrderId: U(1), mode: "shop", serviceVehicleId: U(9) }).success).toBe(false);
  });

  it("field calls are always field visits and need a complaint", () => {
    const call = { customerId: U(5), vehicleId: U(6), complaint: "Hydraulic leak" };
    const ok = FieldCallSchema.safeParse(call);
    expect(ok.success && ok.data.mode).toBe("mobile");
    expect(FieldCallSchema.safeParse({ ...call, complaint: "" }).success).toBe(false);
    expect(FieldCallSchema.safeParse({ ...call, mode: "shop" }).success).toBe(false);
  });
});

describe("dispatch notifications", () => {
  const input = {
    visitId: U(10), workOrderId: U(11), workOrderLabel: "WO-ABC", actorProfileId: U(1),
    participants: [
      { userId: U(2), role: "lead" as const },
      { userId: U(3), role: "support" as const },
      { userId: U(1), role: "support" as const },
      { userId: null, role: "support" as const },
    ],
    dispatchedNow: true,
  };

  it("notifies each technician once, never the dispatcher or a removed user", () => {
    const list = buildDispatchNotifications(input);
    expect(list.map((n) => n.recipientUserId).sort()).toEqual([U(2), U(3)].sort());
  });

  it("uses stable per-visit-per-user keys and an in-app deep link", () => {
    const [lead] = buildDispatchNotifications(input);
    expect(lead?.dedupeKey).toBe(`equipment:dispatch.assigned:${U(10)}:${U(2)}`);
    expect(lead?.targetPath).toBe(`/mobile/work-orders/${U(11)}`);
    // Supporting technicians are not sent to a job link they may not be able to open.
    const support = buildDispatchNotifications(input).find((n) => n.recipientUserId === U(3));
    expect(support?.targetPath).toBe("/mobile");
    expect(lead?.priority).toBe("high");
    expect(buildDispatchNotifications({ ...input, dispatchedNow: false })[0]?.priority).toBe("normal");
  });

  it("makes no customer-facing notification", () => {
    for (const n of buildDispatchNotifications(input)) {
      expect(n.eventType).toBe("dispatch.assigned");
    }
  });
});

describe("error mapping", () => {
  const map = (message: string, code: string | null) =>
    equipmentDispatchHttpStatus(new EquipmentDispatchError(message, code, null));
  it("maps denial, conflicts and validation distinctly", () => {
    expect(map("Equipment dispatch denied.", "42501")).toBe(403);
    expect(map("ACTIVE_SERVICE_VISIT_EXISTS", "P0001")).toBe(409);
    expect(map("EQUIPMENT_DISPATCH_OPERATION_KEY_CONFLICT", "22023")).toBe(409);
    expect(map("Service visit changed since it was loaded.", "40001")).toBe(409);
    expect(map("A technician is required to dispatch a visit.", "P0001")).toBe(400);
    expect(map("Dispatch saved, but some technicians could not be notified.", "RETRYABLE")).toBe(503);
  });
});

describe("route and migration boundaries", () => {
  const read = (p: string) => readFileSync(p, "utf8");

  it("every route authenticates, checks the Equipment entitlement, and scopes to the caller's shop", () => {
    for (const p of [
      "app/api/equipment/dispatch/route.ts",
      "app/api/equipment/field-calls/route.ts",
      "app/api/equipment/dispatch/visits/[visitId]/acknowledge/route.ts",
    ]) {
      const src = read(p);
      expect(src).toContain("requireEquipmentDispatchAccess");
      expect(src).toContain("access.profile.shop_id");
    }
    expect(read("features/equipment/dispatch/server/access.ts")).toContain("resolveEquipmentAddonEntitlementForShop");
  });

  it("creating work requires an Idempotency-Key; only office creators may originate a call", () => {
    for (const p of ["app/api/equipment/dispatch/route.ts", "app/api/equipment/field-calls/route.ts"]) {
      expect(read(p)).toContain("readOperationKey");
      expect(read(p)).toContain('requiredCapability: "canManageScheduling"');
    }
    expect(read("app/api/equipment/field-calls/route.ts")).toContain("ROLE_GROUPS.workOrderCreators");
  });

  it("the migration is additive: wraps canonical commands and changes no existing object", () => {
    const sql = read("supabase/migrations/20261017180000_equipment_field_dispatch.sql");
    expect(sql).not.toMatch(/\bdrop\s+(table|policy|trigger|function)\b/i);
    expect(sql).not.toMatch(/create\s+trigger/i);
    for (const m of sql.matchAll(/alter\s+table\s+(?:only\s+)?public\.(\w+)/gi)) {
      expect(m[1]).toBe("service_visit_participants");
    }
    expect(sql).toContain("dispatch_create_service_visit_atomic");
    expect(sql).toContain("dispatch_transition_service_visit_atomic");
    expect(sql).toContain("create_work_order_with_custom_id");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).not.toMatch(/grant\s+(select|insert|update|delete|all)[^;]*on table[^;]*to\s+(authenticated|anon)/i);
    // Dispatch and acknowledgement are server-only; only the session-bound field call is authenticated.
    expect(sql).toMatch(/revoke all on function public\.equipment_dispatch_visit_atomic\([^)]*\)\s+from public, anon, authenticated;/);
    expect(sql).toMatch(/revoke all on function public\.equipment_acknowledge_visit_atomic\([^)]*\)\s+from public, anon, authenticated;/);
    expect(sql).toContain("mobile_profile_has_field_service_access");
  });

  it("acknowledgement never changes status or touches labor", () => {
    const sql = read("supabase/migrations/20261017180000_equipment_field_dispatch.sql");
    const ack = sql.slice(sql.indexOf("equipment_acknowledge_visit_atomic("));
    expect(ack).not.toMatch(/update\s+public\.service_visits/i);
    expect(ack).not.toMatch(/labor_segments/i);
  });
});
