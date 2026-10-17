import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { JOB_FINISH_REPLAYED_EVENT } from "@/features/shared/lib/offline/jobFinishEvents";
import { replayJobPunchTransition } from "@/features/shared/lib/offline/jobPunchReplay";
import { projectTechnicianWorkOrderSnapshot } from "@/features/work-orders/mobile/technicianOfflineExecution";

const LINE = "22222222-2222-4222-8222-222222222222";

function mutation(payload: Record<string, unknown>, status = "queued") {
  return {
    clientMutationId: "job_punch:finish:key-1",
    actionType: "job:punch-transition",
    userId: "user-1",
    shopId: "shop-1",
    createdAt: "2026-10-17T10:00:00.000Z",
    status,
    payload: {
      lineId: LINE,
      action: "finish",
      operationKey: "key-1",
      occurredAt: "2026-10-17T10:00:00.000Z",
      body: { cause: "Worn seal", correction: "Replaced seal" },
      ...payload,
    },
  } as never;
}

function snapshot() {
  return {
    workOrder: { id: "wo-1" },
    lines: [{ id: LINE, status: "in_progress", cause: null, correction: null, punched_out_at: null }],
  } as never;
}

function projected(mutations: unknown[]) {
  const result = projectTechnicianWorkOrderSnapshot(snapshot(), mutations as never[]) as {
    lines: Array<{ status: string; cause: string | null; punched_out_at: string | null }>;
  };
  return result.lines[0];
}

describe("projecting a queued Finish", () => {
  it("shows an ordinary Shop finish as completed, exactly as before", () => {
    expect(projected([mutation({ equipmentClass: "standard" })]).status).toBe("completed");
  });

  it("keeps a finish queued before this change completed too", () => {
    expect(projected([mutation({})]).status).toBe("completed");
  });

  it("does not show an Equipment finish as completed while it is pending", () => {
    const line = projected([mutation({ equipmentClass: "equipment" })]);
    expect(line.status).toBe("in_progress");
    expect(line.punched_out_at).toBeNull();
    // The technician's typed story is still shown.
    expect(line.cause).toBe("Worn seal");
  });

  it("does not show an undetermined finish as completed either", () => {
    expect(projected([mutation({ equipmentClass: "unknown" })]).status).toBe("in_progress");
  });

  it("ignores a conflicted finish, as before", () => {
    expect(projected([mutation({ equipmentClass: "standard" }, "conflicted")]).status).toBe("in_progress");
  });
});

describe("replaying a queued Finish", () => {
  const events: Array<{ lineId: string; lineClosed: boolean }> = [];
  const listener = (event: Event) => events.push((event as CustomEvent).detail);

  beforeEach(() => {
    events.length = 0;
    window.addEventListener(JOB_FINISH_REPLAYED_EVENT, listener);
  });
  afterEach(() => window.removeEventListener(JOB_FINISH_REPLAYED_EVENT, listener));

  function server(body: unknown, ok = true, status = 200) {
    const fetchMock = vi.fn().mockResolvedValue({ ok, status, json: async () => body });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("reports a closed line when the server says lineClosed=true", async () => {
    const fetchMock = server({ success: true, lineClosed: true });
    await replayJobPunchTransition(mutation({ equipmentClass: "equipment" }));
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/work-orders/lines/${LINE}/finish`);
    expect(events).toEqual([{ lineId: LINE, lineClosed: true }]);
  });

  it("reports an open line when the server says lineClosed=false", async () => {
    server({ success: true, lineClosed: false, remaining: [{ technicianId: "t2", state: "running" }] });
    await replayJobPunchTransition(mutation({ equipmentClass: "equipment" }));
    expect(events).toEqual([{ lineId: LINE, lineClosed: false }]);
  });

  it("treats an undetermined finish answered by the standard path as completed", async () => {
    server({ success: true });
    await replayJobPunchTransition(mutation({ equipmentClass: "unknown" }));
    expect(events).toEqual([{ lineId: LINE, lineClosed: true }]);
  });

  it("emits nothing for an ordinary Shop finish or one queued before this change", async () => {
    server({ success: true });
    await replayJobPunchTransition(mutation({ equipmentClass: "standard" }));
    await replayJobPunchTransition(mutation({}));
    expect(events).toEqual([]);
  });

  it("emits nothing for other actions", async () => {
    server({ success: true, lineClosed: false });
    await replayJobPunchTransition(mutation({ action: "start", equipmentClass: "equipment" }));
    expect(events).toEqual([]);
  });

  it("surfaces a rejected replay as a failure and never claims an outcome", async () => {
    server({ error: "Cannot finish" }, false, 409);
    await expect(replayJobPunchTransition(mutation({ equipmentClass: "equipment" }))).rejects.toMatchObject({
      message: "Cannot finish",
      status: 409,
    });
    expect(events).toEqual([]);
  });

  it("flags missing data as a conflict rather than guessing", async () => {
    server({ success: true });
    const result = await replayJobPunchTransition(mutation({ lineId: "" }));
    expect(result).toEqual({ conflicted: "Job transition is missing required offline data." });
    expect(events).toEqual([]);
  });
});
