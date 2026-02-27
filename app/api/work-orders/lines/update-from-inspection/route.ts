// /app/api/work-orders/lines/update-from-inspection/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import "server-only";

import { NextResponse } from "next/server";
import { createClient, type PostgrestError } from "@supabase/supabase-js";

type Body = {
  workOrderId: string;
  workOrderLineId: string;

  laborHours?: number | null;

  // ✅ allow client to pass complaint explicitly
  complaint?: string | null;

  // inspection note (free text)
  notes?: string | null;

  // optional AI summary
  aiSummary?: string | null;
};

function isValidBody(b: unknown): b is Body {
  if (typeof b !== "object" || b === null) return false;
  const o = b as Record<string, unknown>;
  return typeof o.workOrderId === "string" && typeof o.workOrderLineId === "string";
}

function trimOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && !Number.isNaN(v);
}

export async function POST(req: Request) {
  try {
    const bodyUnknown: unknown = await req.json();
    if (!isValidBody(bodyUnknown)) {
      return NextResponse.json(
        { error: "Invalid body: require workOrderId, workOrderLineId" },
        { status: 400 },
      );
    }

    const { workOrderId, workOrderLineId, laborHours, complaint, notes, aiSummary } =
      bodyUnknown;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ error: "Server not configured for Supabase" }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // ✅ Ensure line exists + belongs to WO (prevents cross-WO updates)
    const { data: line, error: loadErr } = await supabase
      .from("work_order_lines")
      .select("id, work_order_id, status, approval_state, punchable")
      .eq("id", workOrderLineId)
      .maybeSingle();

    if (loadErr) {
      const e = loadErr as PostgrestError;
      return NextResponse.json(
        { error: e.message, details: e.details, hint: e.hint, code: e.code },
        { status: 500 },
      );
    }
    if (!line) {
      return NextResponse.json({ error: "Work order line not found" }, { status: 404 });
    }
    if (String((line as { work_order_id?: unknown }).work_order_id) !== workOrderId) {
      return NextResponse.json(
        { error: "Work order line does not belong to the given work order" },
        { status: 400 },
      );
    }

    const update: Record<string, unknown> = {};

    // labor_time is numeric in DB; supabase-js accepts number
    if (laborHours === null) {
      update.labor_time = null;
    } else if (isFiniteNumber(laborHours)) {
      update.labor_time = laborHours;
    }

    const complaintClean = trimOrNull(complaint);
    const noteClean = trimOrNull(notes);
    const summaryClean = trimOrNull(aiSummary);

    // ✅ complaint precedence:
    // 1) explicit complaint
    // 2) notes
    if (complaintClean) update.complaint = complaintClean;
    else if (noteClean) update.complaint = noteClean;

    // notes: store compact context (don’t overwrite advisor notes unless you want to)
    if (noteClean || summaryClean) {
      const parts: string[] = [];
      if (noteClean) parts.push(`From inspection: ${noteClean}`);
      if (summaryClean) parts.push(`AI: ${summaryClean}`);
      update.notes = parts.join(" • ");
    }

    // ✅ Keep it non-punchable until approved (matches your “quote line” rule)
    update.status = "awaiting_approval";
    update.approval_state = "pending";
    update.punchable = false;

    const { error: updErr } = await supabase
      .from("work_order_lines")
      .update(update)
      .eq("id", workOrderLineId);

    if (updErr) {
      const e = updErr as PostgrestError;
      return NextResponse.json(
        { error: e.message, details: e.details, hint: e.hint, code: e.code },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, updated: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}