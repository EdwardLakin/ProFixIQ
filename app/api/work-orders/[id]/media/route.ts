import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { createAdminSupabase, createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { authorizeWorkOrderEvidence } from "@/features/work-orders/server/authorizeWorkOrderEvidence";
import { resolveEvidenceDisplayUrl } from "@/features/work-orders/server/workOrderEvidenceUrls";
import {
  parseAnnotationOverlay,
  type EvidenceVisibility,
  type WorkOrderEvidenceAnnotation,
  type WorkOrderEvidenceItem,
} from "@/features/work-orders/lib/evidence/workOrderEvidence";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type MediaRow = {
  id: string;
  work_order_id: string;
  work_order_line_id: string | null;
  quote_line_id: string | null;
  kind: string | null;
  source: string | null;
  visibility: string;
  file_name: string | null;
  content_type: string | null;
  file_size: number | null;
  created_at: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  url: string | null;
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

function visibility(value: string): EvidenceVisibility {
  return value === "customer" ? "customer" : "internal";
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { id: workOrderId } = await context.params;
  const session = createServerSupabaseRoute();
  const actor = await authorizeWorkOrderEvidence(session, workOrderId);
  if (!actor) {
    return NextResponse.json({ error: "Work order evidence not found" }, { status: 404 });
  }

  const scope = request.nextUrl.searchParams.get("scope") ?? "all";
  const lineId = request.nextUrl.searchParams.get("lineId");
  if (!["all", "line", "unassigned"].includes(scope)) {
    return NextResponse.json({ error: "Unsupported evidence scope" }, { status: 400 });
  }
  if (scope === "line" && !lineId) {
    return NextResponse.json({ error: "lineId is required for line evidence" }, { status: 400 });
  }

  const admin = createAdminSupabase();
  let query = admin
    .from("work_order_media")
    .select(
      "id,work_order_id,work_order_line_id,quote_line_id,kind,source,visibility,file_name,content_type,file_size,created_at,storage_bucket,storage_path,url",
    )
    .eq("shop_id", actor.shopId)
    .eq("work_order_id", actor.workOrderId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (actor.kind !== "staff") query = query.eq("visibility", "customer");
  if (scope === "line") query = query.eq("work_order_line_id", lineId as string);
  if (scope === "unassigned") query = query.is("work_order_line_id", null).is("quote_line_id", null);

  const { data: mediaRows, error: mediaError } = await query;
  if (mediaError) {
    return NextResponse.json({ error: "Unable to load work order evidence" }, { status: 500 });
  }

  const rows = (mediaRows ?? []) as MediaRow[];
  const mediaIds = rows.map((row) => row.id);
  let annotationRows: AnnotationRow[] = [];
  if (mediaIds.length > 0) {
    const annotationQuery = admin
      .from("work_order_media_annotations")
      .select("id,media_id,version,overlay,visibility,created_at,created_by")
      .eq("shop_id", actor.shopId)
      .in("media_id", mediaIds)
      .order("version", { ascending: false });
    const { data, error: annotationError } = await annotationQuery;
    if (annotationError) {
      return NextResponse.json(
        { error: "Unable to load evidence markup" },
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
    if (actor.kind !== "staff" && row.visibility !== "customer") continue;
    const overlay = parseAnnotationOverlay(row.overlay);
    if (!overlay) continue;
    latestByMedia.set(row.media_id, {
      id: row.id,
      version: row.version,
      visibility: visibility(row.visibility),
      createdAt: row.created_at,
      createdBy: row.created_by,
      overlay,
    });
  }

  const items: WorkOrderEvidenceItem[] = await Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      workOrderId: row.work_order_id,
      workOrderLineId: row.work_order_line_id,
      quoteLineId: row.quote_line_id,
      kind: row.kind,
      source: row.source,
      visibility: visibility(row.visibility),
      fileName: row.file_name,
      contentType: row.content_type,
      fileSize: row.file_size,
      createdAt: row.created_at,
      displayUrl: await resolveEvidenceDisplayUrl(admin, row),
      annotation: latestByMedia.get(row.id) ?? null,
    })),
  );

  return NextResponse.json({
    items,
    canEdit: actor.canEdit,
    actorKind: actor.kind,
  });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id: workOrderId } = await context.params;
  const session = createServerSupabaseRoute();
  const actor = await authorizeWorkOrderEvidence(session, workOrderId);
  if (!actor || actor.kind !== "staff" || !actor.canEdit) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const mediaId = typeof body?.mediaId === "string" ? body.mediaId : "";
  if (!mediaId) {
    return NextResponse.json({ error: "mediaId is required" }, { status: 400 });
  }

  const admin = createAdminSupabase();
  const { data: media } = await admin
    .from("work_order_media")
    .select("id,shop_id,work_order_id")
    .eq("id", mediaId)
    .eq("shop_id", actor.shopId)
    .eq("work_order_id", actor.workOrderId)
    .maybeSingle();
  if (!media?.id) {
    return NextResponse.json({ error: "Media not found" }, { status: 404 });
  }

  const requestedVisibility =
    body?.visibility === "customer" ? "customer" : body?.visibility === "internal" ? "internal" : null;

  if (body?.action === "save_annotation") {
    const overlay = parseAnnotationOverlay(body.overlay);
    const clientMutationId =
      typeof body.clientMutationId === "string" ? body.clientMutationId.trim() : "";
    if (!overlay || !requestedVisibility || !clientMutationId) {
      return NextResponse.json({ error: "Invalid annotation payload" }, { status: 400 });
    }

    const { data, error } = await session.rpc(
      "save_work_order_media_annotation_atomic",
      {
        p_media_id: mediaId,
        p_overlay: overlay,
        p_visibility: requestedVisibility,
        p_client_mutation_id: clientMutationId,
      },
    );
    if (error) {
      return NextResponse.json(
        { error: "Unable to save evidence markup" },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: true, annotation: data });
  }

  if (body?.action === "update_context") {
    const update: {
      visibility?: EvidenceVisibility;
      work_order_line_id?: string | null;
    } = {};
    if (requestedVisibility) update.visibility = requestedVisibility;

    if ("workOrderLineId" in body) {
      const requestedLineId =
        typeof body.workOrderLineId === "string" && body.workOrderLineId
          ? body.workOrderLineId
          : null;
      if (requestedLineId) {
        const { data: line } = await admin
          .from("work_order_lines")
          .select("id")
          .eq("id", requestedLineId)
          .eq("shop_id", actor.shopId)
          .eq("work_order_id", actor.workOrderId)
          .maybeSingle();
        if (!line?.id) {
          return NextResponse.json({ error: "Target job not found" }, { status: 400 });
        }
      }
      update.work_order_line_id = requestedLineId;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "No media changes supplied" }, { status: 400 });
    }

    const { error } = await admin
      .from("work_order_media")
      .update(update)
      .eq("id", mediaId)
      .eq("shop_id", actor.shopId)
      .eq("work_order_id", actor.workOrderId);
    if (error) {
      return NextResponse.json(
        { error: "Unable to update evidence" },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unsupported media action" }, { status: 400 });
}
