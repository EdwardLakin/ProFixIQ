// app/api/internal/shop-boost/run/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import {
  ensureRun,
  markRunRunning,
  seedRunJobs,
} from "@/features/integrations/shopBoost/orchestrator";
import { executeShopBoostRun } from "@/features/integrations/shopBoost/orchestrator/executeRun";

const SHOP_BOOST_SECRET = process.env.SHOP_BOOST_SECRET ?? "";

type RunBody = {
  shopId?: string;
  intakeId?: string;
  runImport?: boolean;
};

export async function POST(req: NextRequest) {
  if (!SHOP_BOOST_SECRET) {
    return NextResponse.json({ ok: false, error: "SHOP_BOOST_SECRET not configured" }, { status: 500 });
  }

  const headerSecret = req.headers.get("x-shop-boost-secret") ?? req.headers.get("X-Shop-Boost-Secret");

  if (!headerSecret || headerSecret !== SHOP_BOOST_SECRET) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as RunBody | null;

  if (!body?.shopId) {
    return NextResponse.json({ ok: false, error: "shopId is required" }, { status: 400 });
  }

  const admin = createAdminSupabase();
  const intakeRes = body.intakeId
    ? await admin.from("shop_boost_intakes").select("id").eq("shop_id", body.shopId).eq("id", body.intakeId).maybeSingle<{ id: string }>()
    : await admin
        .from("shop_boost_intakes")
        .select("id")
        .eq("shop_id", body.shopId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ id: string }>();

  if (intakeRes.error) return NextResponse.json({ ok: false, error: intakeRes.error.message }, { status: 500 });
  if (!intakeRes.data?.id) return NextResponse.json({ ok: false, error: "No intake found" }, { status: 404 });

  const intakeId = intakeRes.data.id;
  const run = await ensureRun({ shopId: body.shopId, intakeId, triggerSource: "cron" });
  if (!run?.id) return NextResponse.json({ ok: false, error: "Failed to initialize run" }, { status: 500 });

  await seedRunJobs({ runId: run.id, shopId: body.shopId, intakeId });
  await markRunRunning(run.id, "profiling");

  const allowImport = body.runImport === true;
  const execution = await executeShopBoostRun({
    runId: run.id,
    shopId: body.shopId,
    intakeId,
    maxPasses: 12,
    workerPrefix: "internal-shop-boost",
    allowImport,
  });

  if (execution.errors.length > 0) {
    return NextResponse.json({ ok: false, error: execution.errors[0] }, { status: 500 });
  }

  return NextResponse.json(
    {
      ok: true,
      intakeId,
      runId: run.id,
      completionState: execution.latestImportSummary?.completionState ?? null,
    },
    { status: 200 },
  );
}
