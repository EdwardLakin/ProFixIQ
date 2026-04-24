import { NextResponse } from "next/server";
import type { Database } from "@shared/types/types/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAiActionPreview, getAiRecommendation, logAiActionEvent, type AiActionPreviewRecord } from "@/features/ai/server";
import {
  buildWorkOrderActionPreviewPayload,
  buildWorkOrderPreviewIdempotencyKey,
  normalizePreviewWarnings,
} from "@/features/ai/server/domains/workOrders";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

type DB = Database;
type WorkOrderRow = DB["public"]["Tables"]["work_orders"]["Row"];

const BLOCKED_REASON = "Autonomous AI action execution is not enabled. This preview is informational only.";

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

async function getPreviewByIdempotencyKey(input: {
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

async function listPreviewsForRecommendation(input: {
  supabase: SupabaseClient<DB>;
  shopId: string;
  recommendationId: string;
  workOrderId: string;
}): Promise<AiActionPreviewRecord[]> {
  const { data, error } = await input.supabase
    .from("ai_action_previews")
    .select("*")
    .eq("shop_id", input.shopId)
    .eq("recommendation_id", input.recommendationId)
    .eq("domain", "work_orders")
    .eq("subject_type", "work_order")
    .eq("subject_id", input.workOrderId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as AiActionPreviewRecord[];
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string; recommendationId: string }> },
) {
  const access = await requireShopScopedApiAccess();
  if (!access.ok) return access.response;

  const { id, recommendationId } = await ctx.params;

  if (!id) return NextResponse.json({ error: "Missing work order id" }, { status: 400 });
  if (!recommendationId) return NextResponse.json({ error: "Missing recommendation id" }, { status: 400 });

  const shopId = access.profile.shop_id;
  if (!shopId) return NextResponse.json({ error: "Shop not found" }, { status: 403 });

  const actor = {
    shopId,
    actorId: access.profile.id,
    role: access.profile.role,
    source: "manual" as const,
  };

  try {
    const scopedWorkOrder = await getShopScopedWorkOrder({
      supabase: access.supabase,
      workOrderId: id,
      shopId,
    });

    if (!scopedWorkOrder) {
      return NextResponse.json({ error: "Work order not found" }, { status: 404 });
    }

    const recommendation = await getAiRecommendation(access.supabase, actor, recommendationId);

    if (
      !recommendation ||
      recommendation.shop_id !== shopId ||
      recommendation.domain !== "work_orders" ||
      recommendation.subject_type !== "work_order" ||
      recommendation.subject_id !== id
    ) {
      return NextResponse.json({ error: "Recommendation not found" }, { status: 404 });
    }

    const previews = await listPreviewsForRecommendation({
      supabase: access.supabase,
      shopId,
      recommendationId,
      workOrderId: id,
    });

    return NextResponse.json({
      preview: previews[0] ?? null,
      previews,
      executionBlocked: true,
      blockedReason: BLOCKED_REASON,
      warnings: [BLOCKED_REASON],
    });
  } catch {
    return NextResponse.json({ error: "Failed to load action previews" }, { status: 500 });
  }
}

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string; recommendationId: string }> },
) {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageWorkOrders",
    allowRoles: ["owner", "admin", "manager", "advisor"],
  });
  if (!access.ok) return access.response;

  const { id, recommendationId } = await ctx.params;

  if (!id) return NextResponse.json({ error: "Missing work order id" }, { status: 400 });
  if (!recommendationId) return NextResponse.json({ error: "Missing recommendation id" }, { status: 400 });

  const shopId = access.profile.shop_id;
  if (!shopId) return NextResponse.json({ error: "Shop not found" }, { status: 403 });

  const actor = {
    shopId,
    actorId: access.profile.id,
    role: access.profile.role,
    source: "manual" as const,
  };

  try {
    const scopedWorkOrder = await getShopScopedWorkOrder({
      supabase: access.supabase,
      workOrderId: id,
      shopId,
    });

    if (!scopedWorkOrder) {
      return NextResponse.json({ error: "Work order not found" }, { status: 404 });
    }

    const recommendation = await getAiRecommendation(access.supabase, actor, recommendationId);

    if (
      !recommendation ||
      recommendation.shop_id !== shopId ||
      recommendation.domain !== "work_orders" ||
      recommendation.subject_type !== "work_order" ||
      recommendation.subject_id !== id
    ) {
      return NextResponse.json({ error: "Recommendation not found" }, { status: 404 });
    }

    const payload = buildWorkOrderActionPreviewPayload({
      recommendation,
      workOrderId: id,
    });

    if ("previewable" in payload && payload.previewable === false) {
      return NextResponse.json(
        {
          error: payload.reason,
          executionBlocked: true,
          blockedReason: BLOCKED_REASON,
          warnings: [payload.reason, BLOCKED_REASON],
        },
        { status: 400 },
      );
    }

    if (payload.risk_tier === "critical") {
      return NextResponse.json(
        {
          error: "Critical-risk previews are not enabled in this phase.",
          executionBlocked: true,
          blockedReason: BLOCKED_REASON,
          warnings: [BLOCKED_REASON],
        },
        { status: 400 },
      );
    }

    const idempotencyKey = buildWorkOrderPreviewIdempotencyKey({
      shopId,
      workOrderId: id,
      recommendationId,
      actionType: payload.action_type,
    });

    const existing = await getPreviewByIdempotencyKey({
      supabase: access.supabase,
      shopId,
      idempotencyKey,
    });

    const preview =
      existing ??
      (await createAiActionPreview(access.supabase, actor, {
        recommendationId,
        domain: "work_orders",
        actionType: payload.action_type,
        subjectType: "work_order",
        subjectId: id,
        previewPayload: payload,
        intendedMutations: payload.intended_mutations,
        affectedRecords: payload.affected_records,
        sideEffects: payload.side_effects,
        compensationPlan: payload.compensation_plan,
        idempotencyKey,
        riskTier: payload.risk_tier,
        evidenceSnapshotId: payload.evidence_snapshot_id,
        requiresApproval: payload.requires_approval,
        requiresOwnerPin: false,
        metadata: {
          blocked_execution_reason: payload.blocked_execution_reason,
          recommendation_type: recommendation.recommendation_type,
        },
      }));

    await logAiActionEvent(access.supabase, actor, {
      recommendationId,
      actionPreviewId: preview.id,
      eventType: "action_preview.blocked_execution",
      idempotencyKey,
      payload: {
        reason: BLOCKED_REASON,
        execution_blocked: true,
      },
    });

    return NextResponse.json({
      preview,
      executionBlocked: true,
      blockedReason: BLOCKED_REASON,
      warnings: normalizePreviewWarnings(payload),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate action preview";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
