import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  profile: {
    value: { id: "tech-1", shop_id: "shop-1", role: "mechanic", demo_access_expires_at: null } as {
      id: string;
      shop_id: string | null;
      role: string | null;
      demo_access_expires_at: string | null;
    } | null,
  },
  entitlement: { value: { enabled: true } as { enabled: boolean } | Error },
  rpc: vi.fn(),
  othersRunning: { value: [] as unknown[], error: null as unknown },
  admin: {
    marker: "admin",
    from: () => {
      const builder: Record<string, unknown> = {};
      for (const method of ["select", "eq", "neq", "is"]) builder[method] = () => builder;
      builder.limit = async () => ({ data: h.othersRunning.value, error: h.othersRunning.error });
      return builder;
    },
  },
}));

vi.mock("@/features/shared/lib/server/admin-access", () => ({
  resolveAuthenticatedStaffProfile: async () => ({ profile: h.profile.value, error: null }),
}));
vi.mock("@/features/equipment/server/equipmentAddonEntitlement", () => ({
  resolveEquipmentAddonEntitlementForShop: async () => {
    if (h.entitlement.value instanceof Error) throw h.entitlement.value;
    return h.entitlement.value;
  },
}));
vi.mock("@/features/shared/lib/supabase/server", () => ({ createAdminSupabase: () => h.admin }));
vi.mock("@/features/equipment/dispatch/server/punchOffService", () => ({
  punchOffLine: (input: unknown) => h.rpc(input),
}));

import { EquipmentDispatchError } from "@/features/equipment/dispatch/server/equipmentDispatchService";
import { finishViaEquipmentLastOff } from "@/features/equipment/dispatch/server/equipmentFinish";

const input = {
  userSupabase: {} as never,
  authUserId: "auth-1",
  lineId: "line-1",
  operationKey: "job-punch:line-1:finish:abc",
  cause: " Worn seal ",
  correction: "",
};

beforeEach(() => {
  h.profile.value = { id: "tech-1", shop_id: "shop-1", role: "mechanic", demo_access_expires_at: null };
  h.othersRunning.value = [];
  h.othersRunning.error = null;
  h.entitlement.value = { enabled: true };
  h.rpc.mockReset();
});

