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
  notes?: string | null; // inspection notes (free text)
  aiSummary?: string | null; // optional AI summary
  complaint?: string | null; // optional explicit complaint override
};

function isValidBody(b: unknown): b is Body {
  if (typeof b !== "object" || b === null) return false;
  const o = b as Record<string, unknown>;
  return (
    typeof o.workOrderId === "string" &&
    typeof o.workOrderLineId === "string"
  );
}

function toNullableTrimmedString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
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

    const {
      workOrderId,
      workOrderLineId,
      laborHours,
      notes,
      aiSummary,
      complaint,
    } = bodyUnknown;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json(
        { error: "Server not configured for Supabase" },
        { status: 500 },
      );
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // Ensure the line belongs to the provided work order (prevents cross-WO updates)
    const { data: existing, error: loadErr } = await supabase
      .from("work_order_lines")
      .select("id, work_order_id, complaint, notes")
      .eq("id", workOrderLineId)
      .maybeSingle();

    if (loadErr) {
      const e = loadErr as PostgrestError;
      return NextResponse.json(
        { error: e.message, details: e.details, hint: e.hint, code: e.code },
        { status: 500 },
      );
    }

    if (!existing) {
      return NextResponse.json({ error: "Work order line not found" }, { status: 404 });
    }

    if (String((existing as { work_order_id?: unknown }).work_order_id) !== workOrderId) {
      return NextResponse.json(
        { error: "Work order line does not belong to the given work order" },
        { status: 400 },
      );
    }

    const update: Record<string, unknown> = {};

    // labor_time update
    if (laborHours === null) {
      update.labor_time = null;
    } else if (typeof laborHours === "number" && !Number.isNaN(laborHours)) {
      update.labor_time = laborHours;
    }

    // We treat "complaint" as: explicit complaint OR inspection notes (fallback)
    const complaintValue =
      toNullableTrimmedString(complaint) ?? toNullableTrimmedString(notes);

    // Only set complaint if we have something meaningful
    if (complaintValue !== null) {
      update.complaint = complaintValue;
    }

    // Notes: keep advisor context and AI summary compact
    // (If you prefer to overwrite notes entirely, change this behavior.)
    const nextNotesParts: string[] = [];

    const n = toNullableTrimmedString(notes);
    if (n) nextNotesParts.push(`From inspection: ${n}`);

    const s = toNullableTrimmedString(aiSummary);
    if (s) nextNotesParts.push(`AI: ${s}`);

    if (nextNotesParts.length > 0) {
      update.notes = nextNotesParts.join(" • ");
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ ok: true, updated: false });
    }

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