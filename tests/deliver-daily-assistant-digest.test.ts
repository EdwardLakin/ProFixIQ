import { beforeEach, describe, expect, it, vi } from "vitest";

const getRoleDailySummaryMock = vi.fn();

vi.mock("@/features/agent/server/getRoleDailySummary", () => ({
  getRoleDailySummary: getRoleDailySummaryMock,
}));

type Row = Record<string, unknown>;

type SupabaseStubOptions = {
  timezone: string | null;
  profiles: Array<{ id: string; user_id: string | null; role: string | null }>;
  /** Every thread id a given recipient (auth user id) already has, regardless of which is "latest". */
  allThreadsByUser?: Record<string, string[]>;
  /** Which of those thread ids is treated as the most-recently-active one to append to. */
  latestThreadByUser?: Record<string, string>;
  /** Thread ids that already contain a delivered digest message (any day). */
  deliveredThreadIds?: Set<string>;
  /** Thread ids whose message insert should race-conflict (23505) rather than succeed. */
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
    // The "pick the latest thread" lookup (.is().order().limit().maybeSingle()).
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
    // The "list every thread this recipient has" query (no terminal call).
    node.then = (
      resolve: (value: { data: Row[]; error: null }) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => {
      const userId = filters.user_id as string;
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
      // The existence check: any of these thread ids already carry a delivered digest?
      const threadIds = (filters.thread_id as string[]) ?? [];
      const alreadyDelivered = threadIds.some((id) => opts.deliveredThreadIds?.has(id));
      return Promise.resolve({
        data: alreadyDelivered ? { id: "existing-digest-message" } : null,
        error: null,
      });
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

function summaryFor(role: string, text = `${role} snapshot for today.`) {
  return {
    role,
    summaryText: text,
    actionItems: [],
    links: [],
    notifications: [],
    sourceSnapshot: {},
  };
}

describe("deliverDailyAssistantDigest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not deliver outside the shop's local morning window", async () => {
    const { deliverDailyAssistantDigest } = await import(
      "@/features/operations/server/deliverDailyAssistantDigest"
    );
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
    expect(getRoleDailySummaryMock).not.toHaveBeenCalled();
  });

  it("treats a null/unset shop timezone as UTC instead of throwing", async () => {
    const { deliverDailyAssistantDigest } = await import(
      "@/features/operations/server/deliverDailyAssistantDigest"
    );
    getRoleDailySummaryMock.mockResolvedValue(summaryFor("owner"));
    const { admin } = createSupabaseStub({
      timezone: null,
      profiles: [{ id: "p1", user_id: "u1", role: "owner" }],
    });

    const result = await deliverDailyAssistantDigest({
      admin: admin as never,
      shopId: "shop-1",
      now: new Date("2026-09-15T07:00:00.000Z"),
    });

    expect(result.inMorningWindow).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("stays correct in the shop's own timezone across a DST transition, not a fixed elapsed-hours guess", async () => {
    const { deliverDailyAssistantDigest } = await import(
      "@/features/operations/server/deliverDailyAssistantDigest"
    );
    getRoleDailySummaryMock.mockResolvedValue(summaryFor("owner"));
    const { admin } = createSupabaseStub({
      timezone: "America/New_York",
      profiles: [{ id: "p1", user_id: "u1", role: "owner" }],
    });

    // 2026-03-08 is the US spring-forward date; clocks jump 2am -> 3am EST/EDT.
    // 06:42 local (EDT, UTC-4) on that date is 10:42 UTC. An elapsed-ms-since-
    // local-midnight calculation would compute only ~5.7 "hours" and wrongly
    // treat this as outside the 6am-10am window.
    const result = await deliverDailyAssistantDigest({
      admin: admin as never,
      shopId: "shop-1",
      now: new Date("2026-03-08T10:42:00.000Z"),
    });

    expect(result.inMorningWindow).toBe(true);
    expect(result.delivered).toBe(1);
  });

  it("skips delivery (defensively) when the canonical summary comes back blank", async () => {
    const { deliverDailyAssistantDigest } = await import(
      "@/features/operations/server/deliverDailyAssistantDigest"
    );
    getRoleDailySummaryMock.mockResolvedValue(summaryFor("owner", "   "));
    const { admin, insertedMessages } = createSupabaseStub({
      timezone: "UTC",
      profiles: [{ id: "p1", user_id: "u1", role: "owner" }],
    });

    const result = await deliverDailyAssistantDigest({
      admin: admin as never,
      shopId: "shop-1",
      now: new Date("2026-09-15T07:00:00.000Z"),
    });

    expect(result.delivered).toBe(0);
    expect(insertedMessages).toHaveLength(0);
  });

  it("delivers each eligible shop-wide staff member their own role-aware summary into a new thread, excluding mechanics", async () => {
    const { deliverDailyAssistantDigest } = await import(
      "@/features/operations/server/deliverDailyAssistantDigest"
    );
    getRoleDailySummaryMock.mockImplementation(
      async (params: { role: string | null }) => summaryFor(params.role ?? "owner"),
    );
    const { admin, createdThreads, insertedMessages } = createSupabaseStub({
      timezone: "UTC",
      profiles: [
        { id: "p-owner", user_id: "u-owner", role: "owner" },
        { id: "p-advisor", user_id: "u-advisor", role: "advisor" },
        { id: "p-mechanic", user_id: "u-mechanic", role: "mechanic" },
      ],
    });

    const result = await deliverDailyAssistantDigest({
      admin: admin as never,
      shopId: "shop-1",
      now: new Date("2026-09-15T07:00:00.000Z"),
    });

    expect(result.eligibleStaff).toBe(2);
    expect(result.delivered).toBe(2);
    expect(createdThreads).toEqual(
      expect.arrayContaining([
        { shop_id: "shop-1", user_id: "u-owner" },
        { shop_id: "shop-1", user_id: "u-advisor" },
      ]),
    );
    expect(createdThreads).toHaveLength(2);
    expect(insertedMessages).toHaveLength(2);
    expect(getRoleDailySummaryMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ role: "mechanic" }),
    );

    const ownerMessage = insertedMessages.find(
      (m) => (m.payload as Record<string, unknown>).role === "owner",
    );
    expect(ownerMessage).toMatchObject({
      role: "assistant",
      kind: "state_update",
      client_message_id: "daily-digest:2026-09-15",
      content: "owner snapshot for today.",
    });
  });

  it("calls the canonical summary contract with the resolved auth user id, profile id, and role for each staff member", async () => {
    const { deliverDailyAssistantDigest } = await import(
      "@/features/operations/server/deliverDailyAssistantDigest"
    );
    getRoleDailySummaryMock.mockResolvedValue(summaryFor("admin"));
    const { admin } = createSupabaseStub({
      timezone: "UTC",
      profiles: [{ id: "legacy-profile-1", user_id: null, role: "admin" }],
    });

    await deliverDailyAssistantDigest({
      admin: admin as never,
      shopId: "shop-1",
      now: new Date("2026-09-15T07:00:00.000Z"),
    });

    expect(getRoleDailySummaryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        shopId: "shop-1",
        userId: "legacy-profile-1",
        profileId: "legacy-profile-1",
        role: "admin",
        supabaseClient: admin,
      }),
    );
  });

  it("is idempotent per shop-local day when the digest already exists in the recipient's latest thread — never calling the summary contract at all", async () => {
    const { deliverDailyAssistantDigest } = await import(
      "@/features/operations/server/deliverDailyAssistantDigest"
    );
    const { admin, insertedMessages } = createSupabaseStub({
      timezone: "UTC",
      profiles: [{ id: "p1", user_id: "u1", role: "owner" }],
      allThreadsByUser: { u1: ["thread-existing"] },
      deliveredThreadIds: new Set(["thread-existing"]),
    });

    const result = await deliverDailyAssistantDigest({
      admin: admin as never,
      shopId: "shop-1",
      now: new Date("2026-09-15T07:00:00.000Z"),
    });

    expect(result.delivered).toBe(0);
    expect(result.alreadyDelivered).toBe(1);
    expect(result.errors).toHaveLength(0);
    expect(insertedMessages).toHaveLength(0);
    expect(getRoleDailySummaryMock).not.toHaveBeenCalled();
  });

  it("recognizes today's digest already delivered in a different, non-latest thread and does not deliver a second copy", async () => {
    const { deliverDailyAssistantDigest } = await import(
      "@/features/operations/server/deliverDailyAssistantDigest"
    );
    // Simulates a recipient switching to a new conversation between two
    // hourly runs inside the same morning window: "thread-new" is now the
    // latest active thread, but the digest already landed in "thread-old"
    // on an earlier run this same shop-local day.
    const { admin, insertedMessages, createdThreads } = createSupabaseStub({
      timezone: "UTC",
      profiles: [{ id: "p1", user_id: "u1", role: "owner" }],
      allThreadsByUser: { u1: ["thread-old", "thread-new"] },
      latestThreadByUser: { u1: "thread-new" },
      deliveredThreadIds: new Set(["thread-old"]),
    });

    const result = await deliverDailyAssistantDigest({
      admin: admin as never,
      shopId: "shop-1",
      now: new Date("2026-09-15T07:00:00.000Z"),
    });

    expect(result.delivered).toBe(0);
    expect(result.alreadyDelivered).toBe(1);
    expect(insertedMessages).toHaveLength(0);
    expect(createdThreads).toHaveLength(0);
  });

  it("falls back to the (thread_id, client_message_id) unique-index conflict as a backstop for a genuinely concurrent first delivery", async () => {
    const { deliverDailyAssistantDigest } = await import(
      "@/features/operations/server/deliverDailyAssistantDigest"
    );
    getRoleDailySummaryMock.mockResolvedValue(summaryFor("owner"));
    // No thread yet exists in this snapshot (a concurrent run's own insert
    // hasn't been observed by our pre-check), but the actual insert still
    // races into a unique-index conflict.
    const { admin } = createSupabaseStub({
      timezone: "UTC",
      profiles: [{ id: "p1", user_id: "u1", role: "owner" }],
      latestThreadByUser: { u1: "thread-racy" },
      conflictThreadIds: new Set(["thread-racy"]),
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
