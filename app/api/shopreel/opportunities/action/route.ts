import { NextRequest, NextResponse } from "next/server";
import { getOwnerShopContext } from "@/features/integrations/shopreel/server/getOwnerShopContext";
import {
  SHOPREEL_OPPORTUNITY_ACTIONS,
  type ShopReelOpportunityAction,
  type ShopReelOpportunityStatus,
} from "@/features/integrations/shopreel/types";

const ACTION_SET = new Set<string>(SHOPREEL_OPPORTUNITY_ACTIONS);

function statusFromAction(action: ShopReelOpportunityAction): ShopReelOpportunityStatus {
  if (action === "accepted") return "accepted";
  if (action === "dismissed") return "dismissed";
  return "generated";
}

export async function POST(request: NextRequest) {
  const context = await getOwnerShopContext();

  if ("error" in context) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const { supabase, user, shopId } = context;
  const scopedSupabase = supabase as unknown as {
    from: (table: string) => ReturnType<typeof supabase.from>
  };
  const body = await request.json().catch(() => ({}));

  const opportunityId = typeof body?.opportunityId === "string" ? body.opportunityId : "";
  const action = typeof body?.action === "string" ? body.action : "";

  if (!opportunityId || !ACTION_SET.has(action)) {
    return NextResponse.json({ error: "opportunityId and a valid action are required." }, { status: 400 });
  }

  const nextStatus = statusFromAction(action as ShopReelOpportunityAction);

  const { data: opportunity, error: fetchError } = await scopedSupabase
    .from("shopreel_opportunities")
    .select("id, status")
    .eq("id", opportunityId)
    .eq("shop_id", shopId)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (!opportunity?.id) {
    return NextResponse.json({ error: "Opportunity not found." }, { status: 404 });
  }

  const now = new Date().toISOString();

  const statusPatch: Record<string, string | null> = {
    status: nextStatus,
    acted_by: user.id,
    updated_at: now,
  };

  if (nextStatus === "accepted") statusPatch.accepted_at = now;
  if (nextStatus === "dismissed") statusPatch.dismissed_at = now;
  if (nextStatus === "generated") statusPatch.generated_at = now;

  const { error: updateError } = await scopedSupabase
    .from("shopreel_opportunities")
    .update(statusPatch)
    .eq("id", opportunityId)
    .eq("shop_id", shopId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const { error: historyError } = await scopedSupabase.from("shopreel_opportunity_status_history").insert({
    shop_id: shopId,
    opportunity_id: opportunityId,
    previous_status: opportunity.status,
    next_status: nextStatus,
    action,
    changed_by: user.id,
  });

  if (historyError) {
    return NextResponse.json({ error: historyError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, opportunityId, status: nextStatus });
}
