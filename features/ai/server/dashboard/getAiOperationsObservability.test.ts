import { beforeEach, describe, expect, it, vi } from "vitest";
import * as types from "@/features/ai/server/types";
import { getAiOperationsObservability } from "./getAiOperationsObservability";

const ACTOR = { shopId: "shop_1", actorId: "actor_1", source: "manual" as const };
const NOW = new Date("2026-04-24T12:00:00.000Z");

type RecommendationRow = {
  id: string;
  shop_id: string;
  domain: "work_orders" | "shop_boost";
  status: "open" | "acknowledged" | "dismissed" | "resolved" | "expired" | "superseded";
  risk_tier: "low" | "medium" | "high" | "critical";
  missing_data: unknown[];
  created_at: string;
  expires_at: string | null;
  preview_payload?: unknown;
};

type PreviewRow = {
  id: string;
  shop_id: string;
  domain: "work_orders" | "shop_boost";
  action_type: string;
  status: "draft" | "ready" | "approval_required" | "approved" | "rejected" | "expired" | "executed" | "cancelled" | "failed";
  created_at: string;
  expires_at: string | null;
  intended_mutations?: Record<string, unknown>;
};

type ApprovalRow = {
  id: string;
  shop_id: string;
  status: "pending" | "approved" | "rejected" | "expired" | "cancelled";
  owner_pin_required: boolean;
  requested_at: string;
  expires_at: string | null;
  owner_pin_verification_ref?: string;
};

type EventRow = {
  id: string;
  shop_id: string;
  event_type: string;
  created_at: string;
  payload?: Record<string, unknown>;
};

const db = {
  recommendations: [] as RecommendationRow[],
  previews: [] as PreviewRow[],
  approvals: [] as ApprovalRow[],
  events: [] as EventRow[],
};

function seed() {
  db.recommendations = [
    { id: "rec_1", shop_id: "shop_1", domain: "work_orders", status: "open", risk_tier: "high", missing_data: ["labor_state"], created_at: "2026-04-24T10:00:00.000Z", expires_at: "2026-04-24T11:00:00.000Z", preview_payload: { unsafe: true } },
    { id: "rec_2", shop_id: "shop_1", domain: "shop_boost", status: "acknowledged", risk_tier: "critical", missing_data: [], created_at: "2026-04-24T02:00:00.000Z", expires_at: "2026-04-25T00:00:00.000Z" },
    { id: "rec_3", shop_id: "shop_1", domain: "work_orders", status: "resolved", risk_tier: "medium", missing_data: [], created_at: "2026-04-20T02:00:00.000Z", expires_at: null },
    { id: "rec_other", shop_id: "shop_2", domain: "work_orders", status: "open", risk_tier: "critical", missing_data: [], created_at: "2026-04-24T10:00:00.000Z", expires_at: null },
  ];

  db.previews = [
    { id: "pre_1", shop_id: "shop_1", domain: "work_orders", action_type: "dispatch_review", status: "ready", created_at: "2026-04-24T10:00:00.000Z", expires_at: null, intended_mutations: { hidden: true } },
    { id: "pre_2", shop_id: "shop_1", domain: "shop_boost", action_type: "review_shop_boost_readiness", status: "approval_required", created_at: "2026-04-24T01:00:00.000Z", expires_at: null },
    { id: "pre_3", shop_id: "shop_1", domain: "work_orders", action_type: "dispatch_review", status: "expired", created_at: "2026-04-23T12:00:00.000Z", expires_at: "2026-04-23T20:00:00.000Z" },
  ];

  db.approvals = [
    { id: "ap_1", shop_id: "shop_1", status: "pending", owner_pin_required: true, requested_at: "2026-04-24T11:30:00.000Z", expires_at: null, owner_pin_verification_ref: "secret_ref" },
    { id: "ap_2", shop_id: "shop_1", status: "approved", owner_pin_required: false, requested_at: "2026-04-22T01:00:00.000Z", expires_at: null },
    { id: "ap_3", shop_id: "shop_1", status: "rejected", owner_pin_required: false, requested_at: "2026-04-22T03:00:00.000Z", expires_at: null },
  ];

  db.events = [
    { id: "ev_1", shop_id: "shop_1", event_type: "recommendation.expired", created_at: "2026-04-24T11:45:00.000Z" },
    { id: "ev_2", shop_id: "shop_1", event_type: "action_preview.expired", created_at: "2026-04-24T11:40:00.000Z" },
    { id: "ev_3", shop_id: "shop_1", event_type: "action_approval.expired", created_at: "2026-04-24T11:35:00.000Z" },
    { id: "ev_4", shop_id: "shop_1", event_type: "action_execution.failed", created_at: "2026-04-24T11:20:00.000Z", payload: { token: "secret" } },
    { id: "ev_5", shop_id: "shop_1", event_type: "action_preview.blocked_execution", created_at: "2026-04-24T11:10:00.000Z" },
    { id: "ev_6", shop_id: "shop_2", event_type: "recommendation.expired", created_at: "2026-04-24T11:00:00.000Z" },
    { id: "ev_old", shop_id: "shop_1", event_type: "recommendation.expired", created_at: "2026-04-15T01:00:00.000Z" },
  ];
}

