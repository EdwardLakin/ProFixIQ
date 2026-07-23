import { NextRequest, NextResponse } from "next/server";

import { pickBestOcrVin } from "@/features/shared/lib/vin/vinCapture";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { getOpenAIClient } from "@/features/shared/lib/server/openai";
import { getOpenAIModelForPurpose } from "@/features/shared/lib/server/openai-models";

export const runtime = "nodejs";

const openai = getOpenAIClient();
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export async function POST(req: NextRequest) {
  try {
    const access = await requireShopScopedApiAccess();
    if (!access.ok) return access.response;

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
    const dataUrl = `data:${file.type};base64,${base64}`;

    const completion = await openai.chat.completions.create({
      model: getOpenAIModelForPurpose("vision"),
      max_tokens: 80,
      messages: [
        {
          role: "system",
          content:
            "Read the human-readable VIN printed on a vehicle compliance label. Prefer the 17-character text next to VIN: and do not try to describe or decode the barcode. A VIN uses digits and capital letters except I, O, and Q. Reply with only the VIN. If no complete VIN is confidently readable, reply with only NONE.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extract the complete printed VIN from this vehicle label. Reply only with the VIN or NONE.",
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
      return NextResponse.json({ vin: null, confidence: "none" });
    }

    const candidate = pickBestOcrVin(raw);
    if (!candidate) {
      return NextResponse.json({ vin: null, confidence: "none" });
    }

    return NextResponse.json({
      vin: candidate.vin,
      checksumValid: candidate.checksumValid,
      confidence: candidate.checksumValid
        ? "checksum_confirmed"
        : "exact_text",
    });
  } catch (err) {
    console.error("VIN extract error", err);
    return NextResponse.json(
      { error: "Failed to extract VIN from image" },
      { status: 500 },
    );
  }
}
