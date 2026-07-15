import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Legacy compatibility endpoint.
 *
 * Parent work-order status is derived through canonical commands:
 * - technician line start/pause/resume/finish routes
 * - /api/work-orders/[id]/mark-ready
 * - invoice/payment lifecycle RPCs
 *
 * This endpoint previously bypassed labor segments, quote review, readiness,
 * financial locks, and parent rollups by directly updating work_orders.status.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: "Legacy work-order status mutation has been retired.",
      code: "LEGACY_STATUS_ROUTE_RETIRED",
      canonicalFlows: {
        technicianLabor: "/api/work-orders/lines/[lineId]/{start|pause|resume|finish}",
        readyToInvoice: "/api/work-orders/[id]/mark-ready",
        invoiceLifecycle: "/api/invoices/send",
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
