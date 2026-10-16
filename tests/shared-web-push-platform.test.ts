import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  buildPushPayload,
  classifyPushFailure,
  hashPushEndpoint,
  isSafeNotificationTargetPath,
  nextRetryDelaySeconds,
  parsePushSubscriptionInput,
} from "@/features/notifications/lib/pushContracts";
import { parsePushEventPayload } from "@/features/notifications/lib/pushClientContracts";
import type { NotificationAdmin } from "@/features/notifications/server/db";
import { createNotification } from "@/features/notifications/server/notificationStore";
import { processPushDeliveries, type PushSendOptions } from "@/features/notifications/server/pushDelivery";

type Row = Record<string, unknown>;

/** Minimal in-memory stand-in for the chained Supabase calls the modules use. */
function fakeAdmin(seed: Record<string, Row[]>, claimable: Row[] = []) {
  const db: Record<string, Row[]> = JSON.parse(JSON.stringify(seed));
  const uniq: Record<string, string[]> = {
    app_notifications: ["recipient_user_id", "dedupe_key"],
    app_notification_push_deliveries: ["notification_id", "subscription_id"],
  };
  let nextId = 1;
  const builder = (table: string) => {
    const filters: Array<(r: Row) => boolean> = [];
    let op: "select" | "update" | "upsert" = "select";
    let patch: Row | Row[] = {};
    let ignoreDuplicates = false;
    const rows = () => (db[table] ??= []);
    const run = () => {
      const matched = rows().filter((r) => filters.every((f) => f(r)));
      if (op === "update") {
        matched.forEach((r) => Object.assign(r, patch));
        return matched;
      }
      if (op === "upsert") {
        const out: Row[] = [];
        for (const item of Array.isArray(patch) ? patch : [patch]) {
          const keys = uniq[table];
          const dup = keys && rows().find((r) => keys.every((k) => r[k] === item[k]));
          if (dup) {
            if (!ignoreDuplicates) Object.assign(dup, item);
            continue;
          }
          const row = { id: `id-${nextId++}`, ...item };
          rows().push(row);
          out.push(row);
        }
        return out;
      }
      return matched;
    };
    const api: Record<string, unknown> = {
      select: () => api,
      eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), api),
      is: (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), api),
      update: (p: Row) => ((op = "update"), (patch = p), api),
      upsert: (p: Row | Row[], o?: { ignoreDuplicates?: boolean }) => (
        (op = "upsert"), (patch = p), (ignoreDuplicates = Boolean(o?.ignoreDuplicates)), api
      ),
      maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => unknown) => resolve({ data: run(), error: null }),
    };
    return api;
  };
  return {
    db,
    from: builder,
    rpc: async () => ({ data: claimable, error: null }),
  } as unknown as NotificationAdmin & { db: Record<string, Row[]> };
}

describe("push contracts", () => {
  it("accepts only same-origin relative deep links", () => {
    expect(isSafeNotificationTargetPath("/mobile/work-orders/abc")).toBe(true);
    for (const bad of ["//evil.com", "https://evil.com", "mobile", "/a\\b", "/a\nb", 5]) {
      expect(isSafeNotificationTargetPath(bad)).toBe(false);
    }
  });

  it("requires https endpoints and both keys", () => {
    const ok = { endpoint: "https://push.example/abc", keys: { p256dh: "k", auth: "a" } };
    expect(parsePushSubscriptionInput(ok)?.endpoint).toBe(ok.endpoint);
    expect(parsePushSubscriptionInput({ ...ok, endpoint: "http://push.example/abc" })).toBeNull();
    expect(parsePushSubscriptionInput({ endpoint: ok.endpoint, keys: { p256dh: "k" } })).toBeNull();
    expect(parsePushSubscriptionInput(null)).toBeNull();
  });

  it("keeps lock-screen payloads generic", () => {
    const payload = buildPushPayload({ id: "n1", target_path: "/mobile/work-orders/1", priority: "high" });
    expect(JSON.stringify(payload)).not.toMatch(/customer|machine|excavator|address/i);
    expect(payload).toMatchObject({ path: "/mobile/work-orders/1", urgent: true });
    expect(buildPushPayload({ id: "n1", target_path: "//evil.com" }).path).toBe("/");
  });

  it("sanitises what the service worker will display and open", () => {
    expect(parsePushEventPayload("not json").path).toBe("/");
    expect(parsePushEventPayload(JSON.stringify({ path: "https://evil.com" })).path).toBe("/");
    expect(parsePushEventPayload(JSON.stringify({ path: "/mobile" })).path).toBe("/mobile");
  });

  it("classifies failures and bounds retries", () => {
    expect(classifyPushFailure(410)).toBe("gone");
    expect(classifyPushFailure(404)).toBe("gone");
    expect(classifyPushFailure(null)).toBe("transient");
    expect(classifyPushFailure(503)).toBe("transient");
    expect(classifyPushFailure(400)).toBe("permanent");
    expect(nextRetryDelaySeconds(1)).toBe(60);
    expect(nextRetryDelaySeconds(4)).toBe(7200);
    expect(nextRetryDelaySeconds(5)).toBeNull();
    expect(hashPushEndpoint("a")).toHaveLength(64);
  });
});

