import "server-only";

export const runtime = "nodejs";

import { NextResponse, type NextRequest } from "next/server";

/**
 * COMPAT ROUTE:
 * Old route accepted { summary: InspectionSession } and returned raw bytes.
 * We now standardize on finalize/pdf which takes { workOrderLineId } and persists to DB + storage.
 *
 * Keep this to avoid breaking callers; update callers to use /api/inspections/finalize/pdf.
 */
export async function POST(_req: NextRequest) {
  return NextResponse.json(
    {
      error:
        "This endpoint has moved. Use POST /api/inspections/finalize/pdf with { workOrderLineId }.",
    },
    { status: 410 },
  );
}
