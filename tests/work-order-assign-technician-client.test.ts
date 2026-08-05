import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  assignWorkOrderLineTechnician,
  createAssignTechnicianOperationKey,
} from "@/features/work-orders/lib/assignTechnicianClient";

describe("work-order technician assignment client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("sends the same stable operation key in the header and body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ ok: true, idempotent: false }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await assignWorkOrderLineTechnician({
      lineId: "line-1",
      technicianId: "tech-1",
      operationKey: "stable-assignment-key",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/work-orders/assign-line");
    expect(new Headers(init.headers).get("Idempotency-Key")).toBe(
      "stable-assignment-key",
    );
    expect(JSON.parse(String(init.body))).toEqual({
      work_order_line_id: "line-1",
      tech_id: "tech-1",
      operationKey: "stable-assignment-key",
      idempotencyKey: "stable-assignment-key",
    });
  });

  it("generates a unique key for each new assignment intent", () => {
    const first = createAssignTechnicianOperationKey("line-1", "tech-1");
    const second = createAssignTechnicianOperationKey("line-1", "tech-1");

    expect(first).toContain("assign-technician:line-1:tech-1:");
    expect(second).toContain("assign-technician:line-1:tech-1:");
    expect(first).not.toBe(second);
  });

  it("surfaces the route error to the assigning control", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: vi.fn().mockResolvedValue({ error: "FINANCIALLY_LOCKED" }),
      }),
    );

    await expect(
      assignWorkOrderLineTechnician({
        lineId: "line-1",
        technicianId: "tech-1",
        operationKey: "failed-assignment-key",
      }),
    ).rejects.toMatchObject({
      message: "FINANCIALLY_LOCKED",
      status: 409,
    });
  });
});
