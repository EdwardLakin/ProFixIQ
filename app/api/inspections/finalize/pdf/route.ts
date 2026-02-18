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

  // 3) Resolve WO id from the line
  const { data: line, error: lineErr } = await supabase
    .from("work_order_lines")
    .select("id, work_order_id")
    .eq("id", workOrderLineId)
    .maybeSingle();

  if (lineErr) {
    // eslint-disable-next-line no-console
    console.error("[inspections/finalize/pdf] line lookup failed", lineErr);
    return NextResponse.json(
      { error: "Failed to look up work order line" },
      { status: 500 },
    );
  }
  if (!line?.work_order_id) {
    return NextResponse.json(
      { error: "Work order line missing work_order_id" },
      { status: 400 },
    );
  }

  const workOrderId = line.work_order_id;

  // 4) Prefer the inspection record for THIS LINE (not “latest for WO”)
  const { data: inspByLine, error: inspLineErr } = await supabase
    .from("inspections")
    .select(
      "id, work_order_id, work_order_line_id, summary, pdf_storage_path, shop_id, created_at, finalized_at",
    )
    .eq("work_order_line_id", workOrderLineId)
    .maybeSingle();

  if (inspLineErr) {
    // eslint-disable-next-line no-console
    console.error("[inspections/finalize/pdf] inspection-by-line lookup failed", inspLineErr);
    return NextResponse.json(
      { error: "Failed to load inspection for this line" },
      { status: 500 },
    );
  }

  // Fallback: if no line-specific inspection exists, use latest by WO
  const { data: inspByWo, error: inspWoErr } = !inspByLine?.id
    ? await supabase
        .from("inspections")
        .select(
          "id, work_order_id, work_order_line_id, summary, pdf_storage_path, shop_id, created_at, finalized_at",
        )
        .eq("work_order_id", workOrderId)
        .order("finalized_at", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null, error: null };

  if (inspWoErr) {
    // eslint-disable-next-line no-console
    console.error("[inspections/finalize/pdf] inspection-by-wo lookup failed", inspWoErr);
    return NextResponse.json({ error: "Failed to load inspection" }, { status: 500 });
  }

  const insp = (inspByLine?.id ? inspByLine : inspByWo) as
    | {
        id: string;
        work_order_id: string;
        work_order_line_id: string | null;
        summary: unknown;
        pdf_storage_path: string | null;
        shop_id: string | null;
        created_at: string | null;
        finalized_at: string | null;
      }
    | null;

  // If inspections row is missing, fallback to inspection_sessions.state
  let session: InspectionSession | null = null;

  if (insp?.summary && typeof insp.summary === "object") {
    session = insp.summary as InspectionSession;
  } else {
    const { data: sess, error: sessErr } = await supabase
      .from("inspection_sessions")
      .select("id, state")
      .eq("work_order_line_id", workOrderLineId)
      .maybeSingle<{ id: string; state: unknown }>();

    if (sessErr) {
      // eslint-disable-next-line no-console
      console.error("[inspections/finalize/pdf] inspection_sessions lookup failed", sessErr);
    }

    if (sess?.state && typeof sess.state === "object") {
      session = sess.state as InspectionSession;
    }
  }

  if (!session) {
    return NextResponse.json(
      { error: "No inspection data found (missing inspections.summary and inspection_sessions.state)" },
      { status: 404 },
    );
  }

  // 5) Generate PDF bytes (session-based)
  const pdfBytes = await generateInspectionPDF(session);

  // 6) Upload to storage
  const bucket = "inspection_pdfs";
  const woPart = safeFilePart(String(workOrderId));
  const inspPart = safeFilePart(String(insp?.id ?? "no_inspection_row"));
  const linePart = safeFilePart(String(workOrderLineId));

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

  const { data: signed, error: signedErr } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, 60 * 60 * 24 * 30);

  if (signedErr) {
    // eslint-disable-next-line no-console
    console.warn("[inspections/finalize/pdf] signed url failed", signedErr.message);
  }

  const nowIso = new Date().toISOString();

  // 7) Update inspections row if we have one
  if (insp?.id) {
    const { error: updErr } = await supabase
      .from("inspections")
      .update({
        pdf_storage_path: path,
        pdf_url: signed?.signedUrl ?? null,
        locked: true,
        completed: true,
        is_draft: false,
        finalized_at: nowIso,
        finalized_by: user.id,
        updated_at: nowIso,
        status: "completed",
        // ensure latest session is stored on finalize too
        summary: session as unknown as Record<string, unknown>,
      })
      .eq("id", insp.id);

    if (updErr) {
      // eslint-disable-next-line no-console
      console.error("[inspections/finalize/pdf] inspections update failed", updErr);
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({
    ok: true,
    inspectionId: insp?.id ?? null,
    workOrderId,
    bucket,
    pdf_storage_path: path,
    pdf_url: signed?.signedUrl ?? null,
  });
}