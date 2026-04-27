import { NextResponse } from "next/server";
import { openai } from "lib/server/openai";
import { getOpenAIModelForPurpose } from "@/features/shared/lib/server/openai-models";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { buildPartSuggestions } from "@/features/parts/server/buildPartSuggestions";
import type { CanonicalPartSuggestion } from "@/features/parts/types/partSuggestions";

type VehicleContext = {
  year?: string | number | null;
  make?: string | null;
  model?: string | null;
};

type SuggestRequestBody = {
  workOrderId?: string;
  workOrderLineId?: string | null;
  vehicle?: VehicleContext | null;
  description?: string | null;
  notes?: string | null;
  topK?: number;
};

const MODEL = getOpenAIModelForPurpose("reasoning");

async function inferAiOnlySuggestions(args: {
  description?: string | null;
  notes?: string | null;
  topK: number;
}): Promise<CanonicalPartSuggestion[]> {
  const query = `${args.description ?? ""} ${args.notes ?? ""}`.trim();
  if (!query) return [];

  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "ai_only_part_suggestions",
          schema: {
            type: "object",
            properties: {
              items: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    qty: { type: ["number", "null"], nullable: true },
                    rationale: { type: ["string", "null"], nullable: true },
                  },
                  required: ["title"],
                  additionalProperties: false,
                },
              },
            },
            required: ["items"],
            additionalProperties: false,
          },
        },
      },
      messages: [
        {
          role: "system",
          content:
            "Suggest likely repair parts from complaint text only. Do not claim fitment certainty. JSON only.",
        },
        { role: "user", content: query },
      ],
      temperature: 0.2,
    });

    const raw = completion.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(raw) as { items?: Array<{ title?: string; qty?: number | null; rationale?: string | null }> };
    return (parsed.items ?? []).slice(0, args.topK).map((item, index) => ({
      candidateId: `ai:${index}:${item.title ?? "candidate"}`,
      partId: null,
      sku: null,
      supplierId: null,
      title: (item.title ?? "Unknown part").trim(),
      quantitySuggestion: Math.max(1, Math.round(Number(item.qty ?? 1))),
      unit: "unknown",
      sourceTypes: ["ai_inference_only"],
      fitmentConfidence: "needs_review",
      historySignal: {
        sameVehicleCount: 0,
        sameYmmCount: 0,
        similarComplaintCount: 0,
        summary: "no_prior_usage_found",
      },
      inventorySignal: { inStockQty: null, lowStock: false, reorderPoint: null },
      receivingSignal: { openRequestQty: 0, pendingReceiveQty: 0, openPoCount: 0 },
      warnings: [
        { type: "fitment_uncertain", message: "AI inference only. Verify fitment, duplicates, and availability before action." },
      ],
      linkedEvidence: [
        {
          id: `ai-evidence-${index}`,
          sourceType: "ai_inference_only",
          label: "AI inference only",
          detail: item.rationale?.trim() || "Generated from complaint text without catalog confirmation.",
          strength: "weak",
        },
      ],
      reviewRecommendation: "Use as draft guidance only. Review with parts advisor before add/request.",
      addable: false,
      requestable: true,
      rankScore: 1,
    }));
  } catch {
    return [];
  }
}

export async function POST(req: Request) {
  const supabase = createServerSupabaseRoute();

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ items: [], error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("shop_id")
      .eq("id", user.id)
      .maybeSingle<{ shop_id: string | null }>();

    const shopId = profile?.shop_id ?? null;
    if (!shopId) {
      return NextResponse.json({ items: [], error: "Missing shop scope" }, { status: 400 });
    }

    const body = (await req.json().catch(() => ({}))) as SuggestRequestBody;
    const topK = typeof body.topK === "number" ? Math.min(10, Math.max(1, body.topK)) : 5;

    const items = await buildPartSuggestions({
      supabase,
      shopId,
      workOrderId: body.workOrderId ?? null,
      workOrderLineId: body.workOrderLineId ?? null,
      vehicle: body.vehicle ?? null,
      description: body.description ?? null,
      notes: body.notes ?? null,
      topK,
    });

    if (items.length > 0) return NextResponse.json({ items });

    const aiOnly = await inferAiOnlySuggestions({
      description: body.description ?? null,
      notes: body.notes ?? null,
      topK,
    });

    return NextResponse.json({ items: aiOnly });
  } catch (err) {
    return NextResponse.json(
      { items: [], error: err instanceof Error ? err.message : "Unable to generate part suggestions." },
      { status: 200 },
    );
  }
}
