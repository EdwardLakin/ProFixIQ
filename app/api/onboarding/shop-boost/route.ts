// app/api/onboarding/shop-boost/route.ts
import { NextRequest, NextResponse } from "next/server";
import { runShopBoostIntake, type ShopBoostRunResp } from "@/features/integrations/shopBoost/runIntakeHandler";

export async function POST(req: NextRequest): Promise<NextResponse<ShopBoostRunResp>> {
  try {
    const result = await runShopBoostIntake(req, {
      allowHistoryAndStaff: false,
      runImport: false, // ✅ onboarding should not auto-import unless you want it
      allowProvidedPaths: false, // ✅ keep onboarding simpler/safer
    });

    const status =
      result.ok ? 200 : result.error === "Unauthorized" ? 401 : result.error.includes("Invalid") ? 400 : 500;

    return NextResponse.json(result, { status });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    console.error("[onboarding/shop-boost]", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}