import { beforeEach, describe, expect, it, vi } from "vitest";
import * as types from "@/features/ai/server/types";
import * as actionEvents from "@/features/ai/server/actionEvents";
import { BULK_RECOMMENDATION_CONFIRMATION_TOKENS, bulkUpdateAiRecommendationsForReview } from "./bulkUpdateAiRecommendationsForReview";

const ACTOR = { shopId: "shop_1", actorId: "actor_1", source: "manual" as const };

type Row = {
  id: string;
  shop_id: string;
  domain: "work_orders" | "shop_boost";
  status: "open" | "acknowledged" | "dismissed" | "resolved" | "expired" | "superseded";
  recommendation_type: string;
  subject_type: string;
  subject_id: string | null;
  risk_tier: "low" | "medium" | "high" | "critical";
  expires_at: string | null;
  created_at: string;
  dismissed_by?: string | null;
  resolved_by?: string | null;
};

const db = {
  rows: [] as Row[],
};

function seedRows() {
  db.rows = [
    {
      id: "rec_open_1",
      shop_id: "shop_1",
      domain: "work_orders",
      status: "open",
      recommendation_type: "closeout_risk",
      subject_type: "work_order",
      subject_id: "WO-1",
      risk_tier: "high",
      expires_at: null,
      created_at: "2026-04-20T00:00:00.000Z",
    },
    {
      id: "rec_ack_1",
      shop_id: "shop_1",
      domain: "work_orders",
      status: "acknowledged",
      recommendation_type: "parts_delay",
      subject_type: "work_order",
      subject_id: "WO-2",
      risk_tier: "critical",
      expires_at: "2026-04-21T00:00:00.000Z",
      created_at: "2026-04-19T00:00:00.000Z",
    },
    {
      id: "rec_resolved",
      shop_id: "shop_1",
      domain: "work_orders",
      status: "resolved",
      recommendation_type: "closeout_risk",
      subject_type: "work_order",
      subject_id: "WO-3",
      risk_tier: "high",
      expires_at: null,
      created_at: "2026-04-18T00:00:00.000Z",
    },
    {
      id: "rec_other_shop",
      shop_id: "shop_2",
      domain: "work_orders",
      status: "open",
      recommendation_type: "closeout_risk",
      subject_type: "work_order",
      subject_id: "WO-9",
      risk_tier: "critical",
      expires_at: null,
      created_at: "2026-04-22T00:00:00.000Z",
    },
  ];
}

function mockFromTable() {
  vi.spyOn(types, "fromTable").mockImplementation((_, table: string) => {
    if (table !== "ai_recommendations") throw new Error(`Unexpected table ${table}`);

    return {
      select() {
        const filters: Record<string, unknown> = {};
        let limitValue = 100;
        let staleOnly = false;
        let staleBefore = "";

        const query = {
          eq(field: string, value: unknown) {
            filters[field] = value;
            return query;
          },
          order() {
            return query;
          },
          limit(value: number) {
            limitValue = value;
            return query;
          },
          lte(field: string, value: string) {
            filters[`lte:${field}`] = value;
            return query;
          },
          not(field: string, op: string, value: unknown) {
            if (field === "expires_at" && op === "is" && value === null) staleOnly = true;
            return query;
          },
          then(resolve: (value: { data: unknown[]; error: null }) => void) {
            const rows = db.rows
              .filter((row) => (filters.shop_id ? row.shop_id === filters.shop_id : true))
              .filter((row) => (filters.domain ? row.domain === filters.domain : true))
              .filter((row) => (filters.status ? row.status === filters.status : true))
              .filter((row) => (filters.risk_tier ? row.risk_tier === filters.risk_tier : true))
              .filter((row) => (filters.recommendation_type ? row.recommendation_type === filters.recommendation_type : true))
              .filter((row) => (filters.subject_type ? row.subject_type === filters.subject_type : true))
              .filter((row) => (filters.subject_id ? row.subject_id === filters.subject_id : true))
              .filter((row) => {
                const createdCutoff = filters["lte:created_at"] as string | undefined;
                return createdCutoff ? row.created_at <= createdCutoff : true;
              })
              .filter((row) => {
                staleBefore = (filters["lte:expires_at"] as string | undefined) ?? "";
                if (!staleOnly) return true;
                return row.expires_at != null && row.expires_at <= staleBefore;
              })
              .slice(0, limitValue);

            resolve({ data: rows, error: null });
          },
        };

        return query;
      },
      update(payload: Record<string, unknown>) {
        const eqFilters: Record<string, unknown> = {};
        let statuses: string[] = [];

        const query = {
          eq(field: string, value: unknown) {
            eqFilters[field] = value;
            return query;
          },
          in(field: string, value: string[]) {
            if (field === "status") statuses = value;
            return query;
          },
          select() {
            return query;
          },
          maybeSingle: async () => {
            const row = db.rows.find((candidate) => (
              candidate.id === eqFilters.id
              && candidate.shop_id === eqFilters.shop_id
              && statuses.includes(candidate.status)
            ));

            if (!row) return { data: null, error: null };

            row.status = String(payload.status) as Row["status"];
            return { data: { id: row.id }, error: null };
          },
        };

        return query;
      },
    } as never;
  });
}

