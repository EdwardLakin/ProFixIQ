import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { listInspectionReportsForActor } from "@/features/inspections/server/inspectionReportAccess";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const supabase = createServerSupabaseRoute();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workOrderId = req.nextUrl.searchParams.get("workOrderId");
  const vehicleId = req.nextUrl.searchParams.get("vehicleId");
  if (Boolean(workOrderId) === Boolean(vehicleId)) {
    return NextResponse.json(
      { error: "Provide exactly one workOrderId or vehicleId." },
      { status: 400 },
    );
  }

  const reports = await listInspectionReportsForActor({
    actorUserId: user.id,
    workOrderId,
    vehicleId,
  });
  if (!reports) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    reports: reports.map((record) => ({
      inspectionId: record.inspectionId,
      workOrderId: record.workOrderId,
      workOrderReference: record.workOrderReference,
      vehicleId: record.vehicleId,
      title: record.report.title,
      finalizedAt: record.finalizedAt,
      technicianName: record.technicianName,
      totals: record.report.totals,
      viewUrl: `/inspection-reports/${record.inspectionId}`,
      pdfUrl: `/api/inspections/${record.inspectionId}/report/pdf`,
    })),
  });
}
