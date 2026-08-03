import "server-only";

import { NextResponse } from "next/server";
import { createAdminSupabase, createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { resolveFleetActorContext } from "@/features/fleet/lib/resolveFleetActorContext";
import { resolveEvidenceDisplayUrl } from "@/features/work-orders/server/workOrderEvidenceUrls";
import {
  parseAnnotationOverlay,
  type WorkOrderEvidenceAnnotation,
  type WorkOrderEvidenceItem,
} from "@/features/work-orders/lib/evidence/workOrderEvidence";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ unitId: string }>;
};

type AnnotationRow = {
  id: string;
  media_id: string;
  version: number;
  overlay: unknown;
  visibility: string;
  created_at: string;
  created_by: string;
};

export async function GET(_request: Request, context: RouteContext) {
  const { unitId } = await context.params;
  const session = createServerSupabaseRoute();
  const actor = await resolveFleetActorContext(session);
  if (
    !actor.userId ||
    !actor.shopId ||
    (!actor.isInternal &&
      (!actor.isFleetActor || actor.fleetIds.length === 0))
  ) {
    return NextResponse.json({ error: "Fleet access required" }, { status: 403 });
  }

  const admin = createAdminSupabase();
  let enrollmentQuery = admin
    .from("fleet_vehicles")
    .select("fleet_id,shop_id")
    .eq("vehicle_id", unitId)
    .eq("shop_id", actor.shopId)
    .limit(1);
  if (!actor.isInternal) {
    enrollmentQuery = enrollmentQuery.in("fleet_id", actor.fleetIds);
  }
  const { data: enrollment, error: enrollmentError } =
    await enrollmentQuery.maybeSingle();
  if (enrollmentError || !enrollment?.fleet_id || !enrollment.shop_id) {
    return NextResponse.json({ error: "Fleet unit not found" }, { status: 404 });
  }

  const evidenceShopId = enrollment.shop_id;
  if (!actor.isInternal) {
    const { data: membership, error: membershipError } = await admin
      .from("fleet_members")
      .select("shop_id")
      .eq("user_id", actor.userId)
      .eq("fleet_id", enrollment.fleet_id)
      .maybeSingle();
    if (
      membershipError ||
      !membership?.shop_id ||
      membership.shop_id !== evidenceShopId
    ) {
      return NextResponse.json({ error: "Fleet unit not found" }, { status: 404 });
    }
  }

  const { data: workOrders, error: workOrdersError } = await admin
    .from("work_orders")
    .select("id,custom_id,status,created_at")
    .eq("shop_id", evidenceShopId)
    .eq("vehicle_id", unitId)
    .order("created_at", { ascending: false })
    .limit(12);
  if (workOrdersError) {
    return NextResponse.json(
      { error: "Unable to load fleet repair evidence" },
      { status: 500 },
    );
  }
  const workOrderIds = (workOrders ?? []).map((workOrder) => workOrder.id);
  if (workOrderIds.length === 0) {
    return NextResponse.json({ workOrders: [], items: [] });
  }

  const [
    { data: lines, error: linesError },
    { data: mediaRows, error: mediaError },
  ] = await Promise.all([
    admin
      .from("work_order_lines")
      .select("id,work_order_id,description,complaint,status")
      .in("work_order_id", workOrderIds),
    admin
      .from("work_order_media")
      .select(
        "id,work_order_id,work_order_line_id,quote_line_id,kind,source,visibility,file_name,content_type,file_size,created_at,storage_bucket,storage_path,url",
      )
      .eq("shop_id", evidenceShopId)
      .eq("visibility", "customer")
      .in("work_order_id", workOrderIds)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  if (linesError || mediaError) {
    return NextResponse.json(
      { error: "Unable to load fleet repair evidence" },
      { status: 500 },
    );
  }

  const mediaIds = (mediaRows ?? []).map((row) => row.id);
  let annotationRows: AnnotationRow[] = [];
  if (mediaIds.length > 0) {
    const { data, error: annotationError } = await admin
      .from("work_order_media_annotations")
      .select("id,media_id,version,overlay,visibility,created_at,created_by")
      .eq("shop_id", evidenceShopId)
      .in("media_id", mediaIds)
      .order("version", { ascending: false });
    if (annotationError) {
      return NextResponse.json(
        { error: "Unable to load fleet evidence markup" },
        { status: 500 },
      );
    }
    annotationRows = (data ?? []) as AnnotationRow[];
  }

  const latestByMedia = new Map<string, WorkOrderEvidenceAnnotation>();
  const resolvedMediaIds = new Set<string>();
  for (const row of annotationRows) {
    if (resolvedMediaIds.has(row.media_id)) continue;
    resolvedMediaIds.add(row.media_id);
    if (row.visibility !== "customer") continue;
    const overlay = parseAnnotationOverlay(row.overlay);
    if (!overlay) continue;
    latestByMedia.set(row.media_id, {
      id: row.id,
      version: row.version,
      visibility: "customer",
      createdAt: row.created_at,
      createdBy: row.created_by,
      overlay,
    });
  }

  const items: WorkOrderEvidenceItem[] = await Promise.all(
    (mediaRows ?? []).map(async (row) => {
      return {
        id: row.id,
        workOrderId: row.work_order_id,
        workOrderLineId: row.work_order_line_id,
        quoteLineId: row.quote_line_id,
        kind: row.kind,
        source: row.source,
        visibility: "customer" as const,
        fileName: row.file_name,
        contentType: row.content_type,
        fileSize: row.file_size,
        createdAt: row.created_at,
        displayUrl: await resolveEvidenceDisplayUrl(admin, row),
        annotation: latestByMedia.get(row.id) ?? null,
      };
    }),
  );

  return NextResponse.json({
    workOrders: workOrders ?? [],
    lines: lines ?? [],
    items,
  });
}
