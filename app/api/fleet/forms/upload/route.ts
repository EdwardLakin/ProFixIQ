import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import OpenAI from "openai";

import type { Database } from "@shared/types/types/supabase";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

const BUCKET = "fleet-forms";

// Force Node runtime so Buffer + PDF rendering are safe
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

/* ========================================================================== */
/*  PDF → PNG (Option A)                                                      */
/*  - Keeps Supabase bucket image-only                                        */
/*  - Converts PDFs to 1+ PNG pages server-side, uploads PNG(s)               */
/*  - Sends PNG page(s) to Vision (same as image branch)                      */
/*  - No `any`                                                                */
/* ========================================================================== */

type PdfRenderOptions = {
  maxPages: number; // how many pages to render/send to Vision
  scale: number; // render scale
  maxWidth: number; // clamp width to avoid huge images
};

type PdfJsLoadingTaskLike = {
  promise: Promise<unknown>;
};

type PdfJsDocumentLike = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<unknown>;
};

type PdfJsPageLike = {
  getViewport: (opts: { scale: number }) => { width: number; height: number };
  render: (params: {
    canvasContext: unknown;
    viewport: { width: number; height: number };
    canvas?: unknown;
  }) => { promise: Promise<unknown> };
};

type PdfJsModuleLike = {
  getDocument: (src: {
    data: Uint8Array;
    disableWorker: boolean;
  }) => PdfJsLoadingTaskLike;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function isFunction(v: unknown): v is (...args: never[]) => unknown {
  return typeof v === "function";
}

function isPdfJsLoadingTask(v: unknown): v is PdfJsLoadingTaskLike {
  return (
    isRecord(v) && "promise" in v && v.promise instanceof Promise
  );
}

function isPdfJsDocument(v: unknown): v is PdfJsDocumentLike {
  return (
    isRecord(v) &&
    typeof v.numPages === "number" &&
    "getPage" in v &&
    isFunction(v.getPage)
  );
}

function isPdfJsPage(v: unknown): v is PdfJsPageLike {
  return (
    isRecord(v) &&
    "getViewport" in v &&
    isFunction(v.getViewport) &&
    "render" in v &&
    isFunction(v.render)
  );
}

async function loadPdfJs(): Promise<PdfJsModuleLike> {
  // Use ESM build to avoid CommonJS/TS call issues.
  // IMPORTANT: you must have `pdfjs-dist` installed.
  const modUnknown = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown;

  // pdfjs can export getDocument on the module or on default.
  const mod = isRecord(modUnknown) ? modUnknown : {};
  const maybeDefault = isRecord(mod.default) ? mod.default : null;

  const getDocumentUnknown =
    (mod["getDocument"] as unknown) ??
    (maybeDefault ? (maybeDefault["getDocument"] as unknown) : undefined);

  if (!isFunction(getDocumentUnknown)) {
    throw new Error("pdfjs-dist module missing getDocument()");
  }

  const pdfjs: PdfJsModuleLike = {
    getDocument: getDocumentUnknown as PdfJsModuleLike["getDocument"],
  };

  return pdfjs;
}

async function renderPdfToPngBuffers(
  pdfBuffer: Buffer,
  opts: PdfRenderOptions,
): Promise<Buffer[]> {
  // IMPORTANT: you must have `@napi-rs/canvas` installed.
  const canvasMod = await import("@napi-rs/canvas");
  const { createCanvas, ImageData, DOMMatrix } = canvasMod;

  // pdfjs sometimes expects these globals in Node environments
  const g = globalThis as unknown as Record<string, unknown>;
  if (!("DOMMatrix" in g)) g["DOMMatrix"] = DOMMatrix;
  if (!("ImageData" in g)) g["ImageData"] = ImageData;

  const pdfjs = await loadPdfJs();

  const loadingTaskUnknown = pdfjs.getDocument({
    data: new Uint8Array(pdfBuffer),
    disableWorker: true,
  });

  if (!isPdfJsLoadingTask(loadingTaskUnknown)) {
    throw new Error("pdfjs getDocument() did not return a loading task");
  }

  const docUnknown = await loadingTaskUnknown.promise;
  if (!isPdfJsDocument(docUnknown)) {
    throw new Error("pdfjs document shape unexpected");
  }

  const totalPages = Math.min(docUnknown.numPages, Math.max(1, opts.maxPages));
  const out: Buffer[] = [];

  for (let pageNum = 1; pageNum <= totalPages; pageNum += 1) {
    const pageUnknown = await docUnknown.getPage(pageNum);
    if (!isPdfJsPage(pageUnknown)) {
      throw new Error(`pdfjs page ${pageNum} shape unexpected`);
    }

    // Start with desired scale, then clamp by maxWidth if needed
    let viewport = pageUnknown.getViewport({ scale: opts.scale });
    if (viewport.width > opts.maxWidth) {
      const clampScale = opts.scale * (opts.maxWidth / viewport.width);
      viewport = pageUnknown.getViewport({ scale: clampScale });
    }

    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const ctx = canvas.getContext("2d");

    const renderTaskUnknown = pageUnknown.render({
      canvasContext: ctx,
      viewport,
      // some pdfjs builds expect a `canvas` param present
      canvas,
    });

    const renderTask =
      isRecord(renderTaskUnknown) && "promise" in renderTaskUnknown && renderTaskUnknown.promise instanceof Promise
        ? (renderTaskUnknown as { promise: Promise<unknown> })
        : null;

    if (!renderTask) {
      throw new Error(`pdfjs render task missing promise (page ${pageNum})`);
    }

    await renderTask.promise;

    const png = canvas.toBuffer("image/png");
    out.push(png);
  }

  return out;
}

/* ========================================================================== */
/*  Route                                                                     */
/* ========================================================================== */

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
    const isPdf =
      mime === "application/pdf" || originalName.toLowerCase().endsWith(".pdf");

    // We keep bucket image-only, so PDFs become PNG(s)
    const baseSafe = safeName.replace(/\.(pdf)$/i, "");
    const storagePath = `${user.id}/${timestamp}-${isPdf ? `${baseSafe}.png` : safeName}`;

    // eslint-disable-next-line no-console
    console.log("[fleet forms] upload:", {
      originalName,
      safeName,
      mime,
      size: file.size,
      isPdf,
      storagePath,
    });

    // Read once into Buffer
    const buffer = Buffer.from(await file.arrayBuffer());

    // 1) Ensure what we upload to storage is always an image
    //    - image upload: upload original file
    //    - pdf upload: render to png pages, upload first page as storagePath and (optionally) other pages
    let pngPages: Buffer[] | null = null;

    if (isPdf) {
      // eslint-disable-next-line no-console
      console.log("[fleet forms] PDF → PNG render start");

      pngPages = await renderPdfToPngBuffers(buffer, {
        maxPages: 3, // good tradeoff; bump later if needed
        scale: 2,
        maxWidth: 1600,
      });

      if (!pngPages.length) {
        return NextResponse.json(
          { error: "Failed to render PDF to images" },
          { status: 400 },
        );
      }

      // Upload first page at storagePath (the one we reference in DB)
      const first = pngPages[0];

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, first, { contentType: "image/png" });

      if (uploadError) {
        // eslint-disable-next-line no-console
        console.error("fleet-form upload error (pdf first page):", uploadError);

        return NextResponse.json(
          {
            error: `Storage upload failed: ${uploadError.message ?? "unknown error"}`,
            details: uploadError,
          },
          { status: 400 },
        );
      }

      // Optional: upload additional pages for future “multi-page preview”
      // (Not required for parsing today, but useful later.)
      for (let i = 1; i < pngPages.length; i += 1) {
        const p = pngPages[i];
        const pagePath = `${user.id}/${timestamp}-${baseSafe}-p${i + 1}.png`;

        const { error: pageErr } = await supabase.storage
          .from(BUCKET)
          .upload(pagePath, p, { contentType: "image/png" });

        if (pageErr) {
          // eslint-disable-next-line no-console
          console.error("fleet-form upload error (pdf extra page):", {
            page: i + 1,
            pagePath,
            pageErr,
          });
          // do not fail entire request if extra pages fail
        }
      }

      // eslint-disable-next-line no-console
      console.log("[fleet forms] PDF → PNG render uploaded:", {
        pages: pngPages.length,
      });
    } else {
      // Image upload as-is; let Supabase sniff mime
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
      // Branch: PDF (now rendered to PNG pages) vs image
      // eslint-disable-next-line no-console
      console.log("[fleet forms] OCR branch:", isPdf ? "PDF->PNG" : "image", mime);

      const systemPrompt =
        "You are an expert OCR and form parser for vehicle/fleet inspection forms. " +
        "You always respond with STRICT JSON and nothing else.";

      const userPrompt = [
        isPdf
          ? "You are given one or more rendered page images from a multi-page FLEET VEHICLE INSPECTION PDF."
          : "You are given a photo of a FLEET VEHICLE INSPECTION FORM.",
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

      const imageParts: Array<{ type: "image_url"; image_url: { url: string } }> =
        [];

      if (isPdf) {
        const pages = pngPages ?? [];
        if (!pages.length) {
          throw new Error("PDF pages missing after render");
        }

        for (const p of pages) {
          const b64 = p.toString("base64");
          imageParts.push({
            type: "image_url",
            image_url: { url: `data:image/png;base64,${b64}` },
          });
        }
      } else {
        const b64 = buffer.toString("base64");
        const usedMime = mime || "image/jpeg";
        imageParts.push({
          type: "image_url",
          image_url: { url: `data:${usedMime};base64,${b64}` },
        });
      }

      const completion = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [{ type: "text", text: userPrompt }, ...imageParts],
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