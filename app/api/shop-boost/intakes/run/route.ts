// app/api/shop-boost/intakes/run/route.ts
import { NextRequest, NextResponse } from "next/server";
import { runShopBoostIntake, type ShopBoostRunResp } from "@/features/integrations/shopBoost/runIntakeHandler";

export async function POST(req: NextRequest): Promise<NextResponse<ShopBoostRunResp>> {
  try {
    const result = await runShopBoostIntake(req, {
      allowHistoryAndStaff: true,
      runImport: false,
      deferProcessing: true,
      allowProvidedPaths: true,
    });

    const status = result.ok ? 202 : result.error === "Unauthorized" ? 401 : result.error.includes("Invalid") ? 400 : 500;

    return NextResponse.json(result, { status });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    console.error("[shop-boost/intakes/run]", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
