import "server-only";

export const runtime = "nodejs";

import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

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
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const body = raw as Body;
  const workOrderLineId = asString(body.workOrderLineId);
  if (!workOrderLineId) {
    return NextResponse.json({ ok: false, error: "Missing workOrderLineId" }, { status: 400 });
  }

  // 2) Auth
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // 3) Resolve WO id from the line
  const { data: line, error: lineErr } = await supabase
    .from("work_order_lines")
    .select("id, work_order_id")
    .eq("id", workOrderLineId)
    .maybeSingle();

  if (lineErr) {
    // eslint-disable-next-line no-console
    console.error("[inspections/finalize/pdf] line lookup failed", lineErr);
    return NextResponse.json({ ok: false, error: "Failed to look up work order line" }, { status: 500 });
  }
  if (!line?.work_order_id) {
    return NextResponse.json({ ok: false, error: "Work order line missing work_order_id" }, { status: 400 });
  }

  const workOrderId = String(line.work_order_id);

  // 4) Load the *saved draft session* from inspection_sessions (preferred source)
  const { data: sessionRow, error: sessErr } = await supabase
    .from("inspection_sessions")
    .select("id, work_order_id, work_order_line_id, state, updated_at")
    .eq("work_order_line_id", workOrderLineId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (sessErr) {
    // eslint-disable-next-line no-console
    console.error("[inspections/finalize/pdf] inspection_sessions lookup failed", sessErr);
    return NextResponse.json({ ok: false, error: "Failed to load saved inspection session" }, { status: 500 });
  }

  const sessionFromDraft = (sessionRow?.state ?? null) as InspectionSession | null;

  // 5) Find the inspection record (latest for WO) (used for pdf_storage_path + finalize flags)
  // NOTE: If you have inspections.work_order_line_id, you should change this query to filter by line.
  const { data: insp, error: inspErr } = await supabase
    .from("inspections")
    .select("id, work_order_id, work_order_line_id, summary, pdf_storage_path, created_at")
    .eq("work_order_id", workOrderId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (inspErr) {
    // eslint-disable-next-line no-console
    console.error("[inspections/finalize/pdf] inspections lookup failed", inspErr);
    return NextResponse.json({ ok: false, error: "Failed to load inspection" }, { status: 500 });
  }
  if (!insp?.id) {
    return NextResponse.json({ ok: false, error: "No inspection found for work order" }, { status: 404 });
  }

  // 6) Choose session data for PDF generation
  // Priority:
  //   A) inspection_sessions.state (your Save Progress writes here)
  //   B) inspections.summary fallback (legacy / older flow)
  const sessionFallback = (insp.summary ?? null) as InspectionSession | null;
  const session: InspectionSession | null =
    (sessionFromDraft && typeof sessionFromDraft === "object" ? sessionFromDraft : null) ??
    (sessionFallback && typeof sessionFallback === "object" ? sessionFallback : null);

  if (!session) {
    return NextResponse.json(
      { ok: false, error: "No valid inspection session found (saved session missing and inspection.summary invalid)." },
      { status: 400 },
    );
  }

  // 7) Generate PDF bytes (session-based)
  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await generateInspectionPDF(session);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[inspections/finalize/pdf] generateInspectionPDF failed", e);
    return NextResponse.json({ ok: false, error: "Failed to generate inspection PDF" }, { status: 500 });
  }

  // 8) Upload to storage
  // Keep your bucket name, just make sure it exists in Supabase Storage.
  const bucket = "inspection_pdfs";

  const woPart = safeFilePart(workOrderId);
  const inspPart = safeFilePart(String(insp.id));
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
    return NextResponse.json(
      { ok: false, error: `PDF upload failed: ${uploadErr.message}` },
      { status: 500 },
    );
  }

  // Signed URL (30 days)
  const { data: signed, error: signedErr } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, 60 * 60 * 24 * 30);

  if (signedErr) {
    // eslint-disable-next-line no-console
    console.warn("[inspections/finalize/pdf] signed url failed", signedErr.message);
  }

  const nowIso = new Date().toISOString();

  // 9) Update inspection record
  // If you DO have inspections.work_order_line_id, this also helps keep things aligned.
  const updatePayload: DB["public"]["Tables"]["inspections"]["Update"] = {
    pdf_storage_path: path,
    pdf_url: signed?.signedUrl ?? null,
    locked: true,
    completed: true,
    is_draft: false,
    finalized_at: nowIso,
    finalized_by: user.id,
    updated_at: nowIso,
    status: "completed",
    ...(typeof (insp as unknown as { work_order_line_id?: unknown }).work_order_line_id !== "undefined"
      ? { work_order_line_id: workOrderLineId }
      : {}),
  };

  const { error: updErr } = await supabase
    .from("inspections")
    .update(updatePayload)
    .eq("id", insp.id);

  if (updErr) {
    // eslint-disable-next-line no-console
    console.error("[inspections/finalize/pdf] inspections update failed", updErr);
    return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    inspectionId: insp.id,
    workOrderId,
    bucket,
    pdf_storage_path: path,
    pdf_url: signed?.signedUrl ?? null,
    source: sessionFromDraft ? "inspection_sessions" : "inspections.summary",
  });
}