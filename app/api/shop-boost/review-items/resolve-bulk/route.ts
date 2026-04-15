import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

import type { Database } from "@shared/types/types/supabase";
import { applyHighConfidenceRecommendations, bulkResolveReviewItems } from "@/features/integrations/shopBoost/reviewMaterialization";

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
    review_item_ids?: string[];
    resolution_action?: "linked_to_existing" | "created_new" | "ignored";
    ignore_reason_code?:
      | "duplicate"
      | "obsolete"
      | "invalid"
      | "test_data"
      | "intentionally_skipped"
      | "unsupported_format"
      | "other";
    ignore_note?: string | null;
    apply_suggested_high_confidence?: boolean;
    confidence_threshold?: number;
    intake_id?: string;
  };

  if (body.apply_suggested_high_confidence) {
    const results = await applyHighConfidenceRecommendations({
      shopId: profile.shop_id,
      userId: user.id,
      intakeId: body.intake_id,
      threshold: body.confidence_threshold,
    });

    return NextResponse.json({
      ok: results.every((result) => result.ok),
      mode: "high_confidence_suggestions",
      threshold: body.confidence_threshold ?? 0.85,
      results,
    });
  }

  const ids = Array.isArray(body.review_item_ids) ? body.review_item_ids.filter(Boolean) : [];
  if (ids.length === 0) return NextResponse.json({ ok: false, error: "No review items selected." }, { status: 400 });

  const results = await bulkResolveReviewItems({
    shopId: profile.shop_id,
    userId: user.id,
    reviewItemIds: ids,
    resolutionAction: body.resolution_action ?? "ignored",
    ignoreReasonCode: body.ignore_reason_code,
    ignoreNote: body.ignore_note,
  });

  return NextResponse.json({
    ok: results.every((result) => result.ok),
    mode: "manual_bulk",
    results,
  });
}
