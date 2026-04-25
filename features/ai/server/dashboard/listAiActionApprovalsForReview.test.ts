import { beforeEach, describe, expect, it, vi } from "vitest";
import * as types from "@/features/ai/server/types";
import { listAiActionApprovalsForReview } from "./listAiActionApprovalsForReview";

const ACTOR = { shopId: "shop_1", actorId: "actor_1", source: "manual" as const };

function mockFromTable() {
  return vi.spyOn(types, "fromTable").mockImplementation((_, table: string) => {
    if (table === "ai_action_approvals") {
      const rows = [
        {
          id: "approval_pending",
          action_preview_id: "preview_work_order",
          status: "pending",
          owner_pin_required: true,
          owner_pin_verification_ref: null,
          requested_at: "2026-04-24T12:00:00.000Z",
          requested_by: "actor_2",
          decided_at: null,
          decided_by: null,
          metadata: {
            ownerPinProofRef: {
              proofType: "owner_pin_attestation",
              shopId: "shop_1",
              actorId: "actor_2",
            },
          },
        },
        {
          id: "approval_approved",
          action_preview_id: "preview_shop_boost",
          status: "approved",
          owner_pin_required: false,
          owner_pin_verification_ref: null,
          requested_at: "2026-04-24T10:00:00.000Z",
          requested_by: "actor_3",
          decided_at: "2026-04-24T11:00:00.000Z",
          decided_by: "actor_4",
          metadata: {},
        },
        {
          id: "approval_other_shop",
          action_preview_id: "preview_other_shop",
          status: "pending",
          owner_pin_required: false,
          owner_pin_verification_ref: null,
          requested_at: "2026-04-24T09:00:00.000Z",
          requested_by: "actor_5",
          decided_at: null,
          decided_by: null,
          metadata: {},
        },
      ];

      const query = {
        eq(field: string, _value: unknown) {
          if (field === "shop_id") {
            return {
              limit() {
                return {
                  eq(_statusField: string, statusValue: unknown) {
                    const filtered = rows.filter((row) => row.status === statusValue && row.id !== "approval_other_shop");
                    return Promise.resolve({ data: filtered, error: null });
                  },
                  then(resolve: (value: { data: unknown[]; error: null }) => void) {
                    resolve({ data: rows.filter((row) => row.id !== "approval_other_shop"), error: null });
                  },
                };
              },
            };
          }
          return query;
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
                {
                  id: "preview_work_order",
                  recommendation_id: "rec_work_order",
                  action_type: "advisor_review_needed",
                  domain: "work_orders",
                  subject_type: "work_order",
                  subject_id: "WO-42",
                  status: "approval_required",
                  requires_approval: true,
                  risk_tier: "critical",
                  preview_payload: {
                    label: "Unsafe payload title",
                    description: "Unsafe payload description",
                    intended_mutations: [{ should: "not leak" }],
                  },
                },
                {
                  id: "preview_shop_boost",
                  recommendation_id: "rec_shop_boost",
                  action_type: "shop_boost_review",
                  domain: "shop_boost",
                  subject_type: "shop_boost_activation",
                  subject_id: null,
                  status: "approved",
                  requires_approval: true,
                  risk_tier: "low",
                  preview_payload: {
                    label: "Shop boost follow-up",
                    description: "Review only",
                    side_effects: ["do not leak"],
                  },
                },
              ],
              error: null,
            }),
          }),
        }),
      } as never;
    }

    if (table === "ai_recommendations") {
      return {
        select: () => ({
          eq: () => ({
            in: async () => ({
              data: [
                {
                  id: "rec_work_order",
                  title: "Work order line review",
                  summary: "Advisor should review line pricing",
                  status: "open",
                },
                {
                  id: "rec_shop_boost",
                  title: "Shop Boost review",
                  summary: "Confirm setup details",
                  status: "acknowledged",
                },
              ],
              error: null,
            }),
          }),
        }),
      } as never;
    }

    if (table === "profiles") {
      return {
        select: () => ({
          eq: () => ({
            in: async () => ({
              data: [
                { id: "actor_2", full_name: "Ada Advisor", email: "ada@example.com" },
                { id: "actor_3", full_name: "Mark Manager", email: "mark@example.com" },
                { id: "actor_4", full_name: "Olive Owner", email: "olive@example.com" },
              ],
              error: null,
            }),
          }),
        }),
      } as never;
    }

    throw new Error(`Unexpected table ${table}`);
  });
}

