import { NextResponse } from "next/server";
import type { Database } from "@shared/types/types/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildAdvisorExplanationDraftFromRecommendation,
  buildAdvisorExplanationDraftFromSnapshot,
  createAiActionPreview,
  listAiEvidenceSnapshotsForSubject,
  listAiRecommendationsForSubject,
  type AiActionPreviewRecord,
} from "@/features/ai/server";
import { generateWorkOrderEvidenceAndRecommendations, type WorkOrderEvidenceSnapshot } from "@/features/ai/server/domains/workOrders";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

type DB = Database;
type WorkOrderRow = DB["public"]["Tables"]["work_orders"]["Row"];

const ACTION_TYPE = "advisor_explanation_draft";
const EXECUTION_BLOCKED_REASON = "No external side effects. Internal advisor draft only.";

function parseSnapshot(value: unknown): WorkOrderEvidenceSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const candidate = value as Partial<WorkOrderEvidenceSnapshot>;
  if (typeof candidate.work_order_id !== "string") return null;
  if (!candidate.evidence_metadata || typeof candidate.evidence_metadata !== "object") return null;

  return candidate as WorkOrderEvidenceSnapshot;
}

async function getShopScopedWorkOrder(input: {
  supabase: SupabaseClient<DB>;
  workOrderId: string;
  shopId: string;
}): Promise<WorkOrderRow | null> {
  const { data, error } = await input.supabase
    .from("work_orders")
    .select("*")
    .eq("id", input.workOrderId)
    .eq("shop_id", input.shopId)
    .maybeSingle<WorkOrderRow>();

  if (error) throw new Error(error.message);
  return data;
}

async function getLatestAdvisorDraftPreview(input: {
  supabase: SupabaseClient<DB>;
  shopId: string;
  workOrderId: string;
}): Promise<AiActionPreviewRecord | null> {
  const { data, error } = await input.supabase
    .from("ai_action_previews")
    .select("*")
    .eq("shop_id", input.shopId)
    .eq("domain", "work_orders")
    .eq("subject_type", "work_order")
    .eq("subject_id", input.workOrderId)
    .eq("action_type", ACTION_TYPE)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<AiActionPreviewRecord>();

  if (error) throw new Error(error.message);
  return data;
}

async function getAdvisorDraftPreviewByIdempotency(input: {
  supabase: SupabaseClient<DB>;
  shopId: string;
  idempotencyKey: string;
}): Promise<AiActionPreviewRecord | null> {
  const { data, error } = await input.supabase
    .from("ai_action_previews")
    .select("*")
    .eq("shop_id", input.shopId)
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle<AiActionPreviewRecord>();

  if (error) throw new Error(error.message);
  return data;
}

