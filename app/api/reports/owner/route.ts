import { NextResponse } from "next/server";

import { buildOwnerIntelligenceReport } from "@/features/owner/reports/server/buildOwnerIntelligenceReport";
import type { OwnerReportRange } from "@/features/owner/reports/ownerIntelligenceTypes";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

const REPORT_RANGES = new Set<OwnerReportRange>([
  "weekly",
  "monthly",
  "quarterly",
  "yearly",
]);

function reportRange(value: string | null): OwnerReportRange | null {
  if (!value || !REPORT_RANGES.has(value as OwnerReportRange)) return null;
  return value as OwnerReportRange;
}

export async function GET(request: Request) {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canViewFinancials",
    allowRoles: ["owner", "admin", "manager"],
  });
  if (!access.ok) return access.response;

  const range = reportRange(new URL(request.url).searchParams.get("range") ?? "monthly");
  if (!range) {
    return NextResponse.json({ error: "Invalid report range" }, { status: 400 });
  }

  try {
    const report = await buildOwnerIntelligenceReport({
      supabase: access.supabase,
      shopId: access.profile.shop_id,
      range,
    });
    return NextResponse.json(report, {
      headers: {
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Unable to build owner report";
    // eslint-disable-next-line no-console
    console.error("[owner-report] Failed to build report:", message);
    return NextResponse.json(
      { error: "Unable to build the owner report" },
      { status: 500 },
    );
  }
}
