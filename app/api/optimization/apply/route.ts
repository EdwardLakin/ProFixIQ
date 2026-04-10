import { NextResponse } from "next/server";
import type { Database } from "@shared/types/types/supabase";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import type { OptimizationActionType, OptimizationApplyPayload } from "@/features/optimization/types";

type DB = Database;

type ApplyBody = {
  opportunityId?: string;
  type?: OptimizationActionType;
  payload?: OptimizationApplyPayload;
};

const TYPE_MAP: Record<string, OptimizationActionType> = {
  pricing_normalization: "pricing",
  inspection_coverage_gap: "inspection",
  missed_revenue: "revenue",
};

function isActionType(value: unknown): value is OptimizationActionType {
  return value === "pricing" || value === "inspection" || value === "revenue";
}

function normalizeType(value: unknown): OptimizationActionType | null {
  if (typeof value !== "string") return null;
  if (isActionType(value)) return value;
  return TYPE_MAP[value] ?? null;
}

function parsePrice(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  return v.length > 0 ? v : null;
}

function safePayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
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

  const body = (await req.json().catch(() => null)) as ApplyBody | null;
  const opportunityId = toNonEmptyString(body?.opportunityId);
  const type = normalizeType(body?.type);
  const payload = safePayload(body?.payload);

  if (!opportunityId || !type) {
    return NextResponse.json({ error: "opportunityId and type are required" }, { status: 400 });
  }

  try {
    if (type === "pricing") {
      const menuItemId = toNonEmptyString(payload.menuItemId);
      const newPrice = parsePrice(payload.newPrice);

      if (!menuItemId || newPrice === null) {
        return NextResponse.json(
          { error: "pricing apply requires payload.menuItemId and payload.newPrice" },
          { status: 400 },
        );
      }

      const { error: updateError } = await supabase
        .from("menu_items")
        .update({ total_price: newPrice })
        .eq("id", menuItemId)
        .eq("shop_id", profile.shop_id);

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }
    }

    if (type === "inspection") {
      const templateRaw = safePayload(payload.inspectionTemplate);
      const templateId = toNonEmptyString(templateRaw.templateId);
      const templateName =
        toNonEmptyString(templateRaw.templateName) ||
        toNonEmptyString(templateRaw.name) ||
        "Optimization Inspection Template";

      const sections =
        templateRaw.sections && typeof templateRaw.sections === "object"
          ? (templateRaw.sections as DB["public"]["Tables"]["inspection_templates"]["Insert"]["sections"])
          : ({
              generated: {
                title: "Generated from optimization suggestion",
                items: Array.isArray(templateRaw.items) ? templateRaw.items : [],
              },
            } as DB["public"]["Tables"]["inspection_templates"]["Insert"]["sections"]);

      if (templateId) {
        const { error: updateError } = await supabase
          .from("inspection_templates")
          .update({
            template_name: templateName,
            sections,
            updated_at: new Date().toISOString(),
          })
          .eq("id", templateId)
          .eq("shop_id", profile.shop_id);

        if (updateError) {
          return NextResponse.json({ error: updateError.message }, { status: 500 });
        }
      } else {
        const insert: DB["public"]["Tables"]["inspection_templates"]["Insert"] = {
          shop_id: profile.shop_id,
          user_id: user.id,
          template_name: templateName,
          sections,
          description: toNonEmptyString(templateRaw.description),
          tags: ["optimization_engine"],
        };

        const { error: insertError } = await supabase.from("inspection_templates").insert(insert);
        if (insertError) {
          return NextResponse.json({ error: insertError.message }, { status: 500 });
        }
      }
    }

    if (type === "revenue") {
      const suggestionRaw = safePayload(payload.suggestionData);
      const title =
        toNonEmptyString(suggestionRaw.title) ||
        toNonEmptyString(suggestionRaw.suggestedService) ||
        "Optimization Revenue Suggestion";

      const insert: DB["public"]["Tables"]["menu_item_suggestions"]["Insert"] = {
        shop_id: profile.shop_id,
        title,
        reason:
          toNonEmptyString(suggestionRaw.reason) ||
          toNonEmptyString(suggestionRaw.summary) ||
          "Created from optimization engine recommendation",
        confidence: (() => {
          const c = Number(suggestionRaw.confidence);
          return Number.isFinite(c) ? Math.max(0, Math.min(1, c)) : 0.7;
        })(),
        category: toNonEmptyString(suggestionRaw.category),
        labor_hours_suggestion: (() => {
          const h = Number(suggestionRaw.laborHours);
          return Number.isFinite(h) ? h : null;
        })(),
        price_suggestion: (() => {
          const p = Number(suggestionRaw.priceSuggestion);
          return Number.isFinite(p) ? p : null;
        })(),
      };

      const { error: insertError } = await supabase.from("menu_item_suggestions").insert(insert);
      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }
    }

    const actionInsert: DB["public"]["Tables"]["optimization_actions"]["Insert"] = {
      shop_id: profile.shop_id,
      opportunity_id: opportunityId,
      type,
      action: "applied",
      payload: {
        originalPayload: payload as unknown,
      } as DB["public"]["Tables"]["optimization_actions"]["Insert"]["payload"],
      created_by: user.id,
    };

    const { error: actionError } = await supabase.from("optimization_actions").insert(actionInsert);
    if (actionError) {
      return NextResponse.json({ error: actionError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to apply optimization action";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
