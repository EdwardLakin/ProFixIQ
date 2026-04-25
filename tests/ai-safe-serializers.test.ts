import { describe, expect, it } from "vitest";
import {
  serializeAiActionPreviewForUi,
  serializeAiApprovalRequestForUi,
  serializeAiEvidenceSnapshotForUi,
  serializeAiRecommendationForUi,
} from "@/features/ai/server";
import { expectNoBannedDtoKeys, sortedKeys } from "./ai-dto-test-helpers";

describe("AI safe serializers", () => {
  it("serializes evidence snapshot with allowlisted keys only", () => {
    const dto = serializeAiEvidenceSnapshotForUi({
      id: "ev_1",
      shop_id: "shop_1",
      subject_type: "work_order",
      subject_id: "wo_1",
      domain: "work_orders",
      evidence_kind: "work_order_operational",
      snapshot: { private: "raw" },
      source_refs: [{ secret: "ref" }],
      missing_data: ["missing_parts", "missing_approval"],
      freshness_at: "2026-04-24T00:00:00.000Z",
      confidence: 0.82,
      created_by: "actor_1",
      created_at: "2026-04-24T00:00:00.000Z",
      metadata: { internalRef: "do-not-leak" },
    });

    expect(dto).not.toBeNull();
    expect(sortedKeys(dto as unknown as Record<string, unknown>)).toEqual([
      "confidence",
      "domain",
      "evidenceKind",
      "evidenceSnapshotId",
      "freshnessAt",
      "generatedAt",
      "missingData",
      "missingDataCount",
      "subjectId",
      "subjectType",
    ]);
    expectNoBannedDtoKeys(dto);
  });

  it("serializes preview DTO with executionBlocked and safe display fields", () => {
    const dto = serializeAiActionPreviewForUi({
      id: "preview_1",
      shop_id: "shop_1",
      recommendation_id: "rec_1",
      domain: "work_orders",
      action_type: "advisor_review_needed",
      subject_type: "work_order",
      subject_id: "wo_1",
      status: "approval_required",
      preview_payload: {
        label: '{"token":"nope"}',
        description: "owner_pin_verification_ref should not show",
        side_effects: ["queue_update"],
        ownerPinProofRef: "/proof/path",
      },
      intended_mutations: [{ op: "update" }],
      affected_records: [{ id: "wo_1" }],
      side_effects: ["queue_update", "QUEUE_UPDATE"],
      compensation_plan: { rollback: true },
      idempotency_key: "idem_1",
      requires_approval: true,
      requires_owner_pin: true,
      risk_tier: "high",
      evidence_snapshot_id: "ev_1",
      created_by: "actor_1",
      created_at: "2026-04-24T00:00:00.000Z",
      updated_at: "2026-04-24T00:00:00.000Z",
      expires_at: null,
      metadata: {
        token: "sensitive",
      },
    });

    expect(dto.executionBlocked).toBe(true);
    expect(dto.intendedMutationCount).toBe(1);
    expect(dto.sideEffectLabels).toEqual(["queue_update"]);
    expect(dto.title).toBe("Preview: advisor_review_needed");
    expect(dto.description).toBeNull();

    expect(sortedKeys(dto as unknown as Record<string, unknown>)).toEqual([
      "actionType",
      "affectedRecordCount",
      "approvalRequired",
      "createdAt",
      "description",
      "evidenceSnapshotId",
      "executionBlocked",
      "expiresAt",
      "intendedMutationCount",
      "previewId",
      "recommendationId",
      "requiresOwnerPin",
      "riskTier",
      "severitySummary",
      "sideEffectLabels",
      "status",
      "subjectId",
      "subjectType",
      "title",
    ]);
    expectNoBannedDtoKeys(dto);
  });

  it("serializes approval request with minimal review-only contract", () => {
    const dto = serializeAiApprovalRequestForUi({
      approval: {
        id: "approval_1",
        shop_id: "shop_1",
        action_preview_id: "preview_1",
        status: "pending",
        requested_by: "actor_1",
        requested_at: "2026-04-24T00:00:00.000Z",
        decided_by: null,
        decided_at: null,
        decision_note: null,
        owner_pin_required: true,
        owner_pin_verified: false,
        owner_pin_verification_ref: "proof_ref",
        expires_at: null,
        metadata: {
          ownerPinProofRef: "/internal/path",
        },
      },
      preview: {
        id: "preview_1",
        shop_id: "shop_1",
        recommendation_id: "rec_1",
        domain: "work_orders",
        action_type: "advisor_review_needed",
        subject_type: "work_order",
        subject_id: "wo_1",
        status: "approval_required",
        preview_payload: {},
        intended_mutations: [],
        affected_records: [],
        side_effects: [],
        compensation_plan: {},
        idempotency_key: null,
        requires_approval: true,
        requires_owner_pin: true,
        risk_tier: "high",
        evidence_snapshot_id: null,
        created_by: null,
        created_at: "2026-04-24T00:00:00.000Z",
        updated_at: "2026-04-24T00:00:00.000Z",
        expires_at: null,
        metadata: {},
      },
    });

    expect(dto.executionBlocked).toBe(true);
    expect(sortedKeys(dto as unknown as Record<string, unknown>)).toEqual([
      "approvalId",
      "approvalRequired",
      "executionBlocked",
      "message",
      "previewId",
      "requestedAt",
      "requiresOwnerPin",
      "status",
    ]);
    expectNoBannedDtoKeys(dto);
  });

  it("serializes recommendation with allowlisted keys only", () => {
    const dto = serializeAiRecommendationForUi({
      id: "rec_1",
      shop_id: "shop_1",
      domain: "work_orders",
      recommendation_type: "dispatch_review",
      subject_type: "work_order",
      subject_id: "wo_1",
      title: "{\"metadata\":true}",
      summary: "Review dispatch",
      status: "open",
      priority: "high",
      confidence: 0.9,
      risk_tier: "high",
      evidence_snapshot_id: "ev_1",
      evidence_snapshot_ids: ["ev_1"],
      missing_data: ["tech_assignment"],
      recommended_action: {
        label: "token should be removed",
        details: "Review queue",
        token: "internal",
      },
      side_effects: ["internal_effect"],
      requires_approval: true,
      requires_owner_pin: false,
      source: "manual",
      source_run_id: null,
      created_by: "actor_1",
      assigned_to: null,
      dismissed_by: null,
      dismissed_at: null,
      resolved_by: null,
      resolved_at: null,
      expires_at: null,
      created_at: "2026-04-24T00:00:00.000Z",
      updated_at: "2026-04-24T00:00:00.000Z",
      metadata: { secret: "nope" },
    });

    expect(dto.title).toBe("Recommendation");
    expect(dto.recommended_action).toEqual({ details: "Review queue", label: undefined });
    expect(sortedKeys(dto as unknown as Record<string, unknown>)).toEqual([
      "confidence",
      "created_at",
      "evidence_snapshot_id",
      "id",
      "missing_data",
      "priority",
      "recommendation_type",
      "recommended_action",
      "requires_approval",
      "requires_owner_pin",
      "risk_tier",
      "status",
      "summary",
      "title",
    ]);
    expectNoBannedDtoKeys(dto);
  });
});