describe("finishViaEquipmentLastOff: falls back to the standard finish", () => {
  it("when the shop has no Equipment add-on", async () => {
    h.entitlement.value = { enabled: false };
    expect(await finishViaEquipmentLastOff(input)).toEqual({ handled: false });
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("when the entitlement cannot be verified and nobody else is running (the standard finish does the same thing)", async () => {
    h.entitlement.value = new Error("outage");
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await finishViaEquipmentLastOff(input)).toEqual({ handled: false });
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("when there is no shop profile", async () => {
    h.profile.value = null;
    expect(await finishViaEquipmentLastOff(input)).toEqual({ handled: false });
    h.profile.value = { id: "tech-1", shop_id: null, role: "mechanic", demo_access_expires_at: null };
    expect(await finishViaEquipmentLastOff(input)).toEqual({ handled: false });
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("when the technician has no running timer (for example a lead completing an untimed line)", async () => {
    h.rpc.mockRejectedValue(
      new EquipmentDispatchError("You have no running timer on this line to punch off.", "P0001", null),
    );
    expect(await finishViaEquipmentLastOff(input)).toEqual({ handled: false });
  });
});

describe("finishViaEquipmentLastOff: takes over for Equipment shops with a running timer", () => {
  it("fails closed with a retryable 503 when the add-on cannot be verified and another technician is running", async () => {
    h.entitlement.value = new Error("outage");
    h.othersRunning.value = [{ technician_id: "tech-2" }];
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await finishViaEquipmentLastOff(input)).toMatchObject({ handled: true, ok: false, status: 503 });
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("fails closed when the add-on cannot be verified and the running-timer check itself fails", async () => {
    h.entitlement.value = new Error("outage");
    h.othersRunning.error = new Error("db down");
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await finishViaEquipmentLastOff(input)).toMatchObject({ handled: true, ok: false, status: 503 });
  });

  it("applies the standard finish's demo-expiry and role gates before the privileged command", async () => {
    h.profile.value = { id: "tech-1", shop_id: "shop-1", role: "mechanic", demo_access_expires_at: "2020-01-01T00:00:00Z" };
    expect(await finishViaEquipmentLastOff(input)).toMatchObject({ handled: true, ok: false, status: 403, error: "Forbidden" });

    h.profile.value = { id: "tech-1", shop_id: "shop-1", role: "customer", demo_access_expires_at: null };
    expect(await finishViaEquipmentLastOff(input)).toMatchObject({ handled: true, ok: false, status: 403 });
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("accepts any non-empty key the route accepts, by deriving a longer stable one", async () => {
    h.rpc.mockResolvedValue({ ok: true, lineId: "line-1", lineClosed: true, remaining: [], idempotent: false });
    await finishViaEquipmentLastOff({ ...input, operationKey: "k1" });
    await finishViaEquipmentLastOff({ ...input, operationKey: "k1" });
    const keys = h.rpc.mock.calls.map((call) => (call[0] as { operationKey: string }).operationKey);
    expect(keys[0]).toBe("finish:line-1:k1");
    expect(keys[0].length).toBeGreaterThanOrEqual(8);
    expect(keys[1]).toBe(keys[0]);
  });

  it("passes the stable key and trimmed story through, scoped to the caller's shop and profile", async () => {
    h.rpc.mockResolvedValue({ ok: true, lineId: "line-1", lineClosed: true, remaining: [], idempotent: false });
    await finishViaEquipmentLastOff(input);
    expect(h.rpc).toHaveBeenCalledWith({
      supabase: h.admin,
      shopId: "shop-1",
      technicianId: "tech-1",
      actorUserId: "tech-1",
      operationKey: "finish:line-1:job-punch:line-1:finish:abc",
      request: { lineId: "line-1", cause: "Worn seal", correction: undefined },
    });
  });

  it("reports a closed line like the standard finish, with repair learning pending", async () => {
    h.rpc.mockResolvedValue({ ok: true, lineId: "line-1", lineClosed: true, remaining: [], idempotent: false });
    const result = await finishViaEquipmentLastOff(input);
    expect(result).toEqual({
      handled: true,
      ok: true,
      payload: {
        success: true,
        lineClosed: true,
        remaining: [],
        idempotent: false,
        menuRepairLearning: { ok: false, state: "pending" },
      },
    });
  });

  it("reports an open line with who is still working when others remain", async () => {
    h.rpc.mockResolvedValue({
      ok: true,
      lineId: "line-1",
      lineClosed: false,
      remaining: [{ technicianId: "tech-2", state: "running" }],
      idempotent: false,
    });
    const result = await finishViaEquipmentLastOff(input);
    expect(result).toMatchObject({ handled: true, ok: true });
    if (result.handled && result.ok) {
      expect(result.payload.lineClosed).toBe(false);
      expect(result.payload.remaining).toEqual([{ technicianId: "tech-2", state: "running" }]);
      expect(result.payload).not.toHaveProperty("menuRepairLearning");
    }
  });

  it("surfaces canonical refusals with the same status mapping the standard finish uses", async () => {
    h.rpc.mockRejectedValue(
      new EquipmentDispatchError(
        "INSPECTION_COMPLETION_REQUIRED: complete and sign the inspection before finishing this job.",
        "P0001",
        null,
      ),
    );
    expect(await finishViaEquipmentLastOff(input)).toMatchObject({ handled: true, ok: false, status: 409 });

    h.rpc.mockRejectedValue(new EquipmentDispatchError("Technician is not assigned to this work-order line.", "42501", null));
    expect(await finishViaEquipmentLastOff(input)).toMatchObject({ handled: true, ok: false, status: 403 });
  });

  it("does not swallow unexpected failures", async () => {
    h.rpc.mockRejectedValue(new Error("boom"));
    await expect(finishViaEquipmentLastOff(input)).rejects.toThrow("boom");
  });
});
