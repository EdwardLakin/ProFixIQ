import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  profile: { value: { id: "tech-1", shop_id: "shop-1" } as { id: string; shop_id: string | null } | null },
  entitlement: { value: { enabled: true } as { enabled: boolean } | Error },
  rpc: vi.fn(),
  admin: { marker: "admin" },
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
  h.profile.value = { id: "tech-1", shop_id: "shop-1" };
  h.entitlement.value = { enabled: true };
  h.rpc.mockReset();
});

describe("finishViaEquipmentLastOff: falls back to the standard finish", () => {
  it("when the shop has no Equipment add-on", async () => {
    h.entitlement.value = { enabled: false };
    expect(await finishViaEquipmentLastOff(input)).toEqual({ handled: false });
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("when the entitlement cannot be verified, so a Finish that worked still works", async () => {
    h.entitlement.value = new Error("outage");
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await finishViaEquipmentLastOff(input)).toEqual({ handled: false });
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("when there is no shop profile", async () => {
    h.profile.value = null;
    expect(await finishViaEquipmentLastOff(input)).toEqual({ handled: false });
    h.profile.value = { id: "tech-1", shop_id: null };
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
  it("passes the stable key and trimmed story through, scoped to the caller's shop and profile", async () => {
    h.rpc.mockResolvedValue({ ok: true, lineId: "line-1", lineClosed: true, remaining: [], idempotent: false });
    await finishViaEquipmentLastOff(input);
    expect(h.rpc).toHaveBeenCalledWith({
      supabase: h.admin,
      shopId: "shop-1",
      technicianId: "tech-1",
      actorUserId: "tech-1",
      operationKey: "job-punch:line-1:finish:abc",
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
