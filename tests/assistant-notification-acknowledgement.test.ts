import { describe, expect, it, vi } from "vitest";

const {
  getAssistantNotificationWriterMock,
  getServerSupabaseMock,
  getOpsNotificationsMock,
  markAssistantNotificationTrustedWriterRolloutMock,
} = vi.hoisted(() => ({
  getAssistantNotificationWriterMock: vi.fn(),
  getServerSupabaseMock: vi.fn(),
  getOpsNotificationsMock: vi.fn(),
  markAssistantNotificationTrustedWriterRolloutMock: vi
    .fn()
    .mockResolvedValue(undefined),
}));

vi.mock("@/features/agent/server/supabase", () => ({
  getAssistantNotificationWriter: getAssistantNotificationWriterMock,
  getServerSupabase: getServerSupabaseMock,
  markAssistantNotificationTrustedWriterRollout:
    markAssistantNotificationTrustedWriterRolloutMock,
}));

vi.mock("@/features/agent/server/getOpsNotifications", () => ({
  getOpsNotifications: getOpsNotificationsMock,
}));

import { syncAssistantNotifications } from "@/features/agent/server/syncAssistantNotifications";

function queryResult(data: unknown[]) {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;

  builder.select = vi.fn(chain);
  builder.eq = vi.fn(chain);
  builder.in = vi.fn(chain);
  builder.not = vi.fn(chain);
  builder.is = vi.fn(chain);
  builder.ilike = vi.fn(chain);
  builder.order = vi.fn(chain);
  builder.range = vi.fn(chain);
  builder.then = (
    resolve: (value: { data: unknown[]; error: null }) => unknown,
    reject?: (reason: unknown) => unknown,
  ) => Promise.resolve({ data, error: null }).then(resolve, reject);

  return builder;
}

describe("assistant notification acknowledgement persistence", () => {
  it("preserves acknowledgement audit fields when an acknowledged notification is recomputed", async () => {
    const acknowledgedAt = "2026-08-12T22:00:00.000Z";
    const acknowledgedBy = "11111111-1111-4111-8111-111111111111";
    const upsertMock = vi.fn().mockResolvedValue({ error: null });
    let assistantNotificationsAccessCount = 0;

    getOpsNotificationsMock.mockResolvedValue([
      {
        code: "parts_waiting_too_long",
        level: "warning",
        title: "Parts waiting too long",
        message: "One parts request needs attention.",
      },
    ]);

    getAssistantNotificationWriterMock.mockReturnValue({
      from: vi.fn((table: string) => {
        expect(table).toBe("assistant_notifications");
        return { upsert: upsertMock };
      }),
    });

    getServerSupabaseMock.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "part_requests") return queryResult([]);

        expect(table).toBe("assistant_notifications");
        assistantNotificationsAccessCount += 1;

        if (assistantNotificationsAccessCount === 1) {
          return queryResult([
            {
              id: "notification-1",
              fingerprint: "shop::parts_waiting_too_long::na::na::na",
              first_seen_at: "2026-08-12T20:00:00.000Z",
              status: "acknowledged",
              acknowledged_at: acknowledgedAt,
              acknowledged_by: acknowledgedBy,
            },
          ]);
        }

        if (assistantNotificationsAccessCount === 2) {
          return queryResult([]);
        }

        throw new Error(
          `Unexpected assistant_notifications access #${assistantNotificationsAccessCount}`,
        );
      }),
    });

    await syncAssistantNotifications({
      shopId: "shop-1",
      role: "owner",
    });

    expect(upsertMock).toHaveBeenCalledTimes(1);
    const upsertRows = upsertMock.mock.calls[0]?.[0] as Array<
      Record<string, unknown>
    >;
    expect(upsertRows).toHaveLength(1);
    expect(upsertRows[0]).toMatchObject({
      fingerprint: "shop::parts_waiting_too_long::na::na::na",
      status: "acknowledged",
      acknowledged_at: acknowledgedAt,
      acknowledged_by: acknowledgedBy,
    });
  });

  it("persists an AI-prepared parts request as a real, acknowledgeable assistant_notifications row rather than a synthetic id", async () => {
    const upsertMock = vi.fn().mockResolvedValue({ error: null });
    let assistantNotificationsAccessCount = 0;

    getOpsNotificationsMock.mockResolvedValue([]);

    getAssistantNotificationWriterMock.mockReturnValue({
      from: vi.fn((table: string) => {
        expect(table).toBe("assistant_notifications");
        return { upsert: upsertMock };
      }),
    });

    const fingerprint =
      "shop::ai_parts_request_prepared::part_request::pr-1::/parts/requests/pr-1";

    getServerSupabaseMock.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "part_requests") {
          return queryResult([
            {
              id: "pr-1",
              shop_id: "shop-1",
              work_order_id: "wo-1",
              job_id: "line-1",
              notes:
                '[ai:appointment_parts_preparation] Automatically prepared from active menu repair "Front brake service" (Phase 5 GREEN command).',
              created_at: "2026-09-01T00:00:00.000Z",
              requested_by: null,
              // No pick_requested_at: the manual parts-pick durable signal
              // (getDurablePartsPickNotifications) also scans part_requests
              // and must not mistake this AI-prepared row for one of its own.
              pick_requested_at: null,
            },
          ]);
        }
        if (table === "part_request_items") return queryResult([]);

        expect(table).toBe("assistant_notifications");
        assistantNotificationsAccessCount += 1;

        if (assistantNotificationsAccessCount === 1) return queryResult([]);

        if (assistantNotificationsAccessCount === 2) {
          return queryResult([
            {
              id: "22222222-2222-4222-8222-222222222222",
              shop_id: "shop-1",
              user_id: null,
              role: "owner",
              source: "ops",
              fingerprint,
              code: "ai_parts_request_prepared",
              level: "info",
              title: "AI prepared a parts request",
              message: "An internal parts request was automatically prepared.",
              href: "/parts/requests/pr-1",
              entity_type: "part_request",
              entity_id: "pr-1",
              status: "active",
              metadata: {},
              first_seen_at: "2026-09-01T00:00:00.000Z",
              last_seen_at: "2026-09-01T00:00:00.000Z",
              acknowledged_at: null,
              acknowledged_by: null,
              resolved_at: null,
              created_at: "2026-09-01T00:00:00.000Z",
              updated_at: "2026-09-01T00:00:00.000Z",
            },
          ]);
        }

        throw new Error(
          `Unexpected assistant_notifications access #${assistantNotificationsAccessCount}`,
        );
      }),
    });

    const result = await syncAssistantNotifications({
      shopId: "shop-1",
      role: "owner",
    });

    const upsertRows = upsertMock.mock.calls[0]?.[0] as Array<
      Record<string, unknown>
    >;
    expect(upsertRows).toHaveLength(1);
    expect(upsertRows[0]).toMatchObject({
      fingerprint,
      code: "ai_parts_request_prepared",
    });

    // The row the caller (and the acknowledge route, which updates by
    // assistant_notifications id) actually sees must carry the real,
    // upserted database id — never the ai-parts-request:<uuid> synthetic
    // id a purely in-memory-merged durable notification would have.
    const persisted = result.find((row) => row.fingerprint === fingerprint);
    expect(persisted?.id).toBe("22222222-2222-4222-8222-222222222222");
    expect(persisted?.id).not.toMatch(/^ai-parts-request:/);
  });
});
