import { describe, expect, it, vi } from "vitest";
import { applyJobPunchTransition } from "@/features/work-orders/server/applyJobPunchTransition";
import { startTechnicianJobLabor } from "@/features/work-orders/server/technicianJobLabor";

const mocks = vi.hoisted(() => ({
  admin: null as unknown,
}));

vi.mock("@/features/shared/lib/supabase/server", () => ({
  createAdminSupabase: () => mocks.admin,
}));

type RpcCall = {
  name: string;
  args: Record<string, unknown>;
};

class FakeSupabase {
  authUserId: string | null = "tech-1";
  profile = {
    id: "tech-1",
    user_id: "tech-1" as string | null,
    role: "mechanic" as string | null,
    shop_id: "shop-1" as string | null,
    completed_onboarding: true,
    must_change_password: false,
    email: "tech-1@example.com",
    full_name: "Test Technician",
  };
  line: {
    id: string;
    shop_id: string | null;
    assigned_tech_id: string | null;
  } | null = {
    id: "line-1",
    shop_id: "shop-1",
    assigned_tech_id: "tech-1",
  };
  lineError: { message: string } | null = null;
  additionalAssignment: { id: string } | null = null;
  activeSegment: { id: string } | null = { id: "segment-1" };
  rpcData: unknown = { ok: true };
  rpcError: { message: string; details?: string | null; hint?: string | null } | null =
    null;
  rpcCalls: RpcCall[] = [];

  constructor() {
    mocks.admin = this;
  }

  get auth() {
    return {
      getUser: async () => ({
        data: {
          user: this.authUserId ? { id: this.authUserId } : null,
        },
        error: null,
      }),
    };
  }

  setActor(id: string, role: string) {
    this.authUserId = id;
    this.profile = {
      ...this.profile,
      id,
      user_id: id,
      role,
      email: `${id}@example.com`,
      full_name: id,
    };
    if (this.line) this.line.assigned_tech_id = id;
  }

  from(table: string) {
    const query = {
      select() {
        return query;
      },
      eq() {
        return query;
      },
      or() {
        return query;
      },
      is() {
        return query;
      },
      limit() {
        return query;
      },
      maybeSingle: () => {
        if (table === "profiles") {
          return Promise.resolve({ data: this.profile, error: null });
        }
        if (table === "work_order_lines") {
          return Promise.resolve({ data: this.line, error: this.lineError });
        }
        if (table === "work_order_line_technicians") {
          return Promise.resolve({ data: this.additionalAssignment, error: null });
        }
        if (table === "work_order_line_labor_segments") {
          return Promise.resolve({ data: this.activeSegment, error: null });
        }
        throw new Error(`Unexpected table read: ${table}`);
      },
      returns: () => {
        if (table !== "profiles") {
          throw new Error(`Unexpected multi-row read: ${table}`);
        }
        return Promise.resolve({ data: [this.profile], error: null });
      },
    };
    return query;
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
    db.setActor("manager-1", "manager");

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

    db.setActor("tech-1", "mechanic");
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

  it("maps unsigned inspection completion to a retryable conflict", async () => {
    const db = new FakeSupabase();
    db.rpcError = {
      message:
        "INSPECTION_COMPLETION_REQUIRED: complete and sign the inspection before finishing this job.",
    };

    const result = await applyJobPunchTransition({
      supabase: db as never,
      lineId: "line-1",
      action: "finish",
      technicianId: "tech-1",
      options: { operationKey: "finish-1" },
    });

    expect(result).toMatchObject({
      ok: false,
      status: 409,
    });
  });

  it("preserves trusted break auto-resume for a currently capable technician", async () => {
    const db = new FakeSupabase();
    db.authUserId = null;

    const result = await startTechnicianJobLabor({
      supabase: db as never,
      lineId: "line-1",
      technicianId: "tech-1",
      operationKey: "break-resume-1",
      source: "break_resume",
    });

    expect(result).toEqual({ ok: true, payload: { ok: true } });
    expect(db.rpcCalls).toHaveLength(1);
    expect(db.rpcCalls[0]?.args).toEqual(
      expect.objectContaining({
        p_actor_user_id: "tech-1",
        p_technician_id: "tech-1",
        p_start_source: "job_resumed_after_break",
      }),
    );
  });

  it("does not auto-resume labor after the technician capability is revoked", async () => {
    const db = new FakeSupabase();
    db.setActor("tech-1", "parts");
    db.authUserId = null;

    const result = await startTechnicianJobLabor({
      supabase: db as never,
      lineId: "line-1",
      technicianId: "tech-1",
      operationKey: "break-resume-revoked",
      source: "break_resume",
    });

    expect(result).toEqual({
      ok: false,
      status: 401,
      error: "Unauthorized",
    });
    expect(db.rpcCalls).toHaveLength(0);
  });
});
