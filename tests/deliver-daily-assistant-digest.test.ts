import { beforeEach, describe, expect, it, vi } from "vitest";

const getOpsNotificationsMock = vi.fn();

vi.mock("@/features/agent/server/getOpsNotifications", async () => {
  const actual = await vi.importActual<
    typeof import("@/features/agent/server/getOpsNotifications")
  >("@/features/agent/server/getOpsNotifications");
  return {
    ...actual,
    getOpsNotifications: getOpsNotificationsMock,
  };
});

type Row = Record<string, unknown>;

type SupabaseStubOptions = {
  timezone: string | null;
  profiles: Array<{ id: string; user_id: string | null; role: string | null }>;
  existingThreadsByUser?: Record<string, string>;
  conflictThreadIds?: Set<string>;
};

function createSupabaseStub(opts: SupabaseStubOptions) {
  const createdThreads: Array<{ shop_id: string; user_id: string }> = [];
  const insertedMessages: Row[] = [];
  let threadCounter = 0;

  function shopsTable() {
    const node: Row = {};
    node.select = vi.fn(() => node);
    node.eq = vi.fn(() => node);
    node.maybeSingle = vi.fn(() =>
      Promise.resolve({ data: { timezone: opts.timezone }, error: null }),
    );
    return node;
  }

  function profilesTable() {
    const node: Row = {};
    node.select = vi.fn(() => node);
    node.eq = vi.fn(() => node);
    node.then = (
      resolve: (value: { data: Row[]; error: null }) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve({ data: opts.profiles, error: null }).then(resolve, reject);
    return node;
  }

  function threadsTable() {
    const filters: Record<string, unknown> = {};
    let insertPayload: Row | null = null;
    const node: Row = {};
    node.select = vi.fn(() => node);
    node.eq = vi.fn((col: string, value: unknown) => {
      filters[col] = value;
      return node;
    });
    node.is = vi.fn(() => node);
    node.order = vi.fn(() => node);
    node.limit = vi.fn(() => node);
    node.insert = vi.fn((payload: Row) => {
      insertPayload = payload;
      return node;
    });
    node.maybeSingle = vi.fn(() => {
      const userId = filters.user_id as string;
      const existingId = opts.existingThreadsByUser?.[userId];
      return Promise.resolve({ data: existingId ? { id: existingId } : null, error: null });
    });
    node.single = vi.fn(() => {
      const id = `thread-${++threadCounter}`;
      createdThreads.push({
        shop_id: insertPayload?.shop_id as string,
        user_id: insertPayload?.user_id as string,
      });
      return Promise.resolve({ data: { id }, error: null });
    });
    return node;
  }

  function messagesTable() {
    let insertPayload: Row | null = null;
    const node: Row = {};
    node.insert = vi.fn((payload: Row) => {
      insertPayload = payload;
      return node;
    });
    node.select = vi.fn(() => node);
    node.maybeSingle = vi.fn(() => {
      const payload = insertPayload as Row;
      insertedMessages.push(payload);
      if (opts.conflictThreadIds?.has(payload.thread_id as string)) {
        return Promise.resolve({
          data: null,
          error: { code: "23505", message: "duplicate client_message_id" },
        });
      }
      return Promise.resolve({ data: { id: `msg-${insertedMessages.length}` }, error: null });
    });
    return node;
  }

  const admin = {
    from: vi.fn((table: string) => {
      if (table === "shops") return shopsTable();
      if (table === "profiles") return profilesTable();
      if (table === "shop_assistant_threads") return threadsTable();
      if (table === "shop_assistant_messages") return messagesTable();
      throw new Error(`Unexpected table: ${table}`);
    }),
  };

  return { admin, createdThreads, insertedMessages };
}

describe("deliverDailyAssistantDigest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not deliver outside the shop's local morning window", async () => {
    const { deliverDailyAssistantDigest } = await import(
      "@/features/operations/server/deliverDailyAssistantDigest"
    );
    getOpsNotificationsMock.mockResolvedValue([
      { level: "warning", code: "parts_waiting_too_long", title: "t", message: "m" },
    ]);
    const { admin } = createSupabaseStub({
      timezone: "UTC",
      profiles: [{ id: "p1", user_id: "u1", role: "owner" }],
    });

    // 2026-09-15T20:00:00Z is 8pm UTC — outside the 6am-10am morning window.
    const result = await deliverDailyAssistantDigest({
      admin: admin as never,
      shopId: "shop-1",
      now: new Date("2026-09-15T20:00:00.000Z"),
    });

    expect(result.inMorningWindow).toBe(false);
    expect(result.delivered).toBe(0);
    expect(getOpsNotificationsMock).not.toHaveBeenCalled();
  });

  it("delivers nothing (and does not spam an all-clear message) when there are no notifications", async () => {
    const { deliverDailyAssistantDigest } = await import(
      "@/features/operations/server/deliverDailyAssistantDigest"
    );
    getOpsNotificationsMock.mockResolvedValue([]);
    const { admin, insertedMessages } = createSupabaseStub({
      timezone: "UTC",
      profiles: [{ id: "p1", user_id: "u1", role: "owner" }],
    });

    const result = await deliverDailyAssistantDigest({
      admin: admin as never,
      shopId: "shop-1",
      now: new Date("2026-09-15T07:00:00.000Z"),
    });

    expect(result.inMorningWindow).toBe(true);
    expect(result.delivered).toBe(0);
    expect(insertedMessages).toHaveLength(0);
  });

  it("delivers a digest into a new thread for each eligible shop-wide staff member, excluding mechanics", async () => {
    const { deliverDailyAssistantDigest } = await import(
      "@/features/operations/server/deliverDailyAssistantDigest"
    );
    getOpsNotificationsMock.mockResolvedValue([
      { level: "urgent", code: "work_order_on_hold_too_long", title: "On hold", message: "WO #1 on hold." },
      { level: "warning", code: "parts_waiting_too_long", title: "Parts waiting", message: "WO #2 waiting." },
    ]);
    const { admin, createdThreads, insertedMessages } = createSupabaseStub({
      timezone: "UTC",
      profiles: [
        { id: "p-owner", user_id: "u-owner", role: "owner" },
        { id: "p-mechanic", user_id: "u-mechanic", role: "mechanic" },
      ],
    });

    const result = await deliverDailyAssistantDigest({
      admin: admin as never,
      shopId: "shop-1",
      now: new Date("2026-09-15T07:00:00.000Z"),
    });

    expect(result.eligibleStaff).toBe(1);
    expect(result.delivered).toBe(1);
    expect(createdThreads).toEqual([{ shop_id: "shop-1", user_id: "u-owner" }]);
    expect(insertedMessages).toHaveLength(1);
    expect(insertedMessages[0]).toMatchObject({
      role: "assistant",
      kind: "state_update",
      client_message_id: "daily-digest:2026-09-15",
    });
    expect(insertedMessages[0].content).toContain("On hold");
    expect(insertedMessages[0].content).toContain("Parts waiting");
  });

  it("resolves the auth user id via profiles.user_id, falling back to profiles.id for unlinked profiles", async () => {
    const { deliverDailyAssistantDigest } = await import(
      "@/features/operations/server/deliverDailyAssistantDigest"
    );
    getOpsNotificationsMock.mockResolvedValue([
      { level: "warning", code: "parts_waiting_too_long", title: "t", message: "m" },
    ]);
    const { admin, createdThreads } = createSupabaseStub({
      timezone: "UTC",
      profiles: [{ id: "legacy-profile-1", user_id: null, role: "admin" }],
    });

    await deliverDailyAssistantDigest({
      admin: admin as never,
      shopId: "shop-1",
      now: new Date("2026-09-15T07:00:00.000Z"),
    });

    expect(createdThreads).toEqual([
      { shop_id: "shop-1", user_id: "legacy-profile-1" },
    ]);
  });

  it("is idempotent per shop-local day — a conflicting insert counts as already delivered, not an error", async () => {
    const { deliverDailyAssistantDigest } = await import(
      "@/features/operations/server/deliverDailyAssistantDigest"
    );
    getOpsNotificationsMock.mockResolvedValue([
      { level: "warning", code: "parts_waiting_too_long", title: "t", message: "m" },
    ]);
    const { admin } = createSupabaseStub({
      timezone: "UTC",
      profiles: [{ id: "p1", user_id: "u1", role: "owner" }],
      existingThreadsByUser: { u1: "thread-existing" },
      conflictThreadIds: new Set(["thread-existing"]),
    });

    const result = await deliverDailyAssistantDigest({
      admin: admin as never,
      shopId: "shop-1",
      now: new Date("2026-09-15T07:00:00.000Z"),
    });

    expect(result.delivered).toBe(0);
    expect(result.alreadyDelivered).toBe(1);
    expect(result.errors).toHaveLength(0);
  });
});
