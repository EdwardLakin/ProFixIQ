// app/api/ocr/registration/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";
import { normalizeVinInput } from "@/features/shared/lib/vin/normalizeVin";
import { getOpenAIClient } from "@/features/shared/lib/server/openai";
import { getOpenAIModelForPurpose, openAITemperatureParam } from "@/features/shared/lib/server/openai-models";
import type { ChatCompletionMessageParam } from "openai/resources/chat";

export const runtime = "nodejs";

const client = getOpenAIClient();

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

/* ----------------------------- helpers ----------------------------- */
function clean(v: unknown): string | null {
  if (typeof v === "string") {
    const t = v.trim();
    return t ? t : null;
  }
  return v == null ? null : String(v);
}

/** narrow completion content to string */
function toText(content: string | null | undefined): string {
  return typeof content === "string" ? content : "";
}

/* ------------------------------ schema ----------------------------- */
/** Fields we expect back; we’ll coerce to these types after parsing */
type Fields = {
  vin: string | null;
  plate: string | null;
  year: string | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  engine: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
};

/** cheap runtime guard */
function coerceFields(obj: unknown): Partial<Fields> {
  const get = (k: keyof Fields) =>
    obj && typeof obj === "object" && k in obj ? clean((obj as Record<string, unknown>)[k]) : null;

  return {
    vin: normalizeVinInput(get("vin")).vin || null,
    plate: get("plate"),
    year: get("year"),
    make: get("make"),
    model: get("model"),
    trim: get("trim"),
    engine: get("engine"),
    first_name: get("first_name"),
    last_name: get("last_name"),
    phone: get("phone"),
    email: get("email"),
    address: get("address"),
    city: get("city"),
    province: get("province"),
    postal_code: get("postal_code"),
  };
}

/* ------------------------------ handler ---------------------------- */
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

    const ctype = req.headers.get("content-type") || "";

    let imageUrl: string | undefined;
    let dataUrl: string | undefined;

    if (ctype.startsWith("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file") as File | null;
      if (!file) {
        return NextResponse.json({ error: "Missing 'file' in form-data." }, { status: 400 });
      }
      if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
        return NextResponse.json({ error: "Unsupported image type" }, { status: 415 });
      }
      if (file.size > MAX_IMAGE_BYTES) {
        return NextResponse.json({ error: "Image must be 8 MB or smaller" }, { status: 413 });
      }
      const buf = Buffer.from(await file.arrayBuffer());
      const base64 = buf.toString("base64");
      const mime = file.type || "image/jpeg";
      dataUrl = `data:${mime};base64,${base64}`;
    } else {
      const body = (await req.json().catch(() => ({}))) as { imageUrl?: string; dataUrl?: string };
      imageUrl = body.imageUrl;
      dataUrl = body.dataUrl;
    }

    const finalUrl = imageUrl ?? dataUrl;
    if (!finalUrl) {
      return NextResponse.json(
        { error: "Provide either 'imageUrl' or 'file' (multipart) / 'dataUrl' (JSON)." },
        { status: 400 }
      );
    }

    // ---- Chat Completions (vision) + JSON mode (no casts, fully typed) ----
    const messages: ChatCompletionMessageParam[] = [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: [
              "Extract fields from this vehicle registration or insurance card.",
              "Return ONLY a strict JSON object with the following nullable string keys:",
              "vin, plate, year, make, model, trim, engine, first_name, last_name, phone, email, address, city, province, postal_code.",
              "If a field is unknown, set it to null.",
              "Normalize VIN to 17 uppercase alphanumerics (strip spaces and dashes; omit I, O, Q).",
            ].join("\n"),
          },
          { type: "image_url", image_url: { url: finalUrl } },
        ],
      },
    ];

    const completion = await client.chat.completions.create({
      model: getOpenAIModelForPurpose("extraction"),
      messages,
      ...openAITemperatureParam(getOpenAIModelForPurpose("extraction"), 0),
      // Ensures a valid JSON object string
      response_format: { type: "json_object" },
    });

    const text = toText(completion.choices[0]?.message?.content);
    let parsed: unknown = {};
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      parsed = {};
    }

    const fields = coerceFields(parsed);

    return NextResponse.json({ fields });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "OCR error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}