describe("bulkUpdateAiRecommendationsForReview", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    seedRows();
    mockFromTable();
    vi.spyOn(actionEvents, "logAiActionEvent").mockResolvedValue({} as never);
  });

  it("rejects missing or incorrect confirmation", async () => {
    await expect(() => bulkUpdateAiRecommendationsForReview({
      supabase: {} as never,
      actorContext: ACTOR,
      action: "dismiss",
      domain: "work_orders",
      confirm: "DISMISS_WRONG",
    })).rejects.toThrow("Invalid confirmation token");
  });

  it("rejects unsupported action", async () => {
    await expect(() => bulkUpdateAiRecommendationsForReview({
      supabase: {} as never,
      actorContext: ACTOR,
      action: "archive" as never,
      domain: "work_orders",
      confirm: BULK_RECOMMENDATION_CONFIRMATION_TOKENS.dismiss.work_orders,
    })).rejects.toThrow();
  });

  it("enforces shop scope and updates only eligible rows", async () => {
    const result = await bulkUpdateAiRecommendationsForReview({
      supabase: {} as never,
      actorContext: ACTOR,
      action: "dismiss",
      domain: "work_orders",
      confirm: BULK_RECOMMENDATION_CONFIRMATION_TOKENS.dismiss.work_orders,
      limit: 100,
    });

    expect(result.executionBlocked).toBe(true);
    expect(result.updatedCount).toBe(2);
    expect(result.skippedCount).toBe(1);
    expect(db.rows.find((row) => row.id === "rec_open_1")?.status).toBe("dismissed");
    expect(db.rows.find((row) => row.id === "rec_ack_1")?.status).toBe("dismissed");
    expect(db.rows.find((row) => row.id === "rec_resolved")?.status).toBe("resolved");
    expect(db.rows.find((row) => row.id === "rec_other_shop")?.status).toBe("open");
  });

  it("respects bounded limit and stale-only filtering", async () => {
    const result = await bulkUpdateAiRecommendationsForReview({
      supabase: {} as never,
      actorContext: ACTOR,
      action: "resolve",
      domain: "work_orders",
      confirm: BULK_RECOMMENDATION_CONFIRMATION_TOKENS.resolve.work_orders,
      limit: 1,
      filters: { staleOnly: true },
    });

    expect(result.matchedCount).toBe(1);
    expect(result.updatedCount).toBe(1);
    expect(db.rows.find((row) => row.id === "rec_ack_1")?.status).toBe("resolved");
  });

  it("does not expose unsafe payload fields in summary", async () => {
    const result = await bulkUpdateAiRecommendationsForReview({
      supabase: {} as never,
      actorContext: ACTOR,
      action: "dismiss",
      domain: "work_orders",
      confirm: BULK_RECOMMENDATION_CONFIRMATION_TOKENS.dismiss.work_orders,
      filters: { status: "open" },
    }) as unknown as Record<string, unknown>;

    expect(result.sampleUpdatedIds).toBeTypeOf("object");
    expect(result.snapshot).toBeUndefined();
    expect(result.metadata).toBeUndefined();
    expect(result.recommended_action).toBeUndefined();
    expect(result.owner_pin_verification_ref).toBeUndefined();
  });

  it("logs canonical lifecycle events for each changed recommendation", async () => {
    await bulkUpdateAiRecommendationsForReview({
      supabase: {} as never,
      actorContext: ACTOR,
      action: "dismiss",
      domain: "work_orders",
      confirm: BULK_RECOMMENDATION_CONFIRMATION_TOKENS.dismiss.work_orders,
      filters: { status: "open" },
    });

    expect(actionEvents.logAiActionEvent).toHaveBeenCalledTimes(1);
    expect(actionEvents.logAiActionEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ shopId: "shop_1" }),
      expect.objectContaining({
        recommendationId: "rec_open_1",
        eventType: "recommendation.dismissed",
      }),
    );
  });

  it("enforces bounded limit validation", async () => {
    await expect(() => bulkUpdateAiRecommendationsForReview({
      supabase: {} as never,
      actorContext: ACTOR,
      action: "dismiss",
      domain: "work_orders",
      confirm: BULK_RECOMMENDATION_CONFIRMATION_TOKENS.dismiss.work_orders,
      limit: 101,
    })).rejects.toThrow("limit must be an integer between 1 and 100");
  });
});
