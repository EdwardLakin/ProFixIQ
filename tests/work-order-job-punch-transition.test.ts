import { describe, expect, it } from "vitest";
import { applyJobPunchTransition } from "@/features/work-orders/server/applyJobPunchTransition";

type RpcCall = {
  name: string;
  args: Record<string, unknown>;
};

class FakeSupabase {
  line: { id: string; shop_id: string | null } | null = {
    id: "line-1",
    shop_id: "shop-1",
  };
  lineError: { message: string } | null = null;
  rpcData: unknown = { ok: true };
  rpcError: { message: string; details?: string | null; hint?: string | null } | null =
    null;
  rpcCalls: RpcCall[] = [];

  from(table: string) {
    if (table !== "work_order_lines") {
      throw new Error(`Unexpected table read: ${table}`);
    }
    const line = this.line;
    const lineError = this.lineError;
    return {
      select() {
        return this;
      },
      eq() {
        return this;
      },
      maybeSingle() {
        return Promise.resolve({ data: line, error: lineError });
      },
    };
  }

  async rpc(name: string, args: Record<string, unknown>) {
    this.rpcCalls.push({ name, args });
    return { data: this.rpcData, error: this.rpcError };
  }
}

describe("applyJobPunchTransition atomic boundary", () => {
  it("requires a stable operation key before reading or mutating state", async () => {
    const db = new FakeSupabase();

    const result = await applyJobPunchTransition({
      supabase: db as never,
      lineId: "line-1",
      action: "pause",
      technicianId: "tech-1",
      options: { pause: { holdReason: "Waiting for parts" } },
    });

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "A stable operation key is required for job punch transitions.",
    });
    expect(db.rpcCalls).toHaveLength(0);
  });

  it("sends pause details to the shop-scoped idempotent RPC", async () => {
    const db = new FakeSupabase();

    const result = await applyJobPunchTransition({
      supabase: db as never,
      lineId: "line-1",
      action: "pause",
      technicianId: "tech-1",
      options: {
        operationKey: "pause-1",
        nowIso: "2026-07-10T17:30:00.000Z",
        pause: {
          holdReason: "Waiting for parts",
          notes: "Vendor delivery is tomorrow.",
          event: "job_paused",
          details: { source: "mobile" },
        },
      },
    });

    expect(result).toEqual({ ok: true, payload: { ok: true } });
    expect(db.rpcCalls).toEqual([
      {
        name: "apply_job_punch_transition_atomic",
        args: expect.objectContaining({
          p_shop_id: "shop-1",
          p_work_order_line_id: "line-1",
          p_action: "pause",
          p_technician_id: "tech-1",
          p_operation_key: "shop-1:job-punch:pause-1",
          p_at: "2026-07-10T17:30:00.000Z",
          p_hold_reason: "Waiting for parts",
          p_notes: "Vendor delivery is tomorrow.",
          p_event: "job_paused",
          p_details: { source: "mobile" },
          p_preserve_line_status: false,
        }),
      },
    ]);
  });

  it("maps release-to-awaiting and financial-lock conflicts without local writes", async () => {
    const db = new FakeSupabase();

    const released = await applyJobPunchTransition({
      supabase: db as never,
      lineId: "line-1",
      action: "resume",
      technicianId: "manager-1",
      options: {
        operationKey: "resume-1",
        resume: { toAwaiting: true },
      },
    });

    expect(released.ok).toBe(true);
    expect(db.rpcCalls[0]?.args).toEqual(
      expect.objectContaining({
        p_action: "resume",
        p_release_to_awaiting: true,
        p_operation_key: "shop-1:job-punch:resume-1",
      }),
    );

    db.rpcError = { message: "FINANCIALLY_LOCKED: invoice issued" };
    const locked = await applyJobPunchTransition({
      supabase: db as never,
      lineId: "line-1",
      action: "start",
      technicianId: "tech-1",
      options: { operationKey: "start-1" },
    });

    expect(locked).toEqual({
      ok: false,
      status: 409,
      error: "FINANCIALLY_LOCKED: invoice issued",
    });
  });
});
