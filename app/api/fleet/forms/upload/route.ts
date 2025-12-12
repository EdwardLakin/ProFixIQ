import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import OpenAI from "openai";

import type { Database } from "@shared/types/types/supabase";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

const BUCKET = "fleet-forms";

export const runtime = "nodejs";

type FleetParseSection = {
  title: string;
  items: { item: string; unit?: string | null }[];
};

type FleetParseResult = {
  extracted_text?: string;
  sections?: FleetParseSection[];
};

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
    const cookieStore = cookies();
    const supabase = createRouteHandlerClient<Database>({
      cookies: () => cookieStore,
    });
    const admin = createAdminSupabase();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "Missing file (expected multipart/form-data with 'file')" },
        { status: 400 },
      );
    }

    // 🔍 LOG RAW MIME + NAME AS SEEN BY NEXT
    // eslint-disable-next-line no-console
    console.log("Fleet form upload – raw file:", {
      name: file.name,
      type: file.type,
      size: file.size,
    });

    const maxSizeBytes = 25 * 1024 * 1024; // 25 MB
    if (file.size === 0) {
      return NextResponse.json({ error: "Empty file" }, { status: 400 });
    }
    if (file.size > maxSizeBytes) {
      return NextResponse.json(
        { error: "File too large (max 25MB)" },
        { status: 400 },
      );
    }

    const originalName = file.name || "fleet-form";
    const safeName = originalName.replace(/[^\w.\-]+/g, "-").toLowerCase();
    const timestamp = Date.now();
    const storagePath = `${user.id}/${timestamp}-${safeName}`;

    // 🔍 Log the final storage path too
    // eslint-disable-next-line no-console
    console.log("Fleet form upload – storage path:", storagePath);

    // 1) Upload to fleet-forms bucket
    //    👉 Let Supabase sniff the content type; don't pass contentType at all.
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, file);

    if (uploadError) {
      // Log full error for Vercel logs
      // eslint-disable-next-line no-console
      console.error("fleet-form upload error:", uploadError);

      return NextResponse.json(
        {
          error: `Storage upload failed: ${uploadError.message ?? "unknown error"}`,
          details: uploadError,
        },
        { status: 400 },
      );
    }

    // 2) Register DB row
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      "create_fleet_form_upload",
      {
        _path: storagePath,
        _filename: originalName,
      },
    );

    if (rpcError || !rpcData) {
      // eslint-disable-next-line no-console
      console.error("create_fleet_form_upload error:", rpcError);
      return NextResponse.json(
        { error: "Failed to register fleet form upload", details: rpcError },
        { status: 500 },
      );
    }

    const uploadId = rpcData as string;

    // 3) Mark row as processing (service-role)
    const { error: statusErr } = await admin
      .from("fleet_form_uploads")
      .update({ status: "processing" })
      .eq("id", uploadId);

    if (statusErr) {
      // eslint-disable-next-line no-console
      console.error("fleet_form_uploads status update error:", statusErr);
    }

    // 4) Run OCR + parsing with OpenAI
    let parsed: FleetParseResult | null = null;
    let extractedText = "";

    try {
      const arrayBuffer = await file.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString("base64");
      const mime = file.type || guessMimeFromName(originalName);

      // 🔍 Log the MIME we actually send into OpenAI
      // eslint-disable-next-line no-console
      console.log("Fleet form upload – OpenAI MIME used:", {
        detectedMime: file.type,
        guessedMime: guessMimeFromName(originalName),
        finalMime: mime,
      });

      const systemPrompt =
        "You are an expert OCR and form parser for vehicle/fleet inspection forms. " +
        "You always respond with STRICT JSON and nothing else.";

      const userPrompt = [
        "You are given a photo or PDF of a FLEET VEHICLE INSPECTION FORM.",
        "",
        "1. Perform OCR on the entire page(s).",
        "2. Detect the inspection SECTIONS and the individual LINE ITEMS under each section.",
        "3. For each line item, capture the label text as `item`.",
        "4. If the label clearly implies a measurement unit (e.g. 'Tread Depth (mm)', 'Tire Pressure (psi)', 'Push Rod Travel (in)'),",
        "   set `unit` accordingly (mm, in, psi, kPa, ft·lb, etc.). Otherwise, unit may be null.",
        "",
        "Return STRICT JSON with this shape:",
        "",
        "{",
        '  "extracted_text": "full OCR text of the form",',
        '  "sections": [',
        "    {",
        '      "title": "Section title as it appears on the form",',
        '      "items": [',
        '        { "item": "LF Tread Depth", "unit": "mm" },',
        '        { "item": "RF Tire Pressure", "unit": "psi" }',
        "      ]",
        "    }",
        "  ]",
        "}",
        "",
        "Important:",
        "- Keep `sections` and `items` in the same order as the original form where possible.",
        "- Do not invent extra fields that are not clearly present.",
        "- DO NOT wrap the JSON in markdown. Return raw JSON only.",
      ].join("\n");

      const completion = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: userPrompt },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mime};base64,${base64}`,
                },
              },
            ],
          },
        ],
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        throw new Error("No content from OpenAI");
      }

      let obj: FleetParseResult;
      try {
        obj = JSON.parse(content) as FleetParseResult;
      } catch {
        throw new Error("Failed to parse OpenAI JSON response");
      }

      parsed = obj;
      extractedText = (obj.extracted_text ?? "").toString();
    } catch (scanError: unknown) {
      // eslint-disable-next-line no-console
      console.error("fleet form scan error:", scanError);

      const errorMessage =
        scanError instanceof Error
          ? scanError.message
          : String(scanError ?? "Fleet form OCR/parse failed");

      await admin
        .from("fleet_form_uploads")
        .update({
          status: "failed",
          error_message: errorMessage,
        })
        .eq("id", uploadId);

      return NextResponse.json(
        {
          id: uploadId,
          status: "failed",
          storage_path: storagePath,
          error: errorMessage,
        },
        { status: 200 },
      );
    }

    const safeSections: FleetParseSection[] = Array.isArray(parsed?.sections)
      ? parsed.sections ?? []
      : [];

    await admin
      .from("fleet_form_uploads")
      .update({
        status: "parsed",
        extracted_text: extractedText || null,
        parsed_sections: safeSections.length ? safeSections : null,
      })
      .eq("id", uploadId);

    return NextResponse.json(
      {
        id: uploadId,
        status: "parsed",
        storage_path: storagePath,
      },
      { status: 200 },
    );
  } catch (err: unknown) {
    // eslint-disable-next-line no-console
    console.error("fleet forms upload route fatal error:", err);
    return NextResponse.json(
      { error: "Unexpected error uploading fleet form" },
      { status: 500 },
    );
  }
}

function guessMimeFromName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".heic")) return "image/heic";
  if (lower.endsWith(".heif")) return "image/heif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".tif") || lower.endsWith(".tiff")) return "image/tiff";
  return "application/octet-stream";
}