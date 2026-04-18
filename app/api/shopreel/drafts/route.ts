import { NextRequest, NextResponse } from "next/server";
import { getOwnerShopContext } from "@/features/integrations/shopreel/server/getOwnerShopContext";

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

  if (!opportunityId) {
    return NextResponse.json({ error: "opportunityId is required." }, { status: 400 });
  }

  const { data: opportunity, error: opportunityError } = await scopedSupabase
    .from("shopreel_opportunities")
    .select("id, title, angle, summary, status")
    .eq("id", opportunityId)
    .eq("shop_id", shopId)
    .maybeSingle();

  if (opportunityError) {
    return NextResponse.json({ error: opportunityError.message }, { status: 500 });
  }

  if (!opportunity?.id) {
    return NextResponse.json({ error: "Opportunity not found." }, { status: 404 });
  }

  if (opportunity.status !== "accepted" && opportunity.status !== "generated") {
    return NextResponse.json({ error: "Only accepted opportunities can generate drafts." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { data: draft, error: draftError } = await scopedSupabase
    .from("shopreel_drafts")
    .upsert(
      {
        shop_id: shopId,
        opportunity_id: opportunityId,
        title: opportunity.title,
        angle: opportunity.angle,
        script: opportunity.summary,
        status: "draft",
        created_by: user.id,
        updated_by: user.id,
        updated_at: now,
      },
      { onConflict: "opportunity_id" },
    )
    .select("id")
    .single();

  if (draftError || !draft?.id) {
    return NextResponse.json({ error: draftError?.message ?? "Failed to create draft." }, { status: 500 });
  }

  await scopedSupabase
    .from("shopreel_opportunities")
    .update({
      status: "generated",
      generated_at: now,
      updated_at: now,
      acted_by: user.id,
    })
    .eq("id", opportunityId)
    .eq("shop_id", shopId);

  await scopedSupabase.from("shopreel_opportunity_status_history").insert({
    shop_id: shopId,
    opportunity_id: opportunityId,
    previous_status: opportunity.status,
    next_status: "generated",
    action: "generated",
    changed_by: user.id,
  });

  return NextResponse.json({ ok: true, draftId: draft.id });
}