const input = {
  shopId: "shop-1",
  recipientUserId: "user-1",
  eventType: "dispatch.assigned",
  dedupeKey: "visit-1:assigned:user-1",
  title: "New assignment",
  targetPath: "/mobile/service/visit-1",
};

describe("createNotification", () => {
  it("dedupes retries and queues one push per active device only", async () => {
    const admin = fakeAdmin({
      profiles: [{ id: "user-1", shop_id: "shop-1" }],
      app_push_subscriptions: [
        { id: "s1", shop_id: "shop-1", user_id: "user-1", revoked_at: null },
        { id: "s2", shop_id: "shop-1", user_id: "user-1", revoked_at: "2026-01-01" },
        { id: "s3", shop_id: "shop-1", user_id: "user-2", revoked_at: null },
      ],
    });
    const first = await createNotification({ admin, ...input });
    const retry = await createNotification({ admin, ...input });
    expect(first).toMatchObject({ ok: true, created: true, pushQueued: 1 });
    expect(retry).toMatchObject({ ok: true, created: false, pushQueued: 1 });
    expect(admin.db.app_notifications).toHaveLength(1);
    expect(admin.db.app_notification_push_deliveries).toHaveLength(1);
  });

  it("refuses recipients outside the shop and unsafe links", async () => {
    const admin = fakeAdmin({ profiles: [{ id: "user-1", shop_id: "other-shop" }] });
    expect(await createNotification({ admin, ...input })).toEqual({
      ok: false,
      reason: "recipient_out_of_scope",
    });
    expect(await createNotification({ admin, ...input, targetPath: "//x.com" })).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(admin.db.app_notifications ?? []).toHaveLength(0);
  });
});

