import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import type { Json } from "@shared/types/types/supabase";
import type { InspectionSession } from "@/features/inspections/lib/inspection/types";


function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

export async function GET(req: NextRequest) {
  const supabase = createServerSupabaseRoute();

  const inspectionId = asString(req.nextUrl.searchParams.get("inspectionId"));
  const workOrderLineId = asString(req.nextUrl.searchParams.get("workOrderLineId"));

  if (!inspectionId && !workOrderLineId) {
    return NextResponse.json(
      { error: "Missing inspectionId or workOrderLineId" },
      { status: 400 },
    );
  }

  let inspectionRow:
    | {
        id: string;
        work_order_id: string | null;
        work_order_line_id: string | null;
        summary: Json | null;
        locked: boolean | null;
        finalized_at: string | null;
        finalized_by: string | null;
      }
    | null = null;

  if (inspectionId) {
    const { data, error } = await supabase
      .from("inspections")
      .select("id, work_order_id, work_order_line_id, summary, locked, finalized_at, finalized_by")
      .eq("id", inspectionId)
      .order("updated_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    inspectionRow = data;
  } else if (workOrderLineId) {
    const { data, error } = await supabase
      .from("inspections")
      .select("id, work_order_id, work_order_line_id, summary, locked, finalized_at, finalized_by")
      .eq("work_order_line_id", workOrderLineId)
      .order("updated_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

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
    const { data: sessionRow, error: sessionErr } = await supabase
      .from("inspection_sessions")
      .select("state")
      .eq("work_order_line_id", resolvedWorkOrderLineId)
      .order("updated_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (sessionErr) {
      return NextResponse.json({ error: sessionErr.message }, { status: 500 });
    }

    session =
      (sessionRow?.state as unknown as InspectionSession | null) ?? null;
  }

  if (!session) {
    return NextResponse.json({ session: null }, { status: 200 });
  }

  const hydratedSession = {
    ...session,
    id: inspectionRow?.id ?? session.id ?? inspectionId ?? "",
    workOrderId:
      inspectionRow?.work_order_id ??
      (session as InspectionSession & { workOrderId?: string | null }).workOrderId ??
      null,
    workOrderLineId:
      resolvedWorkOrderLineId ??
      ((session as InspectionSession & { workOrderLineId?: string | null })
        .workOrderLineId ?? null),
  };

  return NextResponse.json({
    session: hydratedSession,
    inspectionId: hydratedSession.id ?? null,
    workOrderId: hydratedSession.workOrderId ?? null,
    workOrderLineId: hydratedSession.workOrderLineId ?? null,
    inspectionMeta: {
      locked: Boolean(inspectionRow?.locked),
      finalizedAt: inspectionRow?.finalized_at ?? null,
      finalizedBy: inspectionRow?.finalized_by ?? null,
      reopenedAt: null,
      reopenedBy: null,
      reopenReason: null,
    },
  });
}
