// app/api/inspections/save/route.ts ✅ FULL FILE REPLACEMENT

import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import type { InspectionSession } from "@/features/inspections/lib/inspection/types";

type DB = Database;

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

/**
 * Convert unknown to Supabase Json type safely.
 * - Uses JSON round-trip to guarantee only JSON-serializable structures.
 * - Falls back to null if conversion fails (should be rare).
 */
function toJson<T>(value: unknown): T {
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return null as T;
  }
}

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient<DB>({ cookies });

  // 1) parse body
  const raw = (await req.json().catch(() => null)) as unknown;
  if (!isRecord(raw)) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const workOrderLineId =
    typeof raw.workOrderLineId === "string" ? raw.workOrderLineId : "";
  const session = raw.session as InspectionSession | undefined;

  if (!workOrderLineId || !session) {
    return NextResponse.json(
      { error: "Missing workOrderLineId or session" },
      { status: 400 },
    );
  }

  // 2) auth
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 3) resolve WO + shop from the line (and ensure the line exists)
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
    console.error("[inspections/save] line lookup failed", lineErr);
    return NextResponse.json(
      { error: "Failed to look up work order line" },
      { status: 500 },
    );
  }

  const workOrderId =
    typeof line?.work_order_id === "string" ? line.work_order_id : null;

  const shopId =
    typeof line?.work_orders?.shop_id === "string"
      ? line.work_orders.shop_id
      : null;

  if (!workOrderId) {
    return NextResponse.json(
      { error: "Work order line is missing work_order_id" },
      { status: 400 },
    );
  }

  const nowIso = new Date().toISOString();

  // ---------------------------------------------------------------------------
  // 4) upsert inspection_sessions (this is your “progress save”)
  // ---------------------------------------------------------------------------
  type SessionStateJson = DB["public"]["Tables"]["inspection_sessions"]["Insert"]["state"];

  const sessionStateJson = toJson<SessionStateJson>(session);

  const sessionPayload = {
    work_order_id: workOrderId,
    work_order_line_id: workOrderLineId,
    user_id: user.id,
    state: sessionStateJson,
    updated_at: nowIso,
  } satisfies DB["public"]["Tables"]["inspection_sessions"]["Insert"];

  const { error: upSessionErr } = await supabase
    .from("inspection_sessions")
    .upsert(sessionPayload, { onConflict: "work_order_line_id" });

  if (upSessionErr) {
    // eslint-disable-next-line no-console
    console.error("[inspections/save] session upsert failed", upSessionErr);
    return NextResponse.json({ error: upSessionErr.message }, { status: 500 });
  }

  // ---------------------------------------------------------------------------
  // 5) ALSO upsert a draft inspections row for the SAME WO + line
  //    This is what /finalize/pdf reads (inspections.summary).
  // ---------------------------------------------------------------------------
  type SummaryJson = DB["public"]["Tables"]["inspections"]["Insert"]["summary"];

  const summaryJson = toJson<SummaryJson>(session);

  const inspectionPayload = {
    work_order_id: workOrderId,
    work_order_line_id: workOrderLineId,
    // if shop_id is nullable in your schema, keep null; otherwise you can omit it
    shop_id: shopId,
    user_id: user.id,
    summary: summaryJson,
    is_draft: true,
    completed: false,
    locked: false,
    status: "draft",
    updated_at: nowIso,
  } satisfies DB["public"]["Tables"]["inspections"]["Insert"];

  const { error: upInspectionErr } = await supabase
    .from("inspections")
    .upsert(inspectionPayload, { onConflict: "work_order_line_id" });

  if (upInspectionErr) {
    // eslint-disable-next-line no-console
    console.error("[inspections/save] inspections upsert failed", upInspectionErr);
    // don’t fail progress-save if draft inspection row fails — but tell the client
    return NextResponse.json(
      { ok: true, warning: "Session saved, but inspections draft upsert failed" },
      { status: 200 },
    );
  }

  return NextResponse.json({ ok: true });
}