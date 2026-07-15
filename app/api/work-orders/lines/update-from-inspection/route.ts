import "server-only";

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Retired compatibility endpoint.
 *
 * Inspection findings now enter the work-order lifecycle through the atomic
 * inspection-to-quote import or the portal request-line command. Directly
 * updating canonical labor, approval state, and pricing from an inspection
 * client bypassed those transaction boundaries.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: "Legacy inspection line mutation has been retired.",
      code: "LEGACY_INSPECTION_LINE_ROUTE_RETIRED",
      canonicalFlows: {
        inspectionImport: "/api/work-orders/quotes/add",
        inspectionProgress: "/api/inspections/save",
        portalRequestLine: "/api/portal/request/add-inspection-line",
      },
    },
    {
      status: 410,
      headers: {
        Deprecation: "true",
        Sunset: "Wed, 15 Jul 2026 00:00:00 GMT",
      },
    },
  );
}
