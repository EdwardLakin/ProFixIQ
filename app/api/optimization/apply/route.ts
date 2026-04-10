import { NextResponse } from "next/server";
import type { Database } from "@shared/types/types/supabase";
import { buildExecutionPreview } from "@/features/optimization/server/buildExecutionPreview";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import type {
  OptimizationActionType,
  OptimizationApplyPayload,
  OptimizationOpportunity,
} from "@/features/optimization/types";

type DB = Database;

type ApplyBody = {
  opportunityId?: string;
  type?: OptimizationActionType;
  payload?: OptimizationApplyPayload;
  opportunity?: OptimizationOpportunity;
  preview?: {
    changes?: Array<{ label?: string; before?: unknown; after?: unknown }>;
  } | null;
};

const TYPE_MAP: Record<string, OptimizationActionType> = {
  pricing_normalization: "pricing",
  inspection_coverage_gap: "inspection",
  inspection_gap: "inspection",
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

function parsePositive(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

function parseRatio(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(1, n));
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

function nearlyEqual(a: number | null, b: number | null, tolerance = 0.01): boolean {
  if (a === null || b === null) return false;
  return Math.abs(a - b) <= tolerance;
}

function getJobsAnalyzed(opportunity: OptimizationOpportunity | null): number {
  if (!opportunity?.meta || typeof opportunity.meta !== "object") return 0;
  const meta = opportunity.meta as Record<string, unknown>;
  const n = Number(meta.jobsAnalyzed ?? meta.jobs ?? meta.sampleSize ?? 0);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function checkGuardrails(opportunity: OptimizationOpportunity | null): string | null {
  const confidence = opportunity ? parseRatio(opportunity.confidence) : null;
  if (confidence !== null && confidence < 0.6) {
    return "Blocked: confidence is below 0.60. Review additional data before applying.";
  }

  const jobs = getJobsAnalyzed(opportunity);
  if (jobs > 0 && jobs < 4) {
    return "Blocked: insufficient sample size to apply safely.";
  }

  return null;
}

export async function POST(req: Request) {
  const supabase = createServerSupabaseRoute();
  const dryRun = new URL(req.url).searchParams.get("dryRun") === "true";

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
  const opportunity = body?.opportunity ?? null;
  const previewChanges = Array.isArray(body?.preview?.changes) ? body?.preview?.changes ?? [] : [];

  if (!opportunityId || !type) {
    return NextResponse.json({ error: "opportunityId and type are required" }, { status: 400 });
  }

  const guardrailBlock = checkGuardrails(opportunity);
  if (guardrailBlock) {
    return NextResponse.json({ blocked: true, reason: guardrailBlock }, { status: 200 });
  }

  const previewSource: OptimizationOpportunity =
    opportunity ??
    ({
      id: opportunityId,
      type:
        type === "pricing"
          ? "pricing_normalization"
          : type === "inspection"
            ? "inspection_coverage_gap"
            : "missed_revenue",
      title: toNonEmptyString(payload.title) ?? "Optimization execution",
      summary: toNonEmptyString(payload.summary) ?? "Pending optimization execution",
      confidence: 0.7,
      impactLevel: "medium",
      priorityScore: 0.6,
      priorityBand: "medium",
      reasoning: [],
      sourceBasis: "Generated from optimization execution payload",
      targetRefs: {
        menuItemId: toNonEmptyString(payload.menuItemId) ?? undefined,
      },
      meta: {
        recommendedPrice: parsePositive(payload.newPrice),
        recommendedLaborHours: parsePositive(payload.newLaborHours),
      },
    } satisfies OptimizationOpportunity);

  const preview = buildExecutionPreview(previewSource);

  if (dryRun) {
    return NextResponse.json({ dryRun: true, preview, type });
  }

  try {
    let entityId: string | null = null;
    const affectedEntityIds: Record<string, string> = {};
    const undoData: Record<string, unknown> = {};

    const { data: priorApplied } = await supabase
      .from("optimization_actions")
      .select("id")
      .eq("shop_id", profile.shop_id)
      .eq("opportunity_id", opportunityId)
      .eq("action", "applied")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (priorApplied?.id) {
      return NextResponse.json({ blocked: true, reason: "This change is already applied" }, { status: 200 });
    }

    if (type === "pricing") {
      const menuItemId = toNonEmptyString(payload.menuItemId);
      const newPrice = parsePositive(payload.newPrice);
      const newLaborHours = parsePositive(payload.newLaborHours);

      if (!menuItemId || newPrice === null) {
        return NextResponse.json(
          { error: "pricing apply requires payload.menuItemId and payload.newPrice" },
          { status: 400 },
        );
      }

      const { data: existingMenu, error: existingMenuError } = await supabase
        .from("menu_items")
        .select("id,total_price,labor_hours")
        .eq("id", menuItemId)
        .eq("shop_id", profile.shop_id)
        .single();

      if (existingMenuError || !existingMenu) {
        return NextResponse.json({ error: "Menu item not found in shop context" }, { status: 404 });
      }

      const expectedCurrent = Number((opportunity?.meta as Record<string, unknown> | undefined)?.currentMenuPrice);
      const expectedLaborHours = Number((opportunity?.meta as Record<string, unknown> | undefined)?.currentLaborHours);
      const previewPriceBefore = previewChanges.find((change) =>
        String(change?.label ?? "").toLowerCase().includes("price"),
      )?.before;
      const previewBefore = Number(previewPriceBefore);

      const hasPricingConflict =
        (Number.isFinite(expectedCurrent) &&
          existingMenu.total_price !== null &&
          Math.abs(existingMenu.total_price - expectedCurrent) > 0.01) ||
        (Number.isFinite(previewBefore) &&
          existingMenu.total_price !== null &&
          Math.abs(existingMenu.total_price - previewBefore) > 0.01) ||
        (Number.isFinite(expectedLaborHours) &&
          existingMenu.labor_hours !== null &&
          Math.abs(existingMenu.labor_hours - expectedLaborHours) > 0.01);

      if (hasPricingConflict) {
        return NextResponse.json(
          { blocked: true, reason: "This item changed since preview. Refresh and try again." },
          { status: 200 },
        );
      }

      if (
        existingMenu.total_price !== null &&
        nearlyEqual(existingMenu.total_price, newPrice) &&
        (newLaborHours === null || existingMenu.labor_hours === null || nearlyEqual(existingMenu.labor_hours, newLaborHours))
      ) {
        return NextResponse.json({ blocked: true, reason: "This change is already applied" }, { status: 200 });
      }

      const updatePayload: DB["public"]["Tables"]["menu_items"]["Update"] = { total_price: newPrice };
      const canUpdateLaborHours =
        newLaborHours !== null &&
        (opportunity?.confidence ?? 0) >= 0.8 &&
        getJobsAnalyzed(opportunity) >= 8;

      if (canUpdateLaborHours) {
        updatePayload.labor_hours = newLaborHours;
      }

      const { error: updateError } = await supabase
        .from("menu_items")
        .update(updatePayload)
        .eq("id", menuItemId)
        .eq("shop_id", profile.shop_id);

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }

      entityId = menuItemId;
      affectedEntityIds.menuItemId = menuItemId;
      undoData.pricingBefore = {
        totalPrice: existingMenu.total_price,
        laborHours: existingMenu.labor_hours,
      };
    }

    if (type === "inspection") {
      const templateRaw = safePayload(payload.inspectionTemplate);
      const templateId = toNonEmptyString(templateRaw.templateId) ?? opportunity?.targetRefs?.inspectionTemplateId ?? null;
      const menuItemId = toNonEmptyString(payload.menuItemId) ?? opportunity?.targetRefs?.menuItemId ?? undefined;
      const templateName =
        toNonEmptyString(templateRaw.templateName) ||
        toNonEmptyString(templateRaw.name) ||
        opportunity?.title.replace(/^Inspection coverage gap:\s*/i, "").trim() ||
        "Optimization Inspection Template";

      const sections =
        templateRaw.sections && typeof templateRaw.sections === "object"
          ? (templateRaw.sections as DB["public"]["Tables"]["inspection_templates"]["Insert"]["sections"])
          : ({
              optimization_recommended: {
                title: "Generated from optimization suggestion",
                items: opportunity?.reasoning?.map((reason, idx) => ({ id: `reason_${idx + 1}`, label: reason })) ?? [],
              },
            } as DB["public"]["Tables"]["inspection_templates"]["Insert"]["sections"]);

      let resolvedTemplateId: string | null = templateId;
      let previousTemplateSnapshot: {
        template_name: string | null;
        sections: DB["public"]["Tables"]["inspection_templates"]["Row"]["sections"] | null;
        description: string | null;
      } | null = null;
      let createdTemplate = false;
      if (templateId) {
        const { data: existingTemplate, error: existingTemplateError } = await supabase
          .from("inspection_templates")
          .select("id,template_name,sections,description,updated_at")
          .eq("id", templateId)
          .eq("shop_id", profile.shop_id)
          .single();
        if (existingTemplateError || !existingTemplate) {
          return NextResponse.json({ error: "Inspection template not found in shop context" }, { status: 404 });
        }

        const expectedUpdatedAt = toNonEmptyString((opportunity?.meta as Record<string, unknown> | undefined)?.currentTemplateUpdatedAt);
        if (expectedUpdatedAt && existingTemplate.updated_at && existingTemplate.updated_at !== expectedUpdatedAt) {
          return NextResponse.json(
            { blocked: true, reason: "This item changed since preview. Refresh and try again." },
            { status: 200 },
          );
        }

        if (
          existingTemplate.template_name === templateName &&
          JSON.stringify(existingTemplate.sections ?? {}) === JSON.stringify(sections ?? {})
        ) {
          return NextResponse.json({ blocked: true, reason: "This change is already applied" }, { status: 200 });
        }

        previousTemplateSnapshot = {
          template_name: existingTemplate.template_name,
          sections: existingTemplate.sections,
          description: existingTemplate.description,
        };

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
          description: toNonEmptyString(templateRaw.description) ?? opportunity?.summary ?? null,
          tags: ["optimization_engine"],
        };

        const { data: insertedTemplate, error: insertError } = await supabase
          .from("inspection_templates")
          .insert(insert)
          .select("id")
          .single();
        if (insertError) {
          return NextResponse.json({ error: insertError.message }, { status: 500 });
        }

        resolvedTemplateId = insertedTemplate?.id ?? null;
        createdTemplate = true;
      }

      if (menuItemId && resolvedTemplateId) {
        const { data: menuItem, error: menuItemError } = await supabase
          .from("menu_items")
          .select("id,inspection_template_id")
          .eq("id", menuItemId)
          .eq("shop_id", profile.shop_id)
          .single();

        if (menuItemError || !menuItem) {
          return NextResponse.json({ error: "Menu item not found for inspection linkage" }, { status: 404 });
        }

        if (!templateId && menuItem.inspection_template_id) {
          return NextResponse.json(
            { blocked: true, reason: "This item changed since preview. Refresh and try again." },
            { status: 200 },
          );
        }

        if (menuItem.inspection_template_id && menuItem.inspection_template_id !== resolvedTemplateId) {
          return NextResponse.json(
            {
              blocked: true,
              reason: "Blocked: menu item is already linked to a different inspection template.",
            },
            { status: 200 },
          );
        }

        const { error: linkError } = await supabase
          .from("menu_items")
          .update({ inspection_template_id: resolvedTemplateId })
          .eq("id", menuItemId)
          .eq("shop_id", profile.shop_id);
        if (linkError) {
          return NextResponse.json({ error: linkError.message }, { status: 500 });
        }

        affectedEntityIds.menuItemId = menuItemId;
        undoData.previousMenuInspectionTemplateId = menuItem.inspection_template_id;
      }

      entityId = resolvedTemplateId;
      if (resolvedTemplateId) {
        affectedEntityIds.inspectionTemplateId = resolvedTemplateId;
      }
      undoData.inspection = {
        createdTemplate,
        previousTemplateSnapshot,
      };
    }

    if (type === "revenue") {
      const suggestionRaw = safePayload(payload.suggestionData);
      const title =
        toNonEmptyString(suggestionRaw.title) ||
        toNonEmptyString(suggestionRaw.suggestedService) ||
        opportunity?.title ||
        "Optimization Revenue Suggestion";
      const reason =
        toNonEmptyString(suggestionRaw.reason) ||
        toNonEmptyString(suggestionRaw.summary) ||
        opportunity?.summary ||
        "Created from optimization engine recommendation";

      const { data: existingSuggestion } = await supabase
        .from("menu_item_suggestions")
        .select("id")
        .eq("shop_id", profile.shop_id)
        .eq("title", title)
        .eq("reason", reason)
        .limit(1)
        .maybeSingle();
      if (existingSuggestion?.id) {
        return NextResponse.json({ blocked: true, reason: "This change is already applied" }, { status: 200 });
      }

      const insert: DB["public"]["Tables"]["menu_item_suggestions"]["Insert"] = {
        shop_id: profile.shop_id,
        title,
        reason,
        confidence: (() => {
          const c = Number(suggestionRaw.confidence ?? opportunity?.confidence);
          return Number.isFinite(c) ? Math.max(0, Math.min(1, c)) : 0.7;
        })(),
        category: toNonEmptyString(suggestionRaw.category),
        labor_hours_suggestion: (() => {
          const h = Number(suggestionRaw.laborHours);
          return Number.isFinite(h) ? h : null;
        })(),
        price_suggestion: (() => {
          const p = Number(suggestionRaw.priceSuggestion ?? opportunity?.estimatedValue);
          return Number.isFinite(p) ? p : null;
        })(),
      };

      const { data: insertedSuggestion, error: insertError } = await supabase
        .from("menu_item_suggestions")
        .insert(insert)
        .select("id")
        .single();
      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }

      entityId = insertedSuggestion?.id ?? null;
      if (entityId) {
        affectedEntityIds.suggestionId = entityId;
      }
      undoData.revenue = { title, reason };
    }

    const actionInsert: DB["public"]["Tables"]["optimization_actions"]["Insert"] = {
      shop_id: profile.shop_id,
      opportunity_id: opportunityId,
      type,
      action: "applied",
      payload: {
        originalPayload: payload as unknown,
        preview,
        affectedEntityIds,
        undoData,
        result: "success",
      } as DB["public"]["Tables"]["optimization_actions"]["Insert"]["payload"],
      created_by: user.id,
    };

    const { error: actionError } = await supabase.from("optimization_actions").insert(actionInsert);
    if (actionError) {
      return NextResponse.json({ error: actionError.message }, { status: 500 });
    }

    const message =
      type === "pricing"
        ? "Pricing normalization applied to menu item"
        : type === "inspection"
          ? "Inspection template prepared and linked"
          : "Revenue opportunity saved as suggestion";

    return NextResponse.json({
      success: true,
      type,
      entityId,
      affectedEntityIds,
      message,
      impactEstimate: opportunity?.estimatedValue ?? Number((payload.suggestionData as Record<string, unknown> | undefined)?.estimatedValue) ?? null,
      undoAction: {
        opportunityId,
        type,
        affectedEntityIds,
        undoData,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to apply optimization action";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
