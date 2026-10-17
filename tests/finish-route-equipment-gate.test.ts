import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  equipment: vi.fn(),
  complete: vi.fn(),
}));

vi.mock("@/features/shared/lib/supabase/server", () => ({
  createServerSupabaseRoute: () => ({
    auth: { getUser: async () => ({ data: { user: { id: "auth-1" } }, error: null }) },
  }),
}));
vi.mock("@/features/equipment/dispatch/server/equipmentFinish", () => ({
  finishViaEquipmentLastOff: (input: unknown) => h.equipment(input),
}));
vi.mock("@/features/work-orders/server/completeWorkOrderLine", () => ({
  completeWorkOrderLine: (input: unknown) => h.complete(input),
}));

import { POST } from "../app/api/work-orders/lines/[id]/finish/route";

function request(body: unknown, key: string | null = "key-1") {
  return {
    nextUrl: { pathname: "/api/work-orders/lines/line-1/finish" },
    headers: { get: (name: string) => (name.toLowerCase() === "idempotency-key" ? key : null) },
    json: async () => body,
  } as never;
}

beforeEach(() => {
  h.equipment.mockReset();
  h.complete.mockReset();
});

describe("finish route", () => {
  it("is unchanged for everyone the Equipment path does not take", async () => {
    h.equipment.mockResolvedValue({ handled: false });
    h.complete.mockResolvedValue({ ok: true, payload: { success: true }, menuRepairLearning: { ok: false, state: "pending" } });

    const response = await POST(request({ cause: "c", correction: "k" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, menuRepairLearning: { ok: false, state: "pending" } });
    expect(h.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        lineId: "line-1",
        technicianId: "auth-1",
        actorUserId: "auth-1",
        operationKey: "key-1",
        enforceProductAccess: true,
        enforceAssignedWork: true,
        cause: "c",
        correction: "k",
      }),
    );
  });

  it("returns the Equipment outcome without running the standard finish", async () => {
    h.equipment.mockResolvedValue({
      handled: true,
      ok: true,
      payload: { success: true, lineClosed: false, remaining: [{ technicianId: "t2", state: "running" }] },
    });
    const response = await POST(request({}));
    expect(await response.json()).toMatchObject({ lineClosed: false });
    expect(h.complete).not.toHaveBeenCalled();
  });

  it("returns an Equipment refusal with its status", async () => {
    h.equipment.mockResolvedValue({ handled: true, ok: false, status: 409, error: "nope" });
    const response = await POST(request({}));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "nope" });
    expect(h.complete).not.toHaveBeenCalled();
  });

  it("still requires a stable key before anything runs", async () => {
    const response = await POST(request({}, null));
    expect(response.status).toBe(400);
    expect(h.equipment).not.toHaveBeenCalled();
    expect(h.complete).not.toHaveBeenCalled();
  });
});
