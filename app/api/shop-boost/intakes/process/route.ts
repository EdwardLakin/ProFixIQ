import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { buildShopBoostProfile } from "@/features/integrations/ai/shopBoost";
import { runShopBoostImport } from "@/features/integrations/imports/runFullImport";
import { updateIntakeProgress } from "@/features/integrations/shopBoost/status";

type DB = Database;

export async function POST(req: NextRequest) {
  const supabaseUser = createRouteHandlerClient<DB>({ cookies });
  const {
    data: { user },
    error: authErr,
  } = await supabaseUser.auth.getUser();

  if (authErr || !user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabaseUser
    .from("profiles")
    .select("shop_id")
    .eq("id", user.id)
    .maybeSingle<{ shop_id: string | null }>();

  const shopId = profile?.shop_id;
  if (!shopId) {
    return NextResponse.json({ ok: false, error: "No shop linked." }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as { intakeId?: string };
  const admin = createAdminSupabase();

  const query = admin
    .from("shop_boost_intakes")
    .select("id,status")
    .eq("shop_id", shopId)
    .order("created_at", { ascending: false })
    .limit(1);

  const intakeRes = body.intakeId
    ? await admin.from("shop_boost_intakes").select("id,status").eq("shop_id", shopId).eq("id", body.intakeId).maybeSingle()
    : await query.maybeSingle();

  if (intakeRes.error) return NextResponse.json({ ok: false, error: intakeRes.error.message }, { status: 500 });
  const intake = intakeRes.data;
  if (!intake?.id) return NextResponse.json({ ok: false, error: "No intake found." }, { status: 404 });

  if (intake.status === "processing") {
    return NextResponse.json({ ok: true, intakeId: intake.id, alreadyRunning: true });
  }

  await updateIntakeProgress({
    intakeId: intake.id,
    status: "processing",
    currentStep: "parsing_files",
    progressPercent: 15,
    patch: { startedAt: new Date().toISOString(), lastError: null },
  });

  const errors: string[] = [];

  try {
    await updateIntakeProgress({ intakeId: intake.id, currentStep: "generating_suggestions", progressPercent: 35 });
    const snapshot = await buildShopBoostProfile({ shopId, intakeId: intake.id });
    if (!snapshot) errors.push("AI snapshot generation failed; import continued.");

    await updateIntakeProgress({ intakeId: intake.id, currentStep: "materializing_operating_layer", progressPercent: 60 });
    const importSummary = await runShopBoostImport({ shopId, intakeId: intake.id, options: { createStaffUsers: false } });

    await updateIntakeProgress({
      intakeId: intake.id,
      status: errors.length > 0 ? "completed_with_errors" : "completed",
      currentStep: "completed",
      progressPercent: 100,
      patch: {
        completedAt: new Date().toISOString(),
        failedAt: null,
        lastError: errors.join(" ") || null,
        resultSummary: {
          customersImported: importSummary.customersImported,
          vehiclesImported: importSummary.vehiclesImported,
          partsImported: importSummary.partsImported,
          workOrdersImported: importSummary.workOrdersImported,
          invoicesImported: importSummary.invoicesImported,
          linkageSummary: importSummary.linkageSummary,
          shopBuildSummary: importSummary.shopBuildSummary,
          partsPipeline: importSummary.partsPipeline ?? null,
        },
      },
    });

    return NextResponse.json({ ok: true, intakeId: intake.id, status: errors.length > 0 ? "completed_with_errors" : "completed" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to process intake";
    await updateIntakeProgress({
      intakeId: intake.id,
      status: "failed",
      currentStep: "error",
      patch: {
        failedAt: new Date().toISOString(),
        lastError: msg,
      },
    });
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
