// app/api/inspections/save/route.ts ✅ FULL FILE REPLACEMENT

import "server-only";

export const runtime = "nodejs";

import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database, Json } from "@shared/types/types/supabase";
import type { InspectionSession } from "@/features/inspections/lib/inspection/types";

type DB = Database;

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

function asString(x: unknown): string | null {
  return typeof x === "string" && x.trim().length ? x.trim() : null;
}

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient<DB>({ cookies });

  // 1) parse body
  const raw = (await req.json().catch(() => null)) as unknown;
  if (!isRecord(raw)) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const workOrderLineId = asString(raw.workOrderLineId);
  const session = (raw.session ?? null) as InspectionSession | null;

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
    console.error("[inspections/save] line lookup failed", lineErr);
    return NextResponse.json(
      { error: "Failed to look up work order line" },
      { status: 500 },
    );
  }

  const workOrderId = asString(line?.work_order_id);
  const shopId = asString(line?.work_orders?.shop_id);

  if (!workOrderId) {
    return NextResponse.json(
      { error: "Work order line is missing work_order_id" },
      { status: 400 },
    );
  }
  if (!shopId) {
    return NextResponse.json(
      { error: "Work order line is missing shop_id (via work order)" },
      { status: 400 },
    );
  }

  const nowIso = new Date().toISOString();

  // NOTE: Supabase Json type wants a JSON-compatible value.
  const sessionJson = session as unknown as Json;

  // 4) upsert inspection_sessions (progress save)
  const sessionPayload = {
    work_order_id: workOrderId,
    work_order_line_id: workOrderLineId,
    user_id: user.id,
    state: sessionJson,
    updated_at: nowIso,
  } satisfies DB["public"]["Tables"]["inspection_sessions"]["Insert"];

  const { error: upSessionErr } = await supabase
    .from("inspection_sessions")
    .upsert(sessionPayload, { onConflict: "work_order_line_id" });

  if (upSessionErr) {
    console.error("[inspections/save] session upsert failed", upSessionErr);
    return NextResponse.json({ error: upSessionErr.message }, { status: 500 });
  }

  // 5) ALSO upsert a draft inspections row for SAME WO + line
  //    This is what finalize/pdf reads: inspections.summary
  const inspectionPayload = {
    work_order_id: workOrderId,
    work_order_line_id: workOrderLineId,
    shop_id: shopId,
    user_id: user.id,
    summary: sessionJson,
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
    console.error("[inspections/save] inspections upsert failed", upInspectionErr);
    // don’t fail progress-save if draft inspection row fails — but tell the client
    return NextResponse.json(
      { ok: true, warning: "Session saved, but inspections draft upsert failed" },
      { status: 200 },
    );
  }

  return NextResponse.json({ ok: true });
}