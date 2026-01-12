// app/api/shop-boost/intakes/run/route.ts
import { NextRequest, NextResponse } from "next/server";
import { runShopBoostIntake, type ShopBoostRunResp } from "@/features/integrations/shopBoost/runIntakeHandler";

export async function POST(req: NextRequest): Promise<NextResponse<ShopBoostRunResp>> {
  try {
    const result = await runShopBoostIntake(req, {
      allowHistoryAndStaff: true,
      runImport: true,        // ✅ canonical “engine” runs import
      allowProvidedPaths: true, // ✅ supports report-panel reruns with stored paths
    });

    const status =
      result.ok ? 200 : result.error === "Unauthorized" ? 401 : result.error.includes("Invalid") ? 400 : 500;

    return NextResponse.json(result, { status });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    console.error("[shop-boost/intakes/run]", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}