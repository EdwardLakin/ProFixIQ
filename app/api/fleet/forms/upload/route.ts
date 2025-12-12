// app/api/fleet/forms/upload/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import OpenAI from "openai";

import type { Database } from "@shared/types/types/supabase";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

const BUCKET = "fleet-forms";

// Force Node runtime so Buffer + pdf-parse are safe
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

// Minimal typing for pdf-parse (no any)
type PdfParseFn = (data: Buffer) => Promise<{ text?: string }>;

/**
 * Dynamically import pdf-parse in an ESM-safe way and extract text
 * from a multi-page PDF.
 */
async function extractPdfText(buffer: Buffer): Promise<string> {
  // pdf-parse is CommonJS (export = pdfParse)
  // so at runtime the module may be a function OR { default: fn }
  const mod = (await import("pdf-parse")) as unknown as
    | PdfParseFn
    | { default: PdfParseFn };

  const pdfParse: PdfParseFn =
    typeof mod === "function" ? mod : (mod as { default: PdfParseFn }).default;

  const data = await pdfParse(buffer);
  return (data.text ?? "").trim();
}

/**
 * POST /api/fleet/forms/upload
 *
 * Expects multipart/form-data:
 *   - file: PDF or image of a fleet inspection form
 *
 * Returns:
 *   200 { id, status, storage_path, error? }
 *   4xx/5xx on error
 */
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

    // Basic type/size guardrails
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
    const mime = file.type || guessMimeFromName(originalName);
    const storagePath = `${user.id}/${timestamp}-${safeName}`;

    // 🔍 Debug: log what we’re seeing
    // eslint-disable-next-line no-console
    console.log("[fleet forms] upload:", {
      originalName,
      safeName,
      mime,
      size: file.size,
      storagePath,
    });

    // 1) Upload to fleet-forms bucket (let Supabase sniff mime)
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, file);

    if (uploadError) {
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

    // 2) Create DB row via RPC (user-scoped)
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
      const buffer = Buffer.from(arrayBuffer);

      const isPdf = mime === "application/pdf";

      // eslint-disable-next-line no-console
      console.log("[fleet forms] parse branch:", isPdf ? "PDF(text)" : "image", {
        mime,
      });

      if (isPdf) {
        // ---------- PDF branch: pdf-parse → text → text-only LLM ----------
        const pdfText = await extractPdfText(buffer);

        // If the PDF is scanned images, pdf-parse will return empty/near-empty text.
        // We do NOT send PDFs to Vision (that’s what triggers DOMMatrix issues).
        if (!pdfText || pdfText.length < 40) {
          throw new Error(
            "This PDF appears to be scanned images with no extractable text. " +
              "Please upload photos (JPG/PNG/HEIC/WEBP) of the page(s) instead.",
          );
        }

        const systemPromptBase =
          "You are an expert parser for vehicle/fleet inspection forms.\n" +
          "You always respond with STRICT JSON and nothing else.";

        const userPrompt = [
          "You are given extracted text from a multi-page FLEET VEHICLE INSPECTION PDF.",
          "",
          "The text preserves section headers and line items, but layout may be flattened.",
          "",
          "1. Detect the inspection SECTIONS and the individual LINE ITEMS under each section.",
          "2. For each line item, capture the label text as `item`.",
          "3. If the label clearly implies a measurement unit (e.g. 'Tread Depth (mm)', 'Tire Pressure (psi)', 'Push Rod Travel (in)'),",
          "   set `unit` accordingly (mm, in, psi, kPa, ft·lb, etc.). Otherwise, unit may be null.",
          "",
          "Return STRICT JSON with this shape:",
          "",
          "{",
          '  "extracted_text": "full OCR text of the form (you may reuse the input text)",',
          '  "sections": [',
          "    {",
          '      "title": "Section title as it appears in the text",',
          '      "items": [',
          '        { "item": "LF Tread Depth", "unit": "mm" },',
          '        { "item": "RF Tire Pressure", "unit": "psi" }',
          "      ]",
          "    }",
          "  ]",
          "}",
          "",
          "Important:",
          "- Keep `sections` and `items` in roughly the same order as the original form.",
          "- Do not invent extra fields that are not clearly present.",
          "- DO NOT wrap the JSON in markdown. Return raw JSON only.",
          "",
          "Here is the extracted text:",
          "",
          pdfText.slice(0, 24000), // guardrail
        ].join("\n");

        const completion = await openai.chat.completions.create({
          model: "gpt-4.1-mini",
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPromptBase },
            { role: "user", content: userPrompt },
          ],
        });

        const content = completion.choices[0]?.message?.content;
        if (!content) {
          throw new Error("No content from OpenAI (PDF branch)");
        }

        let obj: FleetParseResult;
        try {
          obj = JSON.parse(content) as FleetParseResult;
        } catch {
          throw new Error("Failed to parse OpenAI JSON response (PDF branch)");
        }

        parsed = obj;
        extractedText = (obj.extracted_text ?? pdfText).toString();
      } else {
        // ---------- IMAGE branch: send as data URL to Vision ----------
        const base64 = buffer.toString("base64");

        const systemPrompt =
          "You are an expert OCR and form parser for vehicle/fleet inspection forms. " +
          "You always respond with STRICT JSON and nothing else.";

        const userPrompt = [
          "You are given a photo of a FLEET VEHICLE INSPECTION FORM.",
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
          throw new Error("No content from OpenAI (image branch)");
        }

        let obj: FleetParseResult;
        try {
          obj = JSON.parse(content) as FleetParseResult;
        } catch {
          throw new Error("Failed to parse OpenAI JSON response (image branch)");
        }

        parsed = obj;
        extractedText = (obj.extracted_text ?? "").toString();
      }
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

    // 5) Persist parsed result
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

/**
 * Tiny MIME guesser fallback when file.type is missing.
 */
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