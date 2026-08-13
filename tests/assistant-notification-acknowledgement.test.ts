import { describe, expect, it, vi } from "vitest";

const getServerSupabaseMock = vi.fn();
const getOpsNotificationsMock = vi.fn();

vi.mock("@/features/agent/server/supabase", () => ({
  getServerSupabase: getServerSupabaseMock,
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
  builder.order = vi.fn(chain);
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

    getServerSupabaseMock.mockReturnValue({
      from: vi.fn((table: string) => {
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
          return { upsert: upsertMock };
        }

        if (assistantNotificationsAccessCount === 3) {
          return queryResult([]);
        }

        throw new Error(`Unexpected assistant_notifications access #${assistantNotificationsAccessCount}`);
      }),
    });

    await syncAssistantNotifications({
      shopId: "shop-1",
      role: "owner",
    });

    expect(upsertMock).toHaveBeenCalledTimes(1);
    const upsertRows = upsertMock.mock.calls[0]?.[0] as Array<Record<string, unknown>>;
    expect(upsertRows).toHaveLength(1);
    expect(upsertRows[0]).toMatchObject({
      fingerprint: "shop::parts_waiting_too_long::na::na::na",
      status: "acknowledged",
      acknowledged_at: acknowledgedAt,
      acknowledged_by: acknowledgedBy,
    });
  });
});
