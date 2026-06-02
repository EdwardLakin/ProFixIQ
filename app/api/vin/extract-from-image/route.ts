import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";
import { normalizeVinInput } from "@/features/shared/lib/vin/normalizeVin";
import { getOpenAIClient } from "@/features/shared/lib/server/openai";
import { getOpenAIModelForPurpose } from "@/features/shared/lib/server/openai-models";

const openai = getOpenAIClient();

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

function findVinLike(text: string): string | null {
  const direct = normalizeVinInput(text);
  if (direct.isValid) return direct.vin;

  const candidates = text
    .toUpperCase()
    .match(/[A-Z0-9][A-Z0-9\s\-_.:/\\|]{15,}[A-Z0-9]/g);

  for (const candidate of candidates ?? []) {
    const normalized = normalizeVinInput(candidate);
    if (normalized.isValid) return normalized.vin;
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseRSC();
    const { data: userData, error: userError } = await supabase.auth.getUser();
    const userId = userData.user?.id ?? null;

    if (userError || !userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("shop_id")
      .eq("id", userId)
      .maybeSingle();

    if (profileError || !profile?.shop_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const formData = await req.formData();
    const file = formData.get("image") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: "Unsupported image type" },
        { status: 415 },
      );
    }

    if (file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { error: "Image must be 8 MB or smaller" },
        { status: 413 },
      );
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const base64 = bytes.toString("base64");
    const dataUrl = "data:" + file.type + ";base64," + base64;

    const completion = await openai.chat.completions.create({
      model: getOpenAIModelForPurpose("vision"),
      max_tokens: 50,
      messages: [
        {
          role: "system",
          content:
            "You extract VINs from vehicle photos. A VIN is exactly 17 characters, using digits and capital letters except I, O, Q. If you cannot confidently see a VIN, respond with ONLY the word NONE.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Read the VIN from this image. Reply ONLY with the VIN or NONE.",
            },
            {
              type: "image_url",
              image_url: {
                url: dataUrl,
              },
            },
          ],
        },
      ],
    });

    const raw =
      completion.choices[0]?.message?.content?.toString().trim() ?? "";

    if (!raw || raw.toUpperCase() === "NONE") {
      return NextResponse.json({ vin: null });
    }

    const vin = findVinLike(raw);
    return NextResponse.json({ vin: vin ?? null });
  } catch (err) {
    console.error("VIN extract error", err);
    return NextResponse.json(
      { error: "Failed to extract VIN from image" },
      { status: 500 }
    );
  }
}