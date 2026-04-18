import { NextRequest, NextResponse } from "next/server";
import { getOwnerShopContext } from "@/features/integrations/shopreel/server/getOwnerShopContext";
import { SHOPREEL_DRAFT_STATUSES } from "@/features/integrations/shopreel/types";

const STATUS_SET = new Set<string>(SHOPREEL_DRAFT_STATUSES);

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const context = await getOwnerShopContext();

  if ("error" in context) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const { supabase, user, shopId } = context;
  const scopedSupabase = supabase as unknown as {
    from: (table: string) => ReturnType<typeof supabase.from>
  };
  const body = await request.json().catch(() => ({}));

  const patch: Record<string, string | null> = {
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  };

  if (typeof body?.title === "string") patch.title = body.title.trim();
  if (typeof body?.angle === "string") patch.angle = body.angle.trim();
  if (typeof body?.script === "string") patch.script = body.script;

  if (typeof body?.status === "string") {
    if (!STATUS_SET.has(body.status)) {
      return NextResponse.json({ error: "Invalid draft status." }, { status: 400 });
    }

    patch.status = body.status;

    if (body.status === "approved" || body.status === "in_review") {
      patch.reviewed_by = user.id;
      patch.reviewed_at = new Date().toISOString();
    }
  }

  const { error } = await scopedSupabase
    .from("shopreel_drafts")
    .update(patch)
    .eq("id", params.id)
    .eq("shop_id", shopId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
