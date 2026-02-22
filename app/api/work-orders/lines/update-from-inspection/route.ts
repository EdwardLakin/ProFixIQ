// app/api/work-orders/lines/update-from-inspection/route.ts (FULL FILE REPLACEMENT)
// Fixes: "'Body' is defined but never used" + keeps strict parsing (no `any`)

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type Body = {
  workOrderId: string;
  workOrderLineId: string;
  laborHours: number | null;
  notes: string | null;
  aiSummary?: string | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}
function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function normalizeBody(raw: unknown): {
  workOrderId: string | null;
  workOrderLineId: string | null;
  laborHours: number | null;
  notes: string | null;
  aiSummary: string | null;
} {
  // ✅ Use Body type so it isn't "declared but never used"
  const b = (raw ?? null) as Partial<Body> | null;

  const workOrderId = asString(b?.workOrderId);
  const workOrderLineId = asString(b?.workOrderLineId);

  // allow explicit null; otherwise parse number/string
  const laborHours =
    b?.laborHours === null ? null : asNumber(b?.laborHours ?? null);

  // allow explicit null; otherwise parse string
  const notes = b?.notes === null ? null : asString(b?.notes ?? null);

  // undefined -> null; null -> null; string -> trimmed string|null
  const aiSummary =
    b?.aiSummary === undefined || b?.aiSummary === null
      ? null
      : asString(b.aiSummary);

  return { workOrderId, workOrderLineId, laborHours, notes, aiSummary };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const bodyUnknown: unknown = await req.json().catch(() => null);
    if (!isRecord(bodyUnknown)) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { workOrderId, workOrderLineId, laborHours, notes, aiSummary } =
      normalizeBody(bodyUnknown);

    if (!workOrderId) {
      return NextResponse.json({ error: "Missing workOrderId" }, { status: 400 });
    }
    if (!workOrderLineId) {
      return NextResponse.json(
        { error: "Missing workOrderLineId" },
        { status: 400 },
      );
    }

    const supabase = createRouteHandlerClient<DB>({ cookies });

    // auth
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // load existing line so we can validate ownership + keep existing notes if needed
    const { data: line, error: lineErr } = await supabase
      .from("work_order_lines")
      .select("id, work_order_id, notes")
      .eq("id", workOrderLineId)
      .maybeSingle();

    if (lineErr) {
      return NextResponse.json({ error: lineErr.message }, { status: 500 });
    }
    if (!line?.id) {
      return NextResponse.json({ error: "Line not found" }, { status: 404 });
    }

    if (String(line.work_order_id) !== workOrderId) {
      return NextResponse.json(
        { error: "Line does not belong to work order" },
        { status: 400 },
      );
    }

    const existingNotes = typeof line.notes === "string" ? line.notes : null;

    const mergedNotes = [
      notes && notes.trim() ? notes.trim() : null,
      aiSummary && aiSummary.trim() ? `AI: ${aiSummary.trim()}` : null,
    ]
      .filter((x): x is string => Boolean(x))
      .join(" • ");

    const finalNotes = mergedNotes || existingNotes || null;

    const { error: updErr } = await supabase
      .from("work_order_lines")
      .update({
        labor_time: laborHours,
        notes: finalNotes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", workOrderLineId);

    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}