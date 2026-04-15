import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

import type { Database } from "@shared/types/types/supabase";
import { reprocessReviewItems } from "@/features/integrations/shopBoost/reviewMaterialization";

type DB = Database;

export async function POST(req: Request) {
  const supabaseUser = createRouteHandlerClient<DB>({ cookies });
  const {
    data: { user },
  } = await supabaseUser.auth.getUser();

  if (!user?.id) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabaseUser
    .from("profiles")
    .select("shop_id")
    .eq("id", user.id)
    .maybeSingle<{ shop_id: string | null }>();

  if (!profile?.shop_id) return NextResponse.json({ ok: false, error: "No shop linked." }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as {
    mode?: "failed" | "unresolved" | "updated_matches";
    intake_id?: string;
    reprocess_reason?: string;
  };

  const mode = body.mode ?? "unresolved";
  if (!["failed", "unresolved", "updated_matches"].includes(mode)) {
    return NextResponse.json({ ok: false, error: "Invalid mode." }, { status: 400 });
  }

  const outcome = await reprocessReviewItems({
    shopId: profile.shop_id,
    userId: user.id,
    intakeId: body.intake_id,
    mode,
    reprocessReason: body.reprocess_reason,
  });

  return NextResponse.json({
    ok: outcome.results.every((row) => row.ok),
    mode,
    reset_count: outcome.resetCount,
    results: outcome.results,
    message:
      mode === "failed"
        ? "Re-ran failed materialization items only. Already materialized rows were not changed."
        : mode === "updated_matches"
          ? "Re-ran unresolved items using latest matching guidance. Imported source files were not re-ingested."
          : "Re-ran unresolved review items. Existing successful records were left unchanged.",
  });
}
