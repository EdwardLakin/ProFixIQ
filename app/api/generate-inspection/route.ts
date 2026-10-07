// app/api/generate-inspection/route.ts
import { aiBudgetStopResponse, isAIBudgetStop } from "@/features/shared/lib/server/ai-governance";
import { NextResponse } from "next/server";
import { ledgerOpenAICall } from "@/features/shared/lib/server/ai-provider-accounting";
import { getOpenAIClient } from "@/features/shared/lib/server/openai";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import {
  getOpenAIModelForPurpose,
  openAITemperatureParam,
} from "@/features/shared/lib/server/openai-models";
import { toInspectionCategories } from "@/features/inspections/lib/inspection/normalize";

async function resolveAuthenticatedShopScope(): Promise<{
  shopId: string;
  userId: string;
} | null> {
  const supabase = createServerSupabaseRoute();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("shop_id")
    .eq("id", user.id)
    .maybeSingle();

  return profile?.shop_id ? { shopId: profile.shop_id, userId: user.id } : null;
}

type GenerateBody = {
  prompt?: string;
};

export async function POST(req: Request) {
  try {
    const body: GenerateBody = await req.json();
    const prompt = body.prompt?.trim();
    if (!prompt) {
      return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
    }

    const scope = await resolveAuthenticatedShopScope();
    if (!scope) {
      return NextResponse.json({ categories: [] }, { status: 401 });
    }

    const openai = getOpenAIClient();

    const system =
      "You generate automotive inspection templates. " +
      "Return ONLY valid JSON with this shape: " +
      '{"categories":[{"title":string,"items":[{"item":string}]}]} ' +
      "The list should be practical and shop-usable. No extra keys, no markdown.";

    const extractionModel = getOpenAIModelForPurpose("extraction");
    const completion = await ledgerOpenAICall(
      {
        feature: "inspection_template_generate",
        endpoint: "/api/generate-inspection",
        shopId: scope.shopId,
        userId: scope.userId,
        model: extractionModel,
      },
      () => openai.chat.completions.create({
      model: extractionModel,
      ...openAITemperatureParam(getOpenAIModelForPurpose("extraction"), 0.2),
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    }),
    );

    const raw = completion.choices?.[0]?.message?.content ?? "{}";
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      data = {};
    }

    const categories = toInspectionCategories(data);
    return NextResponse.json({ categories });
  } catch (err) {
    if (isAIBudgetStop(err)) {
      const stop = aiBudgetStopResponse(err);
      return NextResponse.json({ categories: [], ...stop.body }, { status: stop.status });
    }
    console.error("generate-inspection error:", err);
    return NextResponse.json({ categories: [] }, { status: 500 });
  }
}
