import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import type { OptimizationActionType } from "@/features/optimization/types";

type UndoBody = {
  opportunityId?: string;
  type?: OptimizationActionType;
  affectedEntityIds?: Record<string, string>;
  undoData?: Record<string, unknown>;
};

function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  return v.length > 0 ? v : null;
}

export async function POST(req: Request) {
  const supabase = createServerSupabaseRoute();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("shop_id")
    .or(`id.eq.${user.id},user_id.eq.${user.id}`)
    .limit(1)
    .maybeSingle();

  if (profileError || !profile?.shop_id) {
    return NextResponse.json({ error: "Unable to resolve shop context" }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as UndoBody | null;
  const opportunityId = toNonEmptyString(body?.opportunityId);
  const type = body?.type;
  const affected = body?.affectedEntityIds ?? {};
  const undoData = body?.undoData ?? {};

  if (!opportunityId || (type !== "pricing" && type !== "inspection" && type !== "revenue")) {
    return NextResponse.json({ error: "opportunityId and type are required" }, { status: 400 });
  }

  if (type === "pricing") {
    const menuItemId = toNonEmptyString(affected.menuItemId);
    const pricingBefore = (undoData.pricingBefore ?? {}) as { totalPrice?: number | null; laborHours?: number | null };
    if (!menuItemId) return NextResponse.json({ error: "Missing menu item context" }, { status: 400 });

    const { error } = await supabase
      .from("menu_items")
      .update({
        total_price: pricingBefore.totalPrice ?? null,
        labor_hours: pricingBefore.laborHours ?? null,
      })
      .eq("id", menuItemId)
      .eq("shop_id", profile.shop_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (type === "inspection") {
    const templateId = toNonEmptyString(affected.inspectionTemplateId);
    const menuItemId = toNonEmptyString(affected.menuItemId);
    const inspectionUndo = (undoData.inspection ?? {}) as {
      createdTemplate?: boolean;
      previousTemplateSnapshot?: { template_name?: string | null; sections?: unknown; description?: string | null } | null;
    };

    if (inspectionUndo.createdTemplate && templateId) {
      const { error: deleteError } = await supabase
        .from("inspection_templates")
        .delete()
        .eq("id", templateId)
        .eq("shop_id", profile.shop_id);
      if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    if (!inspectionUndo.createdTemplate && templateId && inspectionUndo.previousTemplateSnapshot) {
      const snapshot = inspectionUndo.previousTemplateSnapshot;
      const { error: revertTemplateError } = await supabase
        .from("inspection_templates")
        .update({
          template_name: snapshot.template_name ?? "Optimization Inspection Template",
          sections: (snapshot.sections ?? {}) as Record<string, unknown>,
          description: snapshot.description ?? null,
        })
        .eq("id", templateId)
        .eq("shop_id", profile.shop_id);
      if (revertTemplateError) return NextResponse.json({ error: revertTemplateError.message }, { status: 500 });
    }

    if (menuItemId) {
      const previous = toNonEmptyString(undoData.previousMenuInspectionTemplateId) ?? null;
      const { error: revertLinkError } = await supabase
        .from("menu_items")
        .update({ inspection_template_id: previous })
        .eq("id", menuItemId)
        .eq("shop_id", profile.shop_id);
      if (revertLinkError) return NextResponse.json({ error: revertLinkError.message }, { status: 500 });
    }
  }

  if (type === "revenue") {
    const suggestionId = toNonEmptyString(affected.suggestionId);
    if (!suggestionId) return NextResponse.json({ error: "Missing suggestion context" }, { status: 400 });

    const { error } = await supabase
      .from("menu_item_suggestions")
      .delete()
      .eq("id", suggestionId)
      .eq("shop_id", profile.shop_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
