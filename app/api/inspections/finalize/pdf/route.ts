// app/api/inspections/finalize/pdf/route.ts ✅ FULL FILE REPLACEMENT

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

  const body = raw as Body;
  const workOrderLineId = asString(body.workOrderLineId);
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

  // 4) Find the inspection record (latest for WO)
  const { data: insp, error: inspErr } = await supabase
    .from("inspections")
    .select("id, work_order_id, vehicle_id, user_id, summary, pdf_storage_path, shop_id, created_at")
    .eq("work_order_id", line.work_order_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (inspErr) {
    console.error("[inspections/finalize/pdf] inspections lookup failed", inspErr);
    return NextResponse.json({ error: "Failed to load inspection" }, { status: 500 });
  }
  if (!insp?.id) {
    return NextResponse.json({ error: "No inspection found for work order" }, { status: 404 });
  }

  const session = insp.summary as unknown as InspectionSession | null;
  if (!session || typeof session !== "object") {
    return NextResponse.json(
      { error: "Inspection summary missing/invalid" },
      { status: 400 },
    );
  }

  // 5) Generate PDF bytes (session-based)
  const pdfBytes = await generateInspectionPDF(session);

  // 6) Upload to storage
  const bucket = "inspection_pdfs";

  const woPart = safeFilePart(String(line.work_order_id));
  const inspPart = safeFilePart(String(insp.id));
  const linePart = safeFilePart(String(workOrderLineId));

  const path = `work_orders/${woPart}/inspections/${inspPart}/line_${linePart}.pdf`;

  const { error: uploadErr } = await supabase.storage
    .from(bucket)
    .upload(path, Buffer.from(pdfBytes), {
      contentType: "application/pdf",
      upsert: true,
    });

  if (uploadErr) {
    console.error("[inspections/finalize/pdf] upload failed", uploadErr);
    return NextResponse.json({ error: uploadErr.message }, { status: 500 });
  }

  const { data: signed, error: signedErr } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, 60 * 60 * 24 * 30);

  if (signedErr) {
    console.warn("[inspections/finalize/pdf] signed url failed", signedErr.message);
  }

  const nowIso = new Date().toISOString();

  // 7) Update inspection record
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
    })
    .eq("id", insp.id);

  if (updErr) {
    console.error("[inspections/finalize/pdf] inspections update failed", updErr);
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    inspectionId: insp.id,
    workOrderId: line.work_order_id,
    bucket,
    pdf_storage_path: path,
    pdf_url: signed?.signedUrl ?? null,
  });
}