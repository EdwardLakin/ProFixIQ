import { describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

function buildMessage(index: number, createdAt: string): Row {
  return {
    id: `msg-${String(index).padStart(3, "0")}`,
    thread_id: "thread-1",
    shop_id: "shop-1",
    user_id: null,
    role: "assistant",
    kind: "text",
    content: `message ${index}`,
    payload: {},
    client_message_id: null,
    created_at: createdAt,
  };
}

/**
 * A faithful-enough double: eq/order/limit actually filter/sort/cap, like
 * real PostgREST — this is what makes the "select the newest N, not the
 * oldest N" behavior actually observable in a test.
 */
type MessagesQueryNode = {
  select: (columns: string) => MessagesQueryNode;
  eq: (column: string, value: unknown) => MessagesQueryNode;
  order: (column: string, opts?: { ascending?: boolean }) => MessagesQueryNode;
  limit: (count: number) => MessagesQueryNode;
  then: (
    resolve: (value: { data: Row[]; error: null }) => unknown,
    reject?: (reason: unknown) => unknown,
  ) => Promise<unknown>;
};

function createMessagesQuery(allRows: Row[]): MessagesQueryNode {
  let rows = [...allRows];
  const sorts: Array<{ column: string; ascending: boolean }> = [];
  let limit = Infinity;

  const node: MessagesQueryNode = {
    select: vi.fn(() => node),
    eq: vi.fn((column: string, value: unknown) => {
      rows = rows.filter((row) => row[column] === value);
      return node;
    }),
    order: vi.fn((column: string, opts?: { ascending?: boolean }) => {
      sorts.push({ column, ascending: opts?.ascending ?? true });
      return node;
    }),
    limit: vi.fn((count: number) => {
      limit = count;
      return node;
    }),
    then: (
      resolve: (value: { data: Row[]; error: null }) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => {
      const sorted = [...rows].sort((a, b) => {
        for (const sort of sorts) {
          const left = String(a[sort.column]);
          const right = String(b[sort.column]);
          if (left === right) continue;
          const cmp = left < right ? -1 : 1;
          return sort.ascending ? cmp : -cmp;
        }
        return 0;
      });
      return Promise.resolve({ data: sorted.slice(0, limit), error: null }).then(
        resolve,
        reject,
      );
    },
  };
  return node;
}

function createActor(allRows: Row[], threadRow: Row) {
  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "shop_assistant_threads") {
        type ThreadQueryNode = {
          select: (columns: string) => ThreadQueryNode;
          eq: (column: string, value: unknown) => ThreadQueryNode;
          maybeSingle: () => Promise<{ data: Row; error: null }>;
        };
        const node: ThreadQueryNode = {
          select: vi.fn(() => node),
          eq: vi.fn(() => node),
          maybeSingle: vi.fn(() => Promise.resolve({ data: threadRow, error: null })),
        };
        return node;
      }
      if (table === "shop_assistant_messages") {
        return createMessagesQuery(allRows);
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  };

  return {
    userId: "user-1",
    profileId: "profile-1",
    shopId: "shop-1",
    role: "owner",
    canonicalRole: "owner",
    capabilities: {},
    supabase,
  } as unknown as Parameters<
    typeof import("@/features/shop-assistant/server/threadStore").loadShopAssistantMessages
  >[0];
}

const THREAD_ROW = {
  id: "thread-1",
  shop_id: "shop-1",
  user_id: "user-1",
  title: "Shop Assistant",
  context: {},
  last_message_at: "2026-09-15T09:00:00.000Z",
  archived_at: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-09-15T09:00:00.000Z",
};

describe("loadShopAssistantMessages pagination", () => {
  it("returns every message in ascending order when the thread is under the limit", async () => {
    const { loadShopAssistantMessages } = await import(
      "@/features/shop-assistant/server/threadStore"
    );
    const rows = [1, 2, 3].map((n) =>
      buildMessage(n, `2026-09-15T0${n}:00:00.000Z`),
    );
    const actor = createActor(rows, THREAD_ROW);

    const messages = await loadShopAssistantMessages(actor, "thread-1", 80);

    expect(messages.map((m) => m.id)).toEqual(["msg-001", "msg-002", "msg-003"]);
  });

  it("selects the newest `limit` messages, not the oldest, once the thread exceeds it — still returned in ascending order", async () => {
    const { loadShopAssistantMessages } = await import(
      "@/features/shop-assistant/server/threadStore"
    );
    // 5 messages, limit 3: the oldest-first-with-a-flat-limit bug would
    // return msg-001..003 and permanently hide msg-004/msg-005 (e.g. a
    // digest appended after the thread already had 80+ messages).
    const rows = [1, 2, 3, 4, 5].map((n) =>
      buildMessage(n, `2026-09-1${n}T00:00:00.000Z`),
    );
    const actor = createActor(rows, THREAD_ROW);

    const messages = await loadShopAssistantMessages(actor, "thread-1", 3);

    expect(messages.map((m) => m.id)).toEqual(["msg-003", "msg-004", "msg-005"]);
  });

  it("a message appended after the thread already exceeds the limit is visible on the next load", async () => {
    const { loadShopAssistantMessages } = await import(
      "@/features/shop-assistant/server/threadStore"
    );
    const rows = [1, 2, 3, 4].map((n) =>
      buildMessage(n, `2026-09-1${n}T00:00:00.000Z`),
    );
    rows.push(buildMessage(5, "2026-09-15T00:00:00.000Z"));
    const actor = createActor(rows, THREAD_ROW);

    const messages = await loadShopAssistantMessages(actor, "thread-1", 3);

    expect(messages.at(-1)?.id).toBe("msg-005");
  });
});
