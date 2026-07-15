import "server-only";

import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Retired compatibility endpoint.
 *
 * This route previously converted AI suggestions directly into canonical labor,
 * parts, pricing, and work-order-line state. That bypassed inspection import,
 * quote review, technician truth, parts lifecycle, and financial locks.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: "Legacy AI work-order line creation has been retired.",
      code: "LEGACY_AI_LINE_ROUTE_RETIRED",
      canonicalFlows: {
        aiSuggestions: "/api/work-orders/add-suggested-lines",
        inspectionImport: "/api/work-orders/quotes/add",
        portalRequestLine: "/api/portal/request/add-custom-line",
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
