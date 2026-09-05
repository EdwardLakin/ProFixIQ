import { describe, expect, it, vi } from "vitest";

import { respondToShiftPunch } from "@/features/copilot/technician/server/shiftPunch";

type ChainResult = { data: unknown; error: { message: string } | null };

function chain(result: ChainResult) {
  const obj: Record<string, unknown> = {};
  for (const method of ["select", "eq", "in", "is", "order", "limit"]) {
    obj[method] = vi.fn(() => obj);
  }
  obj.maybeSingle = vi.fn(async () => result);
  obj.then = (
    resolve: (value: ChainResult) => unknown,
    reject?: (reason: unknown) => unknown,
  ) => Promise.resolve(result).then(resolve, reject);
  return obj;
}

function fakeSupabase(params: {
  shiftId: string | null;
  events: Array<{ event_type: string; timestamp: string }>;
  rpcResult?: ChainResult;
}) {
  const rpc = vi.fn(
    async () => params.rpcResult ?? { data: { ok: true }, error: null },
  );
  const from = vi.fn((table: string) => {
    if (table === "tech_shifts") {
      return chain({
        data: params.shiftId ? { id: params.shiftId } : null,
        error: null,
      });
    }
    if (table === "punch_events") {
      return chain({ data: params.events, error: null });
    }
    throw new Error(`unexpected table ${table}`);
  });
  return { from, rpc } as never;
}

const identity = {
  authUserId: "00000000-0000-4000-8000-000000000011",
  profileId: "00000000-0000-4000-8000-000000000010",
  shopId: "00000000-0000-4000-8000-000000000001",
};
const shiftId = "00000000-0000-4000-8000-000000000900";

const workingEvents = [
  { event_type: "start_shift", timestamp: "2026-09-05T08:00:00Z" },
];
const onBreakEvents = [
  ...workingEvents,
  { event_type: "break_start", timestamp: "2026-09-05T12:00:00Z" },
];
const onLunchEvents = [
  ...workingEvents,
  { event_type: "lunch_start", timestamp: "2026-09-05T12:00:00Z" },
];

describe("respondToShiftPunch: not clocked in", () => {
  it("declines every punch when there's no active shift", async () => {
    const supabase = fakeSupabase({ shiftId: null, events: [] });
    const reply = await respondToShiftPunch({
      identity: { ...identity, supabase },
      turnId: "turn-1",
      action: { type: "shift.break.start" },
    });
    expect(reply).toBe(
      "You're not clocked in, so there's no shift to punch a break on.",
    );
    expect((supabase as { rpc: ReturnType<typeof vi.fn> }).rpc).not.toHaveBeenCalled();
  });
});

describe("respondToShiftPunch: break", () => {
  it("starts a break when currently working", async () => {
    const supabase = fakeSupabase({ shiftId, events: workingEvents });
    const reply = await respondToShiftPunch({
      identity: { ...identity, supabase },
      turnId: "turn-2",
      action: { type: "shift.break.start" },
    });
    expect(reply).toBe("Break started.");
    expect(
      (supabase as { rpc: ReturnType<typeof vi.fn> }).rpc,
    ).toHaveBeenCalledWith(
      "apply_canonical_offline_shift_punch_atomic",
      expect.objectContaining({
        p_shop_id: identity.shopId,
        p_actor_profile_id: identity.profileId,
        p_actor_auth_user_id: identity.authUserId,
        p_shift_id: shiftId,
        p_event_type: "break_start",
      }),
    );
  });

  it("treats starting a break already on break as idempotent, not a double punch", async () => {
    const supabase = fakeSupabase({ shiftId, events: onBreakEvents });
    const reply = await respondToShiftPunch({
      identity: { ...identity, supabase },
      turnId: "turn-3",
      action: { type: "shift.break.start" },
    });
    expect(reply).toBe("You're already on break.");
    expect((supabase as { rpc: ReturnType<typeof vi.fn> }).rpc).not.toHaveBeenCalled();
  });

  it("declines to start a break while already on lunch", async () => {
    const supabase = fakeSupabase({ shiftId, events: onLunchEvents });
    const reply = await respondToShiftPunch({
      identity: { ...identity, supabase },
      turnId: "turn-4",
      action: { type: "shift.break.start" },
    });
    expect(reply).toBe(
      "You're on lunch right now — end that first if you want to switch to a break.",
    );
    expect((supabase as { rpc: ReturnType<typeof vi.fn> }).rpc).not.toHaveBeenCalled();
  });

  it("ends a break that's actually in progress", async () => {
    const supabase = fakeSupabase({ shiftId, events: onBreakEvents });
    const reply = await respondToShiftPunch({
      identity: { ...identity, supabase },
      turnId: "turn-5",
      action: { type: "shift.break.end" },
    });
    expect(reply).toBe("Break ended.");
    expect(
      (supabase as { rpc: ReturnType<typeof vi.fn> }).rpc,
    ).toHaveBeenCalledWith(
      "apply_canonical_offline_shift_punch_atomic",
      expect.objectContaining({ p_event_type: "break_end" }),
    );
  });

  it("says so, without erroring, when asked to end a break that isn't happening", async () => {
    const supabase = fakeSupabase({ shiftId, events: workingEvents });
    const reply = await respondToShiftPunch({
      identity: { ...identity, supabase },
      turnId: "turn-6",
      action: { type: "shift.break.end" },
    });
    expect(reply).toBe("You're not on break right now.");
    expect((supabase as { rpc: ReturnType<typeof vi.fn> }).rpc).not.toHaveBeenCalled();
  });
});

describe("respondToShiftPunch: lunch", () => {
  it("starts lunch when currently working", async () => {
    const supabase = fakeSupabase({ shiftId, events: workingEvents });
    const reply = await respondToShiftPunch({
      identity: { ...identity, supabase },
      turnId: "turn-7",
      action: { type: "shift.lunch.start" },
    });
    expect(reply).toBe("Lunch started.");
  });

  it("treats starting lunch already on lunch as idempotent", async () => {
    const supabase = fakeSupabase({ shiftId, events: onLunchEvents });
    const reply = await respondToShiftPunch({
      identity: { ...identity, supabase },
      turnId: "turn-8",
      action: { type: "shift.lunch.start" },
    });
    expect(reply).toBe("You're already on lunch.");
    expect((supabase as { rpc: ReturnType<typeof vi.fn> }).rpc).not.toHaveBeenCalled();
  });

  it("ends lunch that's actually in progress", async () => {
    const supabase = fakeSupabase({ shiftId, events: onLunchEvents });
    const reply = await respondToShiftPunch({
      identity: { ...identity, supabase },
      turnId: "turn-9",
      action: { type: "shift.lunch.end" },
    });
    expect(reply).toBe("Lunch ended.");
    expect(
      (supabase as { rpc: ReturnType<typeof vi.fn> }).rpc,
    ).toHaveBeenCalledWith(
      "apply_canonical_offline_shift_punch_atomic",
      expect.objectContaining({ p_event_type: "lunch_end" }),
    );
  });
});

describe("respondToShiftPunch: failures", () => {
  it("returns a safe reply and never throws when the punch RPC errors", async () => {
    const supabase = fakeSupabase({
      shiftId,
      events: workingEvents,
      rpcResult: { data: null, error: { message: "db exploded" } },
    });
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const reply = await respondToShiftPunch({
      identity: { ...identity, supabase },
      turnId: "turn-10",
      action: { type: "shift.break.start" },
    });
    errorLog.mockRestore();
    expect(reply).toBe("I couldn't start that break. Try again.");
  });
});
