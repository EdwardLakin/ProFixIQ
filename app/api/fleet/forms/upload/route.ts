import { NextRequest, NextResponse } from "next/server";
import { getOpenAIClient } from "@/features/shared/lib/server/openai";
import { getOpenAIModelForPurpose } from "@/features/shared/lib/server/openai-models";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";

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

const openai = getOpenAIClient();

function guessMimeFromName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".heic")) return "image/heic";
  if (lower.endsWith(".heif")) return "image/heif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".tif") || lower.endsWith(".tiff")) return "image/tiff";
  if (lower.endsWith(".pdf")) return "application/pdf";
  return "application/octet-stream";
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createServerSupabaseRoute();
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

    const vehicleType = String(formData.get("vehicleType") || "").trim();
    const dutyClass = String(formData.get("dutyClass") || "").trim();
    const titleHint = String(formData.get("titleHint") || "").trim();

    const maxSizeBytes = 25 * 1024 * 1024;
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
    const mime = file.type || guessMimeFromName(originalName);

    const isPdf =
      mime === "application/pdf" || originalName.toLowerCase().endsWith(".pdf");
    if (isPdf) {
      return NextResponse.json(
        {
          error:
            "PDF uploads are not supported yet. Please upload a photo/scan image (JPG, PNG, HEIC, WEBP, TIFF).",
        },
        { status: 400 },
      );
    }

    const isImage = mime.startsWith("image/");
    if (!isImage) {
      return NextResponse.json(
        {
          error:
            "Invalid file type. Please upload an image (JPG, PNG, HEIC, WEBP, TIFF).",
        },
        { status: 400 },
      );
    }

    const storagePath = `${user.id}/${timestamp}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, file);

    if (uploadError) {
      return NextResponse.json(
        {
          error: `Storage upload failed: ${uploadError.message ?? "unknown error"}`,
          details: uploadError,
        },
        { status: 400 },
      );
    }

    const { data: rpcData, error: rpcError } = await supabase.rpc(
      "create_fleet_form_upload",
      {
        _path: storagePath,
        _filename: originalName,
      },
    );

    if (rpcError || !rpcData) {
      return NextResponse.json(
        { error: "Failed to register fleet form upload", details: rpcError },
        { status: 500 },
      );
    }

    const uploadId = rpcData as string;

    await admin
      .from("fleet_form_uploads")
      .update({ status: "processing" })
      .eq("id", uploadId);

    let parsed: FleetParseResult | null = null;
    let extractedText = "";

    try {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const base64 = buffer.toString("base64");

      const systemPrompt = [
        "You are an expert OCR and fleet inspection form parser.",
        "Return STRICT JSON only.",
        "Do not summarize.",
        "Do not omit sections just because they are long.",
        "Preserve the original form structure as completely as possible.",
      ].join(" ");

      const userPrompt = [
        "You are given ONE PAGE from a multi-page fleet vehicle inspection form.",
        "Your job is OCR plus structure extraction for ALL visible sections and rows on this page.",
        "",
        "Return strict JSON with this shape:",
        "{",
        '  "extracted_text": "full OCR text from this page",',
        '  "sections": [',
        "    {",
        '      "title": "section title exactly from the page",',
        '      "items": [',
        '        { "item": "line item label", "unit": null }',
        "      ]",
        "    }",
        "  ]",
        "}",
        "",
        "Rules:",
        "- Capture every visible inspection row you can read.",
        "- Preserve page order.",
        "- Use the printed section headers from the form.",
        "- If a page contains a large table with grouped headers, output each group as its own section.",
        "- If an item is a measurement row like tire pressure or tread depth, set unit when obvious.",
        "- If a field is a fill-in blank like VIN, date, mileage, technician name, include it as an item.",
        "- Do not collapse many rows into 2 or 3 generic lines.",
        "- Do not invent items not visible on the page.",
        "",
        `Vehicle type hint: ${vehicleType || "unknown"}`,
        `Duty class hint: ${dutyClass || "unknown"}`,
        `Title hint: ${titleHint || "unknown"}`,
      ].join("\n");

      const completion = await openai.chat.completions.create({
        model: getOpenAIModelForPurpose("vision"),
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
      if (!content) throw new Error("No content from OpenAI");

      parsed = JSON.parse(content) as FleetParseResult;
      extractedText = (parsed.extracted_text ?? "").toString();
    } catch (scanError: unknown) {
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
    console.error("fleet forms upload route fatal error:", err);
    return NextResponse.json(
      { error: "Unexpected error uploading fleet form" },
      { status: 500 },
    );
  }
}