describe("processPushDeliveries", () => {
  const baseSeed = (): Record<"profiles" | "app_notifications" | "app_push_subscriptions" | "app_notification_push_deliveries", Row[]> => ({
    app_notifications: [
      { id: "n1", shop_id: "shop-1", recipient_user_id: "user-1", target_path: "/mobile", priority: "normal", expires_at: null, acknowledged_at: null },
    ],
    profiles: [{ id: "user-1", shop_id: "shop-1" }],
    app_push_subscriptions: [
      { id: "s1", shop_id: "shop-1", user_id: "user-1", endpoint: "https://p/1", p256dh: "k", auth_secret: "a", revoked_at: null, expires_at: null },
    ],
    app_notification_push_deliveries: [
      { id: "d1", notification_id: "n1", subscription_id: "s1", status: "sending", attempts: 1 },
    ],
  });
  const claim = [{ id: "d1", notification_id: "n1", subscription_id: "s1", attempts: 1 }];

  it("marks success and sends only the generic payload", async () => {
    const admin = fakeAdmin(baseSeed(), claim);
    const send = vi.fn(async (_sub: unknown, _payload: string, _opts: PushSendOptions) => ({ ok: true as const }));
    const summary = await processPushDeliveries({ admin, send });
    expect(summary.sent).toBe(1);
    expect(admin.db.app_notification_push_deliveries[0]?.status).toBe("sent");
    expect(send.mock.calls[0]?.[1]).not.toContain("user-1");
  });

  it("retries transient failures with backoff, then gives up", async () => {
    const admin = fakeAdmin(baseSeed(), claim);
    const now = new Date("2026-01-01T00:00:00Z");
    const fail = async () => ({ ok: false as const, statusCode: 503, code: "http_503" });
    const first = await processPushDeliveries({ admin, send: fail, now });
    expect(first.retried).toBe(1);
    const delivery = admin.db.app_notification_push_deliveries[0]!;
    expect(delivery.status).toBe("pending");
    expect(delivery.next_attempt_at).toBe("2026-01-01T00:01:00.000Z");

    const last = fakeAdmin(baseSeed(), [{ ...claim[0]!, attempts: 5 }]);
    const done = await processPushDeliveries({ admin: last, send: fail, now });
    expect(done.failed).toBe(1);
  });

  it("passes priority urgency and a TTL capped by the notification's remaining life", async () => {
    const seed = baseSeed();
    const now = new Date("2026-01-01T00:00:00Z");
    seed.app_notifications[0]!.priority = "high";
    seed.app_notifications[0]!.expires_at = "2026-01-01T00:05:00Z";
    const admin = fakeAdmin(seed, claim);
    const send = vi.fn(async (_s: unknown, _p: string, _o: PushSendOptions) => ({ ok: true as const }));
    await processPushDeliveries({ admin, send, now });
    expect(send.mock.calls[0]?.[2]).toEqual({ urgency: "high", ttlSeconds: 300 });
    const normal = baseSeed();
    const second = vi.fn(async (_s: unknown, _p: string, _o: PushSendOptions) => ({ ok: true as const }));
    await processPushDeliveries({ admin: fakeAdmin(normal, claim), send: second, now });
    expect(second.mock.calls[0]?.[2]).toEqual({ urgency: "normal", ttlSeconds: 3600 });
  });

  it("suppresses and revokes when the recipient has since left the shop", async () => {
    const seed = baseSeed();
    seed.profiles[0]!.shop_id = "shop-2";
    const admin = fakeAdmin(seed, claim);
    const send = vi.fn(async (_s: unknown, _p: string, _o: PushSendOptions) => ({ ok: true as const }));
    const summary = await processPushDeliveries({ admin, send });
    expect(summary.suppressed).toBe(1);
    expect(send).not.toHaveBeenCalled();
    expect(admin.db.app_push_subscriptions[0]?.revoked_reason).toBe("recipient_left_shop");
  });

  it("retries rather than suppresses when a state read fails", async () => {
    const admin = fakeAdmin(baseSeed(), claim);
    const realFrom = admin.from;
    (admin as unknown as { from: (t: string) => unknown }).from = (table: string) => {
      const b = realFrom(table) as unknown as Record<string, unknown>;
      if (table === "app_notifications") {
        b.maybeSingle = async () => ({ data: null, error: { message: "boom" } });
      }
      return b;
    };
    const send = vi.fn(async (_s: unknown, _p: string, _o: PushSendOptions) => ({ ok: true as const }));
    const summary = await processPushDeliveries({ admin, send });
    expect(summary.retried).toBe(1);
    expect(summary.suppressed).toBe(0);
    expect(admin.db.app_notification_push_deliveries[0]?.status).toBe("pending");
  });

  it("releases unprocessed leases when the run budget is spent", async () => {
    const admin = fakeAdmin(baseSeed(), claim);
    const send = vi.fn(async (_s: unknown, _p: string, _o: PushSendOptions) => ({ ok: true as const }));
    const summary = await processPushDeliveries({ admin, send, runBudgetMs: -1 });
    expect(summary.released).toBe(1);
    expect(send).not.toHaveBeenCalled();
  });

  it("reports (not hides) a failed status write after an accepted send", async () => {
    const admin = fakeAdmin(baseSeed(), claim);
    const realFrom = admin.from;
    (admin as unknown as { from: (t: string) => unknown }).from = (table: string) => {
      const b = realFrom(table) as unknown as Record<string, unknown>;
      if (table === "app_notification_push_deliveries") {
        b.update = () => ({ eq: async () => ({ error: { message: "write failed" } }) });
      }
      return b;
    };
    const send = vi.fn(async (_s: unknown, _p: string, _o: PushSendOptions) => ({ ok: true as const }));
    const summary = await processPushDeliveries({ admin, send });
    expect(summary.persistFailures).toBe(1);
    expect(summary.sent).toBe(0);
  });

  it("revokes expired subscriptions", async () => {
    const admin = fakeAdmin(baseSeed(), claim);
    const summary = await processPushDeliveries({
      admin,
      send: async () => ({ ok: false, statusCode: 410, code: "http_410" }),
    });
    expect(summary.expired).toBe(1);
    expect(admin.db.app_push_subscriptions[0]?.revoked_reason).toBe("push_service_gone");
  });

  it.each([
    ["acknowledged", (s: ReturnType<typeof baseSeed>) => { s.app_notifications[0]!.acknowledged_at = "2026-01-01"; }],
    ["revoked device", (s: ReturnType<typeof baseSeed>) => { s.app_push_subscriptions[0]!.revoked_at = "2026-01-01"; }],
    ["device taken over by another user", (s: ReturnType<typeof baseSeed>) => { s.app_push_subscriptions[0]!.user_id = "user-2"; }],
    ["device moved to another shop", (s: ReturnType<typeof baseSeed>) => { s.app_push_subscriptions[0]!.shop_id = "shop-2"; }],
  ])("suppresses delivery when %s", async (_name, mutate) => {
    const seed = baseSeed();
    mutate(seed);
    const admin = fakeAdmin(seed, claim);
    const send = vi.fn(async (_sub: unknown, _payload: string, _opts: PushSendOptions) => ({ ok: true as const }));
    const summary = await processPushDeliveries({ admin, send });
    expect(summary.suppressed).toBe(1);
    expect(send).not.toHaveBeenCalled();
  });
});

