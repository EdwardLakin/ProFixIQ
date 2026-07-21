import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import type { Json } from "@shared/types/types/supabase";
import type { InspectionSession } from "@/features/inspections/lib/inspection/types";

type InspectionRow = {
  id: string;
  work_order_id: string | null;
  work_order_line_id: string | null;
  summary: Json | null;
  locked: boolean | null;
  completed: boolean | null;
  is_draft: boolean | null;
  status: string | null;
  finalized_at: string | null;
  finalized_by: string | null;
  reopened_at: string | null;
  reopened_by: string | null;
  reopen_reason: string | null;
  updated_at: string | null;
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

export async function GET(req: NextRequest) {
  const supabase = createServerSupabaseRoute();
  const inspectionId = asString(req.nextUrl.searchParams.get("inspectionId"));
  const workOrderLineId = asString(
    req.nextUrl.searchParams.get("workOrderLineId"),
  );

  if (!inspectionId && !workOrderLineId) {
    return NextResponse.json(
      { error: "Missing inspectionId or workOrderLineId" },
      { status: 400 },
    );
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("shop_id")
    .eq("id", user.id)
    .maybeSingle<{ shop_id: string | null }>();

  const shopId = profile?.shop_id ?? null;
  if (profileError || !shopId) {
    return NextResponse.json(
      { error: "Unable to resolve actor shop." },
      { status: 403 },
    );
  }

  if (workOrderLineId) {
    const { data: line, error: lineError } = await supabase
      .from("work_order_lines")
      .select("id")
      .eq("id", workOrderLineId)
      .eq("shop_id", shopId)
      .maybeSingle<{ id: string }>();

    if (lineError) {
      return NextResponse.json({ error: lineError.message }, { status: 500 });
    }
    if (!line) {
      return NextResponse.json(
        { error: "Work-order line was not found for this shop." },
        { status: 404 },
      );
    }
  }

  const selectColumns =
    "id, work_order_id, work_order_line_id, summary, locked, completed, is_draft, status, finalized_at, finalized_by, reopened_at, reopened_by, reopen_reason, updated_at";

  let inspectionRow: InspectionRow | null = null;

  // A work-order line is the canonical identity across devices. Device-local
  // inspection UUIDs are only a fallback for legacy standalone inspections.
  if (workOrderLineId) {
    const { data, error } = await supabase
      .from("inspections")
      .select(selectColumns)
      .eq("shop_id", shopId)
      .eq("work_order_line_id", workOrderLineId)
      .order("updated_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle<InspectionRow>();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    inspectionRow = data;
  }

  // When a line is supplied it remains authoritative. Falling back to an
  // unrelated same-shop UUID can hydrate one job with another job's snapshot.
  if (!inspectionRow && inspectionId && !workOrderLineId) {
    const { data, error } = await supabase
      .from("inspections")
      .select(selectColumns)
      .eq("shop_id", shopId)
      .eq("id", inspectionId)
      .limit(1)
      .maybeSingle<InspectionRow>();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    inspectionRow = data;
  }

  const resolvedWorkOrderLineId =
    inspectionRow?.work_order_line_id ?? workOrderLineId ?? null;

  let session =
    (inspectionRow?.summary as unknown as InspectionSession | null) ?? null;

  if (!session && resolvedWorkOrderLineId) {
    const { data: sessionRow, error: sessionError } = await supabase
      .from("inspection_sessions")
      .select("state")
      .eq("work_order_line_id", resolvedWorkOrderLineId)
      .order("updated_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle<{ state: Json | null }>();

    if (sessionError) {
      return NextResponse.json(
        { error: sessionError.message },
        { status: 500 },
      );
    }

    session =
      (sessionRow?.state as unknown as InspectionSession | null) ?? null;
  }

  if (!session) {
    return NextResponse.json({
      session: null,
      inspectionMeta: inspectionRow
        ? {
            locked: Boolean(inspectionRow.locked),
            completed: Boolean(inspectionRow.completed),
            isDraft: Boolean(inspectionRow.is_draft),
            status: inspectionRow.status,
            finalizedAt: inspectionRow.finalized_at,
            finalizedBy: inspectionRow.finalized_by,
            reopenedAt: inspectionRow.reopened_at,
            reopenedBy: inspectionRow.reopened_by,
            reopenReason: inspectionRow.reopen_reason,
            updatedAt: inspectionRow.updated_at,
          }
        : null,
    });
  }

  const hydratedSession: InspectionSession = {
    ...session,
    id: inspectionRow?.id ?? session.id ?? inspectionId ?? "",
    workOrderId: inspectionRow?.work_order_id ?? session.workOrderId ?? null,
    workOrderLineId: resolvedWorkOrderLineId ?? session.workOrderLineId ?? null,
  };

  return NextResponse.json({
    session: hydratedSession,
    inspectionId: hydratedSession.id ?? null,
    workOrderId: hydratedSession.workOrderId ?? null,
    workOrderLineId: hydratedSession.workOrderLineId ?? null,
    inspectionMeta: {
      locked: Boolean(inspectionRow?.locked),
      completed: Boolean(inspectionRow?.completed),
      isDraft: Boolean(inspectionRow?.is_draft),
      status: inspectionRow?.status ?? null,
      finalizedAt: inspectionRow?.finalized_at ?? null,
      finalizedBy: inspectionRow?.finalized_by ?? null,
      reopenedAt: inspectionRow?.reopened_at ?? null,
      reopenedBy: inspectionRow?.reopened_by ?? null,
      reopenReason: inspectionRow?.reopen_reason ?? null,
      updatedAt: inspectionRow?.updated_at ?? null,
    },
  });
}
