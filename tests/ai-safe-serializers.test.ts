import { describe, expect, it } from "vitest";
import {
  serializeAiActionPreviewForUi,
  serializeAiApprovalRequestForUi,
  serializeAiEvidenceSnapshotForUi,
  serializeAiRecommendationForUi,
} from "@/features/ai/server";

describe("AI safe serializers", () => {
  it("strips raw evidence payloads and metadata", () => {
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

    expect(dto).toMatchObject({
      evidenceSnapshotId: "ev_1",
      evidenceKind: "work_order_operational",
      missingDataCount: 2,
    });
    const serialized = JSON.stringify(dto);
    expect(serialized).not.toContain("snapshot");
    expect(serialized).not.toContain("source_refs");
    expect(serialized).not.toContain("metadata");
    expect(serialized).not.toContain("internalRef");
  });

  it("strips preview payload internals and keeps execution blocked", () => {
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
        label: "Review technician dispatch",
        description: "Internal review only.",
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
        secret: "sensitive",
        hash: "sensitive",
        pin: "sensitive",
      },
    });

    expect(dto.executionBlocked).toBe(true);
    expect(dto.intendedMutationCount).toBe(1);
    expect(dto.sideEffectLabels).toEqual(["queue_update"]);
    const serialized = JSON.stringify(dto);
    expect(serialized).not.toContain("intended_mutations");
    expect(serialized).not.toContain("ownerPinProofRef");
    expect(serialized).not.toContain("token");
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("hash");
    expect(serialized).not.toContain("pin");
  });

  it("returns minimal approval request DTO without proof references", () => {
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
          token: "nope",
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

    expect(dto).toMatchObject({
      approvalId: "approval_1",
      previewId: "preview_1",
      executionBlocked: true,
      requiresOwnerPin: true,
    });
    expect(JSON.stringify(dto)).not.toContain("owner_pin_verification_ref");
    expect(JSON.stringify(dto)).not.toContain("ownerPinProofRef");
    expect(JSON.stringify(dto)).not.toContain("token");
  });

  it("serializes recommendation with allowlisted fields only", () => {
    const dto = serializeAiRecommendationForUi({
      id: "rec_1",
      shop_id: "shop_1",
      domain: "work_orders",
      recommendation_type: "dispatch_review",
      subject_type: "work_order",
      subject_id: "wo_1",
      title: "Dispatch review",
      summary: "Review dispatch",
      status: "open",
      priority: "high",
      confidence: 0.9,
      risk_tier: "high",
      evidence_snapshot_id: "ev_1",
      evidence_snapshot_ids: ["ev_1"],
      missing_data: ["tech_assignment"],
      recommended_action: { label: "Review", details: "Review queue", token: "internal" },
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

    const serialized = JSON.stringify(dto);
    expect(serialized).not.toContain("metadata");
    expect(serialized).not.toContain("side_effects");
    expect(serialized).not.toContain("token");
    expect(dto.requires_approval).toBe(true);
  });
});