describe("route and migration boundaries", () => {
  const read = (p: string) => readFileSync(p, "utf8");

  it("authenticates every user-facing notification route and scopes by caller", () => {
    for (const p of [
      "app/api/notifications/route.ts",
      "app/api/notifications/[id]/ack/route.ts",
      "app/api/notifications/push/config/route.ts",
      "app/api/notifications/push/subscription/route.ts",
    ]) {
      expect(read(p)).toContain("requireShopScopedApiAccess");
    }
    const ack = read("app/api/notifications/[id]/ack/route.ts");
    expect(ack).toContain('.eq("recipient_user_id"');
    expect(ack).toContain('.eq("shop_id"');
    const sub = read("app/api/notifications/push/subscription/route.ts");
    expect(sub).toContain('.eq("user_id", access.profile.id)');
  });

  it("mounts the opt-in on the standalone Equipment and mobile shells", () => {
    expect(read("features/equipment/components/EquipmentAccountControls.tsx")).toContain("PushNotificationSettings");
    expect(read("features/mobile/settings/MobileSettingsScreen.tsx")).toContain("PushNotificationSettings");
  });

  it("protects the delivery worker with the internal secret and schedules it", () => {
    expect(read("app/api/internal/push-deliveries/route.ts")).toContain("requireInternalApiSecret");
    expect(read("vercel.json")).toContain("/api/internal/push-deliveries");
  });

  it("keeps the migration additive and server-only", () => {
    const sql = read("supabase/migrations/20261017120000_shared_web_push_platform.sql");
    expect(sql).not.toMatch(/\bdrop\s+(table|policy|trigger|function)\b/i);
    for (const match of sql.matchAll(/alter\s+table\s+(?:only\s+)?public\.(\w+)/gi)) {
      expect(match[1]).toMatch(/^app_(push_subscriptions|notifications|notification_push_deliveries)$/);
    }
    expect(sql).not.toMatch(/grant\s+(select|insert|update|all)[^;]*to\s+(authenticated|anon)/i);
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("for update skip locked");
  });
});
