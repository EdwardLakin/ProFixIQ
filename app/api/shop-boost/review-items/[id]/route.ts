import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { resolveAndMaterializeReviewItem } from "@/features/integrations/shopBoost/reviewMaterialization";

type DB = Database;

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
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
    resolution_action?: "linked_to_existing" | "created_new" | "ignored";
    confirm_high_risk_action?: boolean;
    ignore_reason_code?:
      | "duplicate"
      | "obsolete"
      | "invalid"
      | "test_data"
      | "intentionally_skipped"
      | "unsupported_format"
      | "other";
    ignore_note?: string | null;
  };

  const result = await resolveAndMaterializeReviewItem({
    reviewItemId: params.id,
    shopId: profile.shop_id,
    userId: user.id,
    resolutionAction: body.resolution_action ?? "ignored",
    confirmHighRiskAction: body.confirm_high_risk_action === true,
    ignoreReasonCode: body.ignore_reason_code,
    ignoreNote: body.ignore_note,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error ?? "Materialization failed.", item: result.item }, { status: 500 });
  }

  return NextResponse.json({ ok: true, item: result.item, materializedRecord: result.materializedRecord });
}
