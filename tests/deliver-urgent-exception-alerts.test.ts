import { beforeEach, describe, expect, it, vi } from "vitest";

const syncAssistantNotificationsMock = vi.fn();

vi.mock("@/features/agent/server/syncAssistantNotifications", () => ({
  syncAssistantNotifications: syncAssistantNotificationsMock,
}));

type Row = Record<string, unknown>;

type SupabaseStubOptions = {
  profiles: Array<{ id: string; user_id: string | null; role: string | null }>;
  allThreadsByUser?: Record<string, string[]>;
  latestThreadByUser?: Record<string, string>;
  deliveredThreadIds?: Set<string>;
  conflictThreadIds?: Set<string>;
  failThreadsListForUser?: string;
};

function createSupabaseStub(opts: SupabaseStubOptions) {
  const createdThreads: Array<{ shop_id: string; user_id: string }> = [];
  const insertedMessages: Row[] = [];
  let threadCounter = 0;

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
      const existingId = opts.latestThreadByUser?.[userId];
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
    node.then = (
      resolve: (value: {
        data: Row[] | null;
        error: { message: string } | null;
      }) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => {
      const userId = filters.user_id as string;
      if (opts.failThreadsListForUser === userId) {
        return Promise.resolve({
          data: null,
          error: { message: "boom" },
        }).then(resolve, reject);
      }
      const rows = (opts.allThreadsByUser?.[userId] ?? []).map((id) => ({ id }));
      return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
    };
    return node;
  }

  function messagesTable() {
    let insertPayload: Row | null = null;
    let inserting = false;
    const filters: Record<string, unknown> = {};
    const node: Row = {};
    node.select = vi.fn(() => node);
    node.in = vi.fn((col: string, value: unknown) => {
      filters[col] = value;
      return node;
    });
    node.eq = vi.fn((col: string, value: unknown) => {
      filters[col] = value;
      return node;
    });
    node.limit = vi.fn(() => node);
    node.insert = vi.fn((payload: Row) => {
      inserting = true;
      insertPayload = payload;
      return node;
    });
    node.maybeSingle = vi.fn(() => {
      if (inserting) {
        const payload = insertPayload as Row;
        insertedMessages.push(payload);
        if (opts.conflictThreadIds?.has(payload.thread_id as string)) {
          return Promise.resolve({
            data: null,
            error: { code: "23505", message: "duplicate client_message_id" },
          });
        }
        return Promise.resolve({ data: { id: `msg-${insertedMessages.length}` }, error: null });
      }
      const threadIds = (filters.thread_id as string[]) ?? [];
      const alreadyDelivered = threadIds.some((id) => opts.deliveredThreadIds?.has(id));
      return Promise.resolve({
        data: alreadyDelivered ? { id: "existing-alert-message" } : null,
        error: null,
      });
    });
    return node;
  }

  const admin = {
    from: vi.fn((table: string) => {
      if (table === "profiles") return profilesTable();
      if (table === "shop_assistant_threads") return threadsTable();
      if (table === "shop_assistant_messages") return messagesTable();
      throw new Error(`Unexpected table: ${table}`);
    }),
  };

  return { admin, createdThreads, insertedMessages };
}

function notification(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "notif-1",
    shop_id: "shop-1",
    user_id: null,
    role: "owner",
    source: "ops",
    fingerprint: "fp-1",
    code: "shop_overloaded",
    level: "critical",
    title: "Shop overloaded",
    message: "Shop load is 95%.",
    href: "/dashboard",
    entity_type: "shop",
    entity_id: "shop-1",
    status: "active",
    metadata: {},
    first_seen_at: "2026-09-15T00:00:00.000Z",
    last_seen_at: "2026-09-15T00:00:00.000Z",
    acknowledged_at: null,
    acknowledged_by: null,
    resolved_at: null,
    created_at: "2026-09-15T00:00:00.000Z",
    updated_at: "2026-09-15T00:00:00.000Z",
    ...overrides,
  };
}

