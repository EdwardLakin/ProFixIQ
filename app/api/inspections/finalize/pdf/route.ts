// app/api/inspections/finalize/pdf/route.ts ✅ FULL FILE REPLACEMENT

import "server-only";

export const runtime = "nodejs";

import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database, Json } from "@shared/types/types/supabase";
import { generateInspectionPDF } from "@/features/inspections/lib/inspection/pdf";
import type { InspectionSession } from "@/features/inspections/lib/inspection/types";

type DB = Database;

type Body = { workOrderLineId?: string };

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

function asString(x: unknown): string | null {
  return typeof x === "string" && x.trim().length ? x.trim() : null;
}

function safeFilePart(x: string): string {
  return x.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient<DB>({ cookies });

  // 1) Parse body
  const raw = (await req.json().catch(() => null)) as unknown;
  if (!isRecord(raw)) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const workOrderLineId = asString((raw as Body).workOrderLineId);
  if (!workOrderLineId) {
    return NextResponse.json(
      { error: "Missing workOrderLineId" },
      { status: 400 },
    );
  }

  // 2) Auth
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 3) Resolve WO + shop from the line
  const { data: line, error: lineErr } = await supabase
    .from("work_order_lines")
    .select("id, work_order_id, work_orders!inner(shop_id)")
    .eq("id", workOrderLineId)
    .maybeSingle<{
      id: string;
      work_order_id: string | null;
      work_orders: { shop_id: string | null };
    }>();

  if (lineErr) {
    // eslint-disable-next-line no-console
    console.error("[inspections/finalize/pdf] line lookup failed", lineErr);
    return NextResponse.json(
      { error: "Failed to look up work order line" },
      { status: 500 },
    );
  }

  const workOrderId = asString(line?.work_order_id);
  const shopId = asString(line?.work_orders?.shop_id);

  if (!workOrderId) {
    return NextResponse.json(
      { error: "Work order line missing work_order_id" },
      { status: 400 },
    );
  }
  if (!shopId) {
    return NextResponse.json(
      { error: "Work order line missing shop_id" },
      { status: 400 },
    );
  }

  const nowIso = new Date().toISOString();

  // 4) Load inspection summary + ensure canonical inspections row exists
  //    - First try inspections.summary
  //    - Fallback to inspection_sessions.state
  //    - If inspections row doesn't exist, UPSERT it (draft first, then finalize below)

  const { data: insp, error: inspErr } = await supabase
    .from("inspections")
    .select("id, work_order_id, work_order_line_id, summary, pdf_storage_path")
    .eq("work_order_line_id", workOrderLineId)
    .maybeSingle<
      Pick<
        DB["public"]["Tables"]["inspections"]["Row"],
        "id" | "work_order_id" | "work_order_line_id" | "summary" | "pdf_storage_path"
      >
    >();

  if (inspErr) {
    // eslint-disable-next-line no-console
    console.error("[inspections/finalize/pdf] inspections lookup failed", inspErr);
    return NextResponse.json(
      { error: "Failed to load inspection" },
      { status: 500 },
    );
  }

  let summary = (insp?.summary ?? null) as unknown as InspectionSession | null;

  if (!summary) {
    const { data: sess, error: sessErr } = await supabase
      .from("inspection_sessions")
      .select("state")
      .eq("work_order_line_id", workOrderLineId)
      .maybeSingle<{ state: Json | null }>();

    if (sessErr) {
      // eslint-disable-next-line no-console
      console.error("[inspections/finalize/pdf] session lookup failed", sessErr);
      return NextResponse.json(
        { error: "Inspection session missing" },
        { status: 404 },
      );
    }

    summary = (sess?.state ?? null) as unknown as InspectionSession | null;
  }

  if (!summary || typeof summary !== "object") {
    return NextResponse.json(
      { error: "Inspection summary missing/invalid" },
      { status: 400 },
    );
  }

  // ✅ Ensure inspections row exists (UPSERT by work_order_line_id)
  // This makes finalize idempotent and guarantees invoice/email can attach.
  const { data: ensured, error: ensureErr } = await supabase
    .from("inspections")
    .upsert(
      {
        work_order_id: workOrderId,
        work_order_line_id: workOrderLineId,
        shop_id: shopId,
        user_id: user.id,
        summary: summary as unknown as Json,
        // keep it draft until PDF upload succeeds
        is_draft: true,
        completed: false,
        locked: false,
        status: "draft",
        updated_at: nowIso,
      } satisfies DB["public"]["Tables"]["inspections"]["Insert"],
      { onConflict: "work_order_line_id" },
    )
    .select("id, pdf_storage_path")
    .single<{ id: string; pdf_storage_path: string | null }>();

  if (ensureErr || !ensured?.id) {
    // eslint-disable-next-line no-console
    console.error("[inspections/finalize/pdf] inspections upsert failed", ensureErr);
    return NextResponse.json(
      { error: ensureErr?.message ?? "Failed to create inspection record" },
      { status: 500 },
    );
  }

  const inspectionId = ensured.id;

  // 5) Generate PDF
  const pdfBytes = await generateInspectionPDF(summary);

  // 6) Upload to storage
  const bucket = "inspection_pdfs";
  const woPart = safeFilePart(workOrderId);
  const inspPart = safeFilePart(String(inspectionId));
  const linePart = safeFilePart(workOrderLineId);

  const path = `work_orders/${woPart}/inspections/${inspPart}/line_${linePart}.pdf`;

  const { error: uploadErr } = await supabase.storage
    .from(bucket)
    .upload(path, Buffer.from(pdfBytes), {
      contentType: "application/pdf",
      upsert: true,
    });

  if (uploadErr) {
    // eslint-disable-next-line no-console
    console.error("[inspections/finalize/pdf] upload failed", uploadErr);
    return NextResponse.json({ error: uploadErr.message }, { status: 500 });
  }

  // Optional: signed URL for quick-open in UI
  const { data: signed, error: signedErr } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, 60 * 60 * 24 * 30);

  if (signedErr) {
    // eslint-disable-next-line no-console
    console.warn("[inspections/finalize/pdf] createSignedUrl failed", signedErr);
  }

  const nowIso2 = new Date().toISOString();

  // 7) Update inspections record (mark complete + store PDF path/url)
  const { error: updErr } = await supabase
    .from("inspections")
    .update(
      {
        pdf_storage_path: path,
        pdf_url: signed?.signedUrl ?? null,
        locked: true,
        completed: true,
        is_draft: false,
        finalized_at: nowIso2,
        finalized_by: user.id,
        updated_at: nowIso2,
        status: "completed",
      } satisfies DB["public"]["Tables"]["inspections"]["Update"],
    )
    .eq("id", inspectionId);

  if (updErr) {
    // eslint-disable-next-line no-console
    console.error("[inspections/finalize/pdf] inspections update failed", updErr);
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    inspectionId,
    workOrderId,
    workOrderLineId,
    bucket,
    pdf_storage_path: path,
    pdf_url: signed?.signedUrl ?? null,
  });
}