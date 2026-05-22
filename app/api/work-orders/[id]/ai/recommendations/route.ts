import { NextResponse } from "next/server";
import type { Database } from "@shared/types/types/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import {
  listAiEvidenceSnapshotsForSubject,
  listAiRecommendationsForSubject,
  serializeAiEvidenceSnapshotForUi,
  serializeAiRecommendationForUi,
} from "@/features/ai/server";
import { generateWorkOrderEvidenceAndRecommendations } from "@/features/ai/server/domains/workOrders";

type DB = Database;
type WorkOrderRow = DB["public"]["Tables"]["work_orders"]["Row"];

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

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const access = await requireShopScopedApiAccess();
  if (!access.ok) return access.response;

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Missing work order id" }, { status: 400 });

  const shopId = access.profile.shop_id;
  if (!shopId) return NextResponse.json({ error: "Shop not found" }, { status: 403 });

  const scopedWorkOrder = await getShopScopedWorkOrder({
    supabase: access.supabase,
    workOrderId: id,
    shopId,
  });

  if (!scopedWorkOrder) {
    return NextResponse.json({ error: "Work order not found" }, { status: 404 });
  }

  const actor = {
    shopId,
    actorId: access.profile.id,
    role: access.profile.role,
    source: "manual" as const,
  };

  const [recommendations, evidenceSnapshots] = await Promise.all([
    listAiRecommendationsForSubject(access.supabase, actor, {
      subjectType: "work_order",
      subjectId: id,
      domain: "work_orders",
      limit: 50,
    }),
    listAiEvidenceSnapshotsForSubject(access.supabase, actor, {
      subjectType: "work_order",
      subjectId: id,
      domain: "work_orders",
      limit: 1,
    }),
  ]);

  const openRecommendations = recommendations.filter((row) => row.status === "open" || row.status === "acknowledged");
  const latestEvidence = evidenceSnapshots[0] ?? null;

  return NextResponse.json({
    evidenceSnapshot: serializeAiEvidenceSnapshotForUi(latestEvidence),
    recommendations: openRecommendations.map(serializeAiRecommendationForUi),
    skippedDuplicates: [],
    missingData: serializeAiEvidenceSnapshotForUi(latestEvidence)?.missingData ?? [],
    warnings: [],
  });
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

  const scopedWorkOrder = await getShopScopedWorkOrder({
    supabase: access.supabase,
    workOrderId: id,
    shopId,
  });

  if (!scopedWorkOrder) {
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

  return NextResponse.json({
    evidenceSnapshot: serializeAiEvidenceSnapshotForUi(result.evidenceSnapshot),
    recommendations: result.recommendations.map(serializeAiRecommendationForUi),
    skippedDuplicates: result.skippedDuplicates,
    missingData: result.missingData,
    warnings: result.warnings,
  });
}
