import { NextResponse } from "next/server";
import { getOpenAIClient } from "@/features/shared/lib/server/openai";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import {
  getOpenAIModelForPurpose,
  openAITemperatureParam,
} from "@/features/shared/lib/server/openai-models";

async function hasAuthenticatedShopScope(): Promise<boolean> {
  const supabase = createServerSupabaseRoute();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data: profile } = await supabase
    .from("profiles")
    .select("shop_id")
    .eq("id", user.id)
    .maybeSingle();

  return Boolean(profile?.shop_id);
}

export async function POST(req: Request) {
  const { prompt } = await req.json();

  if (!(await hasAuthenticatedShopScope())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const openai = getOpenAIClient();

  const response = await openai.chat.completions.create({
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
  });

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