function mockFromTable() {
  vi.spyOn(types, "fromTable").mockImplementation((_, table: string) => {
    const data = table === "ai_recommendations"
      ? db.recommendations
      : table === "ai_action_previews"
        ? db.previews
        : table === "ai_action_approvals"
          ? db.approvals
          : table === "ai_action_events"
            ? db.events
            : [];

    return {
      select() {
        const filters: Record<string, unknown> = {};
        let limitValue = Number.MAX_SAFE_INTEGER;
        let orderDesc = false;

        const query = {
          eq(field: string, value: unknown) {
            filters[field] = value;
            return query;
          },
          gte(field: string, value: string) {
            filters[`gte:${field}`] = value;
            return query;
          },
          order(_field: string, options?: { ascending?: boolean }) {
            orderDesc = options?.ascending === false;
            return query;
          },
          limit(value: number) {
            limitValue = value;
            return query;
          },
          then(resolve: (value: { data: unknown[]; error: null }) => void) {
            let rows = [...data]
              .filter((row: any) => (filters.shop_id ? row.shop_id === filters.shop_id : true))
              .filter((row: any) => {
                const gte = filters["gte:created_at"] as string | undefined;
                return gte ? row.created_at >= gte : true;
              });

            if (orderDesc) rows = rows.sort((a: any, b: any) => b.created_at.localeCompare(a.created_at));
            rows = rows.slice(0, limitValue);

            resolve({ data: rows, error: null });
          },
        };

        return query;
      },
    } as never;
  });
}

describe("getAiOperationsObservability", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    seed();
    mockFromTable();
  });

  it("enforces shop scoping", async () => {
    const result = await getAiOperationsObservability({ supabase: {} as never, actorContext: ACTOR, now: NOW });
    expect(result.recommendations.byDomain.work_orders).toBe(2);
    expect(result.recommendations.totalActive).toBe(2);
    expect(result.expiration.recommendationsExpiredLast7d).toBe(1);
  });

  it("returns safe DTO shape without raw payload fields", async () => {
    const result = await getAiOperationsObservability({ supabase: {} as never, actorContext: ACTOR, now: NOW }) as Record<string, unknown>;
    expect(result).toHaveProperty("recommendations");
    expect(result).not.toHaveProperty("preview_payload");
    expect(result).not.toHaveProperty("intended_mutations");
    expect(result).not.toHaveProperty("owner_pin_verification_ref");
    expect(result).not.toHaveProperty("payload");
  });

  it("computes stale and pending approval backlog flags", async () => {
    const result = await getAiOperationsObservability({ supabase: {} as never, actorContext: ACTOR, now: NOW });
    expect(result.health.hasStaleBacklog).toBe(true);
    expect(result.health.hasPendingApprovalBacklog).toBe(true);
    expect(result.health.hasHighRiskBacklog).toBe(true);
  });

  it("infers cron health from expiration events", async () => {
    const running = await getAiOperationsObservability({ supabase: {} as never, actorContext: ACTOR, now: NOW });
    expect(running.health.cronProbablyRunning).toBe(true);

    db.events = db.events.filter((row) => !row.event_type.endsWith(".expired"));
    const stalled = await getAiOperationsObservability({ supabase: {} as never, actorContext: ACTOR, now: NOW });
    expect(stalled.health.cronProbablyRunning).toBe(false);
  });

  it("reports expiration windows and domain breakdown", async () => {
    const result = await getAiOperationsObservability({ supabase: {} as never, actorContext: ACTOR, now: NOW });
    expect(result.expiration.recommendationsExpiredLast24h).toBe(1);
    expect(result.expiration.previewsExpiredLast24h).toBe(1);
    expect(result.expiration.approvalsExpiredLast24h).toBe(1);
    expect(result.actionPreviews.byDomain.work_orders).toBe(2);
    expect(result.actionPreviews.byDomain.shop_boost).toBe(1);
  });
});
