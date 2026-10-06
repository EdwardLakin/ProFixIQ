import { NextResponse } from "next/server";
import { ledgerOpenAICall } from "@/features/shared/lib/server/ai-provider-accounting";
import { getOpenAIClient } from "@/features/shared/lib/server/openai";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import {
  getOpenAIModelForPurpose,
  openAITemperatureParam,
} from "@/features/shared/lib/server/openai-models";

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

export async function POST(req: Request) {
  const { prompt } = await req.json();

  const scope = await resolveAuthenticatedShopScope();
  if (!scope) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const openai = getOpenAIClient();

  const response = await ledgerOpenAICall(
    {
      feature: "inspection_template_generate",
      endpoint: "/api/ai/generateInspectionList",
      shopId: scope.shopId,
      userId: scope.userId,
      model: getOpenAIModelForPurpose("extraction"),
    },
    () => openai.chat.completions.create({
    model: getOpenAIModelForPurpose("extraction"),
    messages: [
      {
        role: "system",
        content: `You are an expert mechanic. Given a prompt, return a JSON array of inspection categories with items. Each category has a title and items (with string field "item"). Example format:
[
  {
    "title": "Brakes",
    "items": [{ "item": "Check brake pads" }, { "item": "Check rotors" }]
  }
]`,
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    ...openAITemperatureParam(getOpenAIModelForPurpose("extraction"), 0.4),
  }),
  );

  const json = response.choices[0].message.content;

  try {
    return NextResponse.json(JSON.parse(json!));
  } catch {
    return NextResponse.json(
      { error: "Failed to parse response from OpenAI", raw: json },
      { status: 500 },
    );
  }
}