describe("deliverUrgentExceptionAlerts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delivers a currently-active critical notification into the recipient's thread", async () => {
    const { deliverUrgentExceptionAlerts } = await import(
      "@/features/operations/server/deliverUrgentExceptionAlerts"
    );
    syncAssistantNotificationsMock.mockResolvedValue([notification()]);
    const { admin, createdThreads, insertedMessages } = createSupabaseStub({
      profiles: [{ id: "p1", user_id: "u1", role: "owner" }],
    });

    const result = await deliverUrgentExceptionAlerts({ admin: admin as never, shopId: "shop-1" });

    expect(result.eligibleStaff).toBe(1);
    expect(result.candidates).toBe(1);
    expect(result.delivered).toBe(1);
    expect(createdThreads).toEqual([{ shop_id: "shop-1", user_id: "u1" }]);
    expect(insertedMessages[0]).toMatchObject({
      role: "assistant",
      kind: "state_update",
      client_message_id: "exception:notif-1",
    });
    expect(insertedMessages[0].content).toContain("Shop overloaded");
    expect(insertedMessages[0].content).toContain("Review: /dashboard");
  });

  it("ignores warning/info-level notifications — only critical (urgent) qualifies as an exception", async () => {
    const { deliverUrgentExceptionAlerts } = await import(
      "@/features/operations/server/deliverUrgentExceptionAlerts"
    );
    syncAssistantNotificationsMock.mockResolvedValue([
      notification({ id: "notif-warn", level: "warning" }),
      notification({ id: "notif-info", level: "info" }),
    ]);
    const { admin, insertedMessages } = createSupabaseStub({
      profiles: [{ id: "p1", user_id: "u1", role: "owner" }],
    });

    const result = await deliverUrgentExceptionAlerts({ admin: admin as never, shopId: "shop-1" });

    expect(result.candidates).toBe(0);
    expect(result.delivered).toBe(0);
    expect(insertedMessages).toHaveLength(0);
  });

  it("ignores an already-acknowledged or resolved critical notification — only 'active' status is a live exception", async () => {
    const { deliverUrgentExceptionAlerts } = await import(
      "@/features/operations/server/deliverUrgentExceptionAlerts"
    );
    syncAssistantNotificationsMock.mockResolvedValue([
      notification({ id: "notif-ack", status: "acknowledged" }),
      notification({ id: "notif-resolved", status: "resolved" }),
    ]);
    const { admin, insertedMessages } = createSupabaseStub({
      profiles: [{ id: "p1", user_id: "u1", role: "owner" }],
    });

    const result = await deliverUrgentExceptionAlerts({ admin: admin as never, shopId: "shop-1" });

    expect(result.candidates).toBe(0);
    expect(insertedMessages).toHaveLength(0);
  });

  it("extends to mechanics, unlike the shop-wide morning digest, since notifications are already scoped to their own assigned work", async () => {
    const { deliverUrgentExceptionAlerts } = await import(
      "@/features/operations/server/deliverUrgentExceptionAlerts"
    );
    syncAssistantNotificationsMock.mockResolvedValue([notification({ id: "notif-mech" })]);
    const { admin } = createSupabaseStub({
      profiles: [{ id: "p1", user_id: "u1", role: "mechanic" }],
    });

    const result = await deliverUrgentExceptionAlerts({ admin: admin as never, shopId: "shop-1" });

    expect(result.eligibleStaff).toBe(1);
    expect(result.delivered).toBe(1);
  });

  it("scopes a mechanic's notifications by profile id, not just the auth user id — assignment columns store the profile id", async () => {
    const { deliverUrgentExceptionAlerts } = await import(
      "@/features/operations/server/deliverUrgentExceptionAlerts"
    );
    syncAssistantNotificationsMock.mockResolvedValue([notification({ id: "notif-mech" })]);
    // A "linked" profile: profiles.id differs from profiles.user_id, as it
    // does for any normally-linked staff account.
    const { admin } = createSupabaseStub({
      profiles: [{ id: "profile-1", user_id: "auth-1", role: "mechanic" }],
    });

    await deliverUrgentExceptionAlerts({ admin: admin as never, shopId: "shop-1" });

    expect(syncAssistantNotificationsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "mechanic",
        userId: "profile-1",
        assignmentUserIds: expect.arrayContaining(["auth-1", "profile-1"]),
        supabaseClient: admin,
      }),
    );
  });

  it("computes the shop-wide notification set once and reuses it across every non-mechanic recipient, rather than rerunning the full scan per recipient", async () => {
    const { deliverUrgentExceptionAlerts } = await import(
      "@/features/operations/server/deliverUrgentExceptionAlerts"
    );
    syncAssistantNotificationsMock.mockResolvedValue([notification({ id: "notif-shared" })]);
    const { admin, insertedMessages } = createSupabaseStub({
      profiles: [
        { id: "p1", user_id: "u1", role: "owner" },
        { id: "p2", user_id: "u2", role: "manager" },
        { id: "p3", user_id: "u3", role: "advisor" },
      ],
    });

    const result = await deliverUrgentExceptionAlerts({ admin: admin as never, shopId: "shop-1" });

    expect(syncAssistantNotificationsMock).toHaveBeenCalledTimes(1);
    expect(syncAssistantNotificationsMock).toHaveBeenCalledWith(
      expect.objectContaining({ shopId: "shop-1", role: "owner", supabaseClient: admin }),
    );
    expect(syncAssistantNotificationsMock.mock.calls[0][0]).not.toHaveProperty("userId");
    expect(result.delivered).toBe(3);
    expect(insertedMessages).toHaveLength(3);
  });

  it("is idempotent forever per (recipient, notification) — a notification id already delivered in a non-latest thread is never delivered again", async () => {
    const { deliverUrgentExceptionAlerts } = await import(
      "@/features/operations/server/deliverUrgentExceptionAlerts"
    );
    syncAssistantNotificationsMock.mockResolvedValue([notification()]);
    const { admin, insertedMessages, createdThreads } = createSupabaseStub({
      profiles: [{ id: "p1", user_id: "u1", role: "owner" }],
      allThreadsByUser: { u1: ["thread-old", "thread-new"] },
      latestThreadByUser: { u1: "thread-new" },
      deliveredThreadIds: new Set(["thread-old"]),
    });

    const result = await deliverUrgentExceptionAlerts({ admin: admin as never, shopId: "shop-1" });

    expect(result.delivered).toBe(0);
    expect(result.alreadyDelivered).toBe(1);
    expect(insertedMessages).toHaveLength(0);
    expect(createdThreads).toHaveLength(0);
  });

  it("falls back to the (thread_id, client_message_id) unique-index conflict as a backstop for a genuinely concurrent first delivery", async () => {
    const { deliverUrgentExceptionAlerts } = await import(
      "@/features/operations/server/deliverUrgentExceptionAlerts"
    );
    syncAssistantNotificationsMock.mockResolvedValue([notification()]);
    const { admin } = createSupabaseStub({
      profiles: [{ id: "p1", user_id: "u1", role: "owner" }],
      latestThreadByUser: { u1: "thread-racy" },
      conflictThreadIds: new Set(["thread-racy"]),
    });

    const result = await deliverUrgentExceptionAlerts({ admin: admin as never, shopId: "shop-1" });

    expect(result.delivered).toBe(0);
    expect(result.alreadyDelivered).toBe(1);
    expect(result.errors).toHaveLength(0);
  });

  it("reports a shop-wide sync failure once, without attempting any delivery", async () => {
    const { deliverUrgentExceptionAlerts } = await import(
      "@/features/operations/server/deliverUrgentExceptionAlerts"
    );
    syncAssistantNotificationsMock.mockRejectedValue(new Error("boom"));
    const { admin, insertedMessages } = createSupabaseStub({
      profiles: [
        { id: "p1", user_id: "u1", role: "owner" },
        { id: "p2", user_id: "u2", role: "manager" },
      ],
    });

    const result = await deliverUrgentExceptionAlerts({ admin: admin as never, shopId: "shop-1" });

    expect(result.errors).toEqual(["shop-wide: boom"]);
    expect(result.delivered).toBe(0);
    expect(insertedMessages).toHaveLength(0);
  });

  it("reports one recipient's delivery failure without blocking delivery to the rest of the shop-wide sweep", async () => {
    const { deliverUrgentExceptionAlerts } = await import(
      "@/features/operations/server/deliverUrgentExceptionAlerts"
    );
    syncAssistantNotificationsMock.mockResolvedValue([notification({ id: "notif-shared" })]);
    const { admin, insertedMessages } = createSupabaseStub({
      profiles: [
        { id: "p1", user_id: "u1", role: "owner" },
        { id: "p2", user_id: "u2", role: "manager" },
      ],
      failThreadsListForUser: "u1",
    });

    const result = await deliverUrgentExceptionAlerts({ admin: admin as never, shopId: "shop-1" });

    expect(result.errors).toEqual([expect.stringContaining("staff u1:")]);
    expect(result.delivered).toBe(1);
    expect(insertedMessages).toHaveLength(1);
  });

  it("isolates a mechanic's own sync failure from the shared shop-wide delivery", async () => {
    const { deliverUrgentExceptionAlerts } = await import(
      "@/features/operations/server/deliverUrgentExceptionAlerts"
    );
    syncAssistantNotificationsMock.mockImplementation(
      async (params: { role: string | null }) => {
        if (params.role === "mechanic") throw new Error("mechanic boom");
        return [notification({ id: "notif-shared" })];
      },
    );
    const { admin, insertedMessages } = createSupabaseStub({
      profiles: [
        { id: "p1", user_id: "u1", role: "owner" },
        { id: "p2", user_id: "u2", role: "mechanic" },
      ],
    });

    const result = await deliverUrgentExceptionAlerts({ admin: admin as never, shopId: "shop-1" });

    expect(result.errors).toEqual(["staff u2: mechanic boom"]);
    expect(result.delivered).toBe(1);
    expect(insertedMessages).toHaveLength(1);
  });
});