function selectPrimaryRecommendation<T extends { status: string; created_at: string }>(recommendations: T[]): T | null {
  const open = recommendations.filter((row) => row.status === "open" || row.status === "acknowledged");
  if (open.length === 0) return null;
  return open.slice().sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0] ?? null;
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageWorkOrders",
    allowRoles: ["owner", "admin", "manager", "advisor", "lead_hand", "foreman"],
  });
  if (!access.ok) return access.response;

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Missing work order id" }, { status: 400 });

  const shopId = access.profile.shop_id;
  if (!shopId) return NextResponse.json({ error: "Shop not found" }, { status: 403 });

  try {
    const workOrder = await getShopScopedWorkOrder({
      supabase: access.supabase,
      workOrderId: id,
      shopId,
    });

    if (!workOrder) {
      return NextResponse.json({ error: "Work order not found" }, { status: 404 });
    }

    const actor = {
      shopId,
      actorId: access.profile.id,
      role: access.profile.role,
      source: "manual" as const,
    };

    const [snapshots, recommendations, preview] = await Promise.all([
      listAiEvidenceSnapshotsForSubject(access.supabase, actor, {
        subjectType: "work_order",
        subjectId: id,
        domain: "work_orders",
        limit: 1,
      }),
      listAiRecommendationsForSubject(access.supabase, actor, {
        subjectType: "work_order",
        subjectId: id,
        domain: "work_orders",
        limit: 50,
      }),
      getLatestAdvisorDraftPreview({
        supabase: access.supabase,
        shopId,
        workOrderId: id,
      }),
    ]);

    const latestEvidence = snapshots[0] ?? null;
    if (!latestEvidence) {
      return NextResponse.json({
        draft: null,
        advisoryOnly: true,
        warnings: ["No evidence snapshot available yet. Use POST to generate one."],
      });
    }

    const snapshot = parseSnapshot(latestEvidence.snapshot);
    if (!snapshot) {
      return NextResponse.json({ error: "Latest evidence snapshot payload is invalid." }, { status: 500 });
    }

    const primaryRecommendation = selectPrimaryRecommendation(recommendations);
    const draft = primaryRecommendation
      ? buildAdvisorExplanationDraftFromRecommendation({
          snapshot,
          evidenceSnapshotId: latestEvidence.id,
          workOrderId: id,
          recommendation: primaryRecommendation,
        })
      : buildAdvisorExplanationDraftFromSnapshot({
          snapshot,
          evidenceSnapshotId: latestEvidence.id,
          workOrderId: id,
        });

    return NextResponse.json({
      draft,
      advisoryOnly: true,
      preview,
      executionBlocked: true,
      blockedReason: EXECUTION_BLOCKED_REASON,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load advisor explanation draft";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageWorkOrders",
    allowRoles: ["owner", "admin", "manager", "advisor", "lead_hand", "foreman"],
  });
  if (!access.ok) return access.response;

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Missing work order id" }, { status: 400 });

  const shopId = access.profile.shop_id;
  if (!shopId) return NextResponse.json({ error: "Shop not found" }, { status: 403 });

  try {
    const workOrder = await getShopScopedWorkOrder({
      supabase: access.supabase,
      workOrderId: id,
      shopId,
    });

    if (!workOrder) {
      return NextResponse.json({ error: "Work order not found" }, { status: 404 });
    }

    const actor = {
      shopId,
      actorId: access.profile.id,
      role: access.profile.role,
      source: "manual" as const,
    };

    const result = await generateWorkOrderEvidenceAndRecommendations({
      supabase: access.supabase,
      actor,
      workOrderId: id,
    });

    const snapshot = parseSnapshot(result.evidenceSnapshot.snapshot);
    if (!snapshot) {
      return NextResponse.json({ error: "Generated evidence snapshot payload is invalid." }, { status: 500 });
    }

    const primaryRecommendation = selectPrimaryRecommendation(result.recommendations);
    const draft = primaryRecommendation
      ? buildAdvisorExplanationDraftFromRecommendation({
          snapshot,
          evidenceSnapshotId: result.evidenceSnapshot.id,
          workOrderId: id,
          recommendation: primaryRecommendation,
        })
      : buildAdvisorExplanationDraftFromSnapshot({
          snapshot,
          evidenceSnapshotId: result.evidenceSnapshot.id,
          workOrderId: id,
        });

    const idempotencyKey = [shopId, id, result.evidenceSnapshot.id, primaryRecommendation?.id ?? "none", ACTION_TYPE].join(":");

    const existingPreview = await getAdvisorDraftPreviewByIdempotency({
      supabase: access.supabase,
      shopId,
      idempotencyKey,
    });

    const preview =
      existingPreview ??
      (await createAiActionPreview(access.supabase, actor, {
        recommendationId: primaryRecommendation?.id ?? null,
        domain: "work_orders",
        actionType: ACTION_TYPE,
        subjectType: "work_order",
        subjectId: id,
        previewPayload: {
          ...draft,
          executionBlocked: true,
        },
        intendedMutations: [],
        affectedRecords: [
          { type: "work_order", id },
          { type: "evidence_snapshot", id: result.evidenceSnapshot.id },
          ...(primaryRecommendation?.id ? [{ type: "recommendation", id: primaryRecommendation.id }] : []),
        ],
        sideEffects: [EXECUTION_BLOCKED_REASON],
        compensationPlan: {
          mode: "preview_only",
          details: "No execution path is enabled. Internal advisor draft generation only.",
        },
        idempotencyKey,
        riskTier: "low",
        evidenceSnapshotId: result.evidenceSnapshot.id,
        requiresApproval: false,
        requiresOwnerPin: false,
        metadata: {
          advisory_only: true,
          audience: "internal_advisor",
          execution_blocked: true,
        },
      }));

    return NextResponse.json({
      draft,
      preview,
      advisoryOnly: true,
      executionBlocked: true,
      blockedReason: EXECUTION_BLOCKED_REASON,
      warnings: draft.warnings,
      prohibitedActions: draft.prohibitedActions,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate advisor explanation draft";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
