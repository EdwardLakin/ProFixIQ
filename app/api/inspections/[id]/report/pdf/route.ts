import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { createAdminClient } from "@/features/integrations/shopreel/server/createAdminClient";
import { getInspectionReportForActor } from "@/features/inspections/server/inspectionReportAccess";

export const runtime = "nodejs";

function isExpectedStoragePath(args: {
  path: string;
  shopId: string;
  workOrderId: string;
  inspectionId: string;
}): boolean {
  const prefix = `shops/${args.shopId}/work_orders/${args.workOrderId}/inspections/${args.inspectionId}/`;
  return (
    args.path.startsWith(prefix) &&
    args.path.endsWith(".pdf") &&
    !args.path.includes("..") &&
    !args.path.includes("//")
  );
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServerSupabaseRoute();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const record = await getInspectionReportForActor({
    actorUserId: user.id,
    inspectionId: id,
    includeEvidencePhotos: false,
  });
  if (
    !record ||
    !isExpectedStoragePath({
      path: record.storagePath,
      shopId: record.shopId,
      workOrderId: record.workOrderId,
      inspectionId: record.inspectionId,
    })
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const admin = createAdminClient();
  const { data, error: signedError } = await admin.storage
    .from(record.storageBucket)
    .createSignedUrl(record.storagePath, 60 * 10);
  if (signedError || !data?.signedUrl) {
    return NextResponse.json(
      { error: signedError?.message ?? "Unable to open report" },
      { status: 500 },
    );
  }

  return NextResponse.redirect(data.signedUrl);
}
