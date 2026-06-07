import { beforeEach, describe, expect, it, vi } from "vitest";
import * as types from "@/features/ai/server/types";
import { listAiRecommendationsForReview } from "./listAiRecommendationsForReview";
import { expectNoBannedDtoKeys, sortedKeys } from "../../../../tests/ai-dto-test-helpers";

const ACTOR = { shopId: "shop_1", actorId: "actor_1", source: "manual" as const };

function mockFromTable() {
  return vi.spyOn(types, "fromTable").mockImplementation((_, table: string) => {
    if (table === "ai_recommendations") {
      const rows = [
        {
          id: "rec_urgent",
          domain: "work_orders",
          recommendation_type: "closeout_risk",
          subject_type: "work_order",
          subject_id: "WO-1",
          title: "Urgent closeout risk",
          summary: "Needs advisor review",
          status: "open",
          priority: "urgent",
          risk_tier: "critical",
          confidence: 0.88,
          missing_data: [{ field: "owner" }],
          created_at: "2026-04-24T11:00:00.000Z",
          updated_at: "2026-04-24T12:00:00.000Z",
          expires_at: null,
          source: "manual",
          recommended_action: { type: "advisor_review_needed", payload: { unsafe: true } },
          requires_approval: true,
        },
        {
          id: "rec_shop_boost",
          domain: "shop_boost",
          recommendation_type: "activation_followup",
          subject_type: "shop_boost_activation",
          subject_id: null,
          title: "Shop Boost intake follow-up",
          summary: "Review setup blockers",
          status: "acknowledged",
          priority: "high",
          risk_tier: "high",
          confidence: 0.7,
          missing_data: [],
          created_at: "2026-04-24T10:00:00.000Z",
          updated_at: "2026-04-24T10:30:00.000Z",
          expires_at: null,
          source: "ops",
          recommended_action: { type: "review_shop_boost" },
          requires_approval: false,
        },
      ];

      let filtered = [...rows];
      const query = {
        eq(field: string, value: unknown) {
          if (field === "status") filtered = filtered.filter((row) => row.status === value);
          if (field === "domain") filtered = filtered.filter((row) => row.domain === value);
          return query;
        },
        limit(_value: number) {
          return query;
        },
        or(_value: string) {
          return query;
        },
        gte(_field: string, _value: string) {
          return query;
        },
        lte(_field: string, _value: string) {
          return query;
        },
        then(resolve: (value: { data: unknown[]; error: null }) => void) {
          resolve({ data: filtered, error: null });
        },
      };

      return {
        select: () => query,
      } as never;
    }

    if (table === "ai_action_previews") {
      return {
        select: () => ({
          eq: () => ({
            in: async () => ({
              data: [
                { id: "pv_1", recommendation_id: "rec_urgent", status: "ready", requires_approval: true },
              ],
              error: null,
            }),
          }),
        }),
      } as never;
    }

    if (table === "ai_action_approvals") {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              in: async () => ({
                data: [{ action_preview_id: "pv_1", status: "pending" }],
                error: null,
              }),
            }),
          }),
        }),
      } as never;
    }

    throw new Error(`Unexpected table ${table}`);
  });
}

describe("listAiRecommendationsForReview", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns safe display rows without raw action payloads", async () => {
    mockFromTable();

    const result = await listAiRecommendationsForReview({
      supabase: {} as never,
      actorContext: ACTOR,
      pagination: { limit: 10 },
    });

    const urgent = result.items[0];
    expect(urgent.id).toBe("rec_urgent");
    expect(urgent.recommendedActionType).toBe("advisor_review_needed");
    expect((urgent as unknown as Record<string, unknown>).recommended_action).toBeUndefined();
    expect((urgent as unknown as Record<string, unknown>).snapshot).toBeUndefined();
    expect(sortedKeys(urgent as unknown as Record<string, unknown>)).toEqual([
      "confidence",
      "createdAt",
      "domain",
      "expiresAt",
      "hasPreview",
      "id",
      "missingDataCount",
      "pendingApprovalCount",
      "previewStatus",
      "priority",
      "recommendationType",
      "recommendedActionType",
      "requiresApproval",
      "riskTier",
      "source",
      "status",
      "subjectId",
      "subjectType",
      "summary",
      "targetHref",
      "targetLabel",
      "title",
      "updatedAt",
    ]);
    expectNoBannedDtoKeys(urgent);
    expectNoBannedDtoKeys(result);
  });

  it("filters by domain and requires approval", async () => {
    mockFromTable();

    const result = await listAiRecommendationsForReview({
      supabase: {} as never,
      actorContext: ACTOR,
      filters: { domain: "work_orders", requiresApproval: true },
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.domain).toBe("work_orders");
  });

  it("orders open urgent recommendations first and maps safe target links", async () => {
    mockFromTable();

    const result = await listAiRecommendationsForReview({
      supabase: {} as never,
      actorContext: ACTOR,
    });

    expect(result.items[0]?.id).toBe("rec_urgent");
    expect(result.items[0]?.targetHref).toBe("/work-orders/WO-1");
    expect(result.items[1]?.targetHref).toBe("/dashboard/setup/review?source=shop-boost");
  });

  it("returns safe summary and pending approvals", async () => {
    mockFromTable();

    const result = await listAiRecommendationsForReview({
      supabase: {} as never,
      actorContext: ACTOR,
      filters: { status: "resolved" },
    });

    expect(result.items).toHaveLength(0);
    expect(result.summary.total).toBe(0);
    expect(result.summary.pendingApprovals).toBe(0);
  });
});