describe("listAiActionApprovalsForReview", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("lists pending approvals for current shop only", async () => {
    mockFromTable();

    const result = await listAiActionApprovalsForReview({
      supabase: {} as never,
      actorContext: ACTOR,
      filters: { status: "pending" },
    });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.id).toBe("approval_pending");
    expect(result.rows[0]?.domain).toBe("work_orders");
  });

  it("returns safe display DTO shape and proof booleans only", async () => {
    mockFromTable();

    const result = await listAiActionApprovalsForReview({
      supabase: {} as never,
      actorContext: ACTOR,
      filters: { status: "all" },
    });

    const first = result.rows[0] as unknown as Record<string, unknown>;

    expect(first.ownerPinProofAttached).toBeTypeOf("boolean");
    expect(first.preview_payload).toBeUndefined();
    expect(first.intended_mutations).toBeUndefined();
    expect(first.owner_pin_verification_ref).toBeUndefined();
    expect(first.snapshot).toBeUndefined();
    expect(first.executionBlocked).toBe(true);
  });

  it("returns summary counts and supports domain + risk filters", async () => {
    mockFromTable();

    const filtered = await listAiActionApprovalsForReview({
      supabase: {} as never,
      actorContext: ACTOR,
      filters: { status: "all", domain: "work_orders", risk: "critical" },
    });

    expect(filtered.rows).toHaveLength(1);
    expect(filtered.summary.pending).toBe(1);
    expect(filtered.summary.approved).toBe(0);
    expect(filtered.summary.highRisk).toBe(1);
    expect(filtered.summary.ownerPinRequired).toBe(1);
  });

  it("supports search and excludes cross-shop approvals", async () => {
    mockFromTable();

    const result = await listAiActionApprovalsForReview({
      supabase: {} as never,
      actorContext: ACTOR,
      filters: { status: "all", search: "shop boost" },
    });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.id).toBe("approval_approved");
  });

  it("falls back to deterministic safe copy when preview payload fields are unsafe", async () => {
    vi.spyOn(types, "fromTable").mockImplementation((_, table: string) => {
      if (table === "ai_action_approvals") {
        return {
          select: () => ({
            eq: () => ({
              limit: () => ({
                eq: async () => ({
                  data: [
                    {
                      id: "approval_unsafe_preview",
                      action_preview_id: "preview_unsafe",
                      status: "pending",
                      owner_pin_required: false,
                      owner_pin_verification_ref: null,
                      requested_at: "2026-04-24T12:00:00.000Z",
                      requested_by: "actor_2",
                      decided_at: null,
                      decided_by: null,
                      metadata: {},
                    },
                  ],
                  error: null,
                }),
                then(resolve: (value: { data: unknown[]; error: null }) => void) {
                  resolve({
                    data: [
                      {
                        id: "approval_unsafe_preview",
                        action_preview_id: "preview_unsafe",
                        status: "pending",
                        owner_pin_required: false,
                        owner_pin_verification_ref: null,
                        requested_at: "2026-04-24T12:00:00.000Z",
                        requested_by: "actor_2",
                        decided_at: null,
                        decided_by: null,
                        metadata: {},
                      },
                    ],
                    error: null,
                  });
                },
              }),
            }),
          }),
        } as never;
      }

      if (table === "ai_action_previews") {
        return {
          select: () => ({
            eq: () => ({
              in: async () => ({
                data: [
                  {
                    id: "preview_unsafe",
                    recommendation_id: null,
                    action_type: "advisor_review_needed",
                    domain: "work_orders",
                    subject_type: "work_order",
                    subject_id: "WO-77",
                    status: "approval_required",
                    requires_approval: true,
                    risk_tier: "high",
                    preview_payload: {
                      label: "secret token abc",
                      description: { nested: "bad" },
                    },
                  },
                ],
                error: null,
              }),
            }),
          }),
        } as never;
      }

      if (table === "ai_recommendations") {
        return {
          select: () => ({
            eq: () => ({
              in: async () => ({ data: [], error: null }),
            }),
          }),
        } as never;
      }

      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              in: async () => ({ data: [], error: null }),
            }),
          }),
        } as never;
      }

      throw new Error(`Unexpected table ${table}`);
    });

    const result = await listAiActionApprovalsForReview({
      supabase: {} as never,
      actorContext: ACTOR,
      filters: { status: "all" },
    });

    expect(result.rows).toHaveLength(1);
    const row = result.rows[0];
    expect(row?.title).toBe("Review work_orders advisor_review_needed action");
    expect(row?.description).toBe("Review-only approval_required request for work_order.");
    expect(row?.title).not.toContain("secret token abc");
  });

  it("rejects json/blob-looking preview description strings and falls back", async () => {
    vi.spyOn(types, "fromTable").mockImplementation((_, table: string) => {
      if (table === "ai_action_approvals") {
        return {
          select: () => ({
            eq: () => ({
              limit: () => ({
                eq: async () => ({
                  data: [{
                    id: "approval_blob_preview",
                    action_preview_id: "preview_blob",
                    status: "pending",
                    owner_pin_required: false,
                    owner_pin_verification_ref: null,
                    requested_at: "2026-04-24T12:00:00.000Z",
                    requested_by: "actor_2",
                    decided_at: null,
                    decided_by: null,
                    metadata: {},
                  }],
                  error: null,
                }),
                then(resolve: (value: { data: unknown[]; error: null }) => void) {
                  resolve({
                    data: [{
                      id: "approval_blob_preview",
                      action_preview_id: "preview_blob",
                      status: "pending",
                      owner_pin_required: false,
                      owner_pin_verification_ref: null,
                      requested_at: "2026-04-24T12:00:00.000Z",
                      requested_by: "actor_2",
                      decided_at: null,
                      decided_by: null,
                      metadata: {},
                    }],
                    error: null,
                  });
                },
              }),
            }),
          }),
        } as never;
      }
      if (table === "ai_action_previews") {
        return {
          select: () => ({
            eq: () => ({
              in: async () => ({
                data: [{
                  id: "preview_blob",
                  recommendation_id: null,
                  action_type: "advisor_review_needed",
                  domain: "work_orders",
                  subject_type: "work_order",
                  subject_id: "WO-77",
                  status: "approval_required",
                  requires_approval: true,
                  risk_tier: "high",
                  preview_payload: {
                    label: "Safe heading",
                    description: "{\"raw\":\"secret\",\"token\":\"abc\"}",
                  },
                }],
                error: null,
              }),
            }),
          }),
        } as never;
      }
      if (table === "ai_recommendations" || table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              in: async () => ({ data: [], error: null }),
            }),
          }),
        } as never;
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const result = await listAiActionApprovalsForReview({
      supabase: {} as never,
      actorContext: ACTOR,
      filters: { status: "all" },
    });

    expect(result.rows[0]?.title).toBe("Safe heading");
    expect(result.rows[0]?.description).toBe("Review-only approval_required request for work_order.");
    expect(result.rows[0]?.description).not.toContain("token");
  });
});
