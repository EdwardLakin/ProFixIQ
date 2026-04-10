// /app/api/work-orders/lines/update-from-inspection/route.ts (FULL FILE REPLACEMENT)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import "server-only";

import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { canMutateWorkOrders } from "@/features/shared/lib/rbac";
import { createClient, type PostgrestError } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { maybeRefreshPricingSnapshotForLine } from "@/features/work-orders/server/maybeRefreshPricingSnapshotForLine";
import {
  canTransitionWorkOrderLineStatus,
  getWorkOrderLineTransitionError,
  normalizeWorkOrderLineStatus,
} from "@/features/work-orders/lib/line-status";

type DB = Database;

type Body = {
  workOrderId: string;
  workOrderLineId: string;

  laborHours?: number | null;

  // allow client to pass complaint explicitly
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
      return NextResponse.json(
        { error: "Server not configured for Supabase" },
        { status: 500 },
      );
    }

    const supabase = createClient<DB>(supabaseUrl, serviceKey);

    const actor = createServerSupabaseRoute();
    const {
      data: { user },
      error: userErr,
    } = await actor.auth.getUser();

    if (userErr) {
      return NextResponse.json({ error: userErr.message }, { status: 500 });
    }
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Ensure line exists + belongs to WO (prevents cross-WO updates)
    const { data: line, error: loadErr } = await supabase
      .from("work_order_lines")
      .select("id, work_order_id, shop_id, status, approval_state, punchable, price_estimate, labor_time")
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


    const { data: me, error: meErr } = await actor
      .from("profiles")
      .select("id, role, shop_id")
      .eq("id", user.id)
      .maybeSingle();

    if (meErr || !me) {
      return NextResponse.json({ error: "Unable to load actor profile" }, { status: 403 });
    }
    if (!canMutateWorkOrders(me.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!me.shop_id || me.shop_id !== (line as { shop_id?: string | null }).shop_id) {
      return NextResponse.json({ error: "Cross-shop access denied" }, { status: 403 });
    }

    const currentStatus = normalizeWorkOrderLineStatus(line.status);
    if (!canTransitionWorkOrderLineStatus(currentStatus, "awaiting_approval")) {
      return NextResponse.json(
        { error: getWorkOrderLineTransitionError(currentStatus, "awaiting_approval") },
        { status: 409 },
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

    // complaint precedence:
    // 1) explicit complaint
    // 2) notes
    if (complaintClean) update.complaint = complaintClean;
    else if (noteClean) update.complaint = noteClean;

    // notes: store compact context
    if (noteClean || summaryClean) {
      const parts: string[] = [];
      if (noteClean) parts.push(`From inspection: ${noteClean}`);
      if (summaryClean) parts.push(`AI: ${summaryClean}`);
      update.notes = parts.join(" • ");
    }

    // Keep it non-punchable until approved
    update.status = "awaiting_approval";
    update.approval_state = "pending";
    update.punchable = false;

    const { data: afterLine, error: updErr } = await supabase
      .from("work_order_lines")
      .update(update)
      .eq("id", workOrderLineId)
      .select("id, price_estimate, labor_time, status, approval_state")
      .maybeSingle();

    if (updErr) {
      const e = updErr as PostgrestError;
      return NextResponse.json(
        { error: e.message, details: e.details, hint: e.hint, code: e.code },
        { status: 500 },
      );
    }

    await maybeRefreshPricingSnapshotForLine({
      supabase,
      userId: "system_inspection_update",
      before: line
        ? {
            id: String(line.id),
            price_estimate:
              typeof (line as { price_estimate?: unknown }).price_estimate === "number"
                ? ((line as { price_estimate: number }).price_estimate)
                : null,
            labor_time:
              typeof (line as { labor_time?: unknown }).labor_time === "number"
                ? ((line as { labor_time: number }).labor_time)
                : null,
            status:
              typeof (line as { status?: unknown }).status === "string"
                ? ((line as { status: string }).status)
                : null,
            approval_state:
              typeof (line as { approval_state?: unknown }).approval_state === "string"
                ? ((line as { approval_state: string }).approval_state)
                : null,
          }
        : null,
      after: afterLine
        ? {
            id: String(afterLine.id),
            price_estimate:
              typeof (afterLine as { price_estimate?: unknown }).price_estimate === "number"
                ? ((afterLine as { price_estimate: number }).price_estimate)
                : null,
            labor_time:
              typeof (afterLine as { labor_time?: unknown }).labor_time === "number"
                ? ((afterLine as { labor_time: number }).labor_time)
                : null,
            status:
              typeof (afterLine as { status?: unknown }).status === "string"
                ? ((afterLine as { status: string }).status)
                : null,
            approval_state:
              typeof (afterLine as { approval_state?: unknown }).approval_state === "string"
                ? ((afterLine as { approval_state: string }).approval_state)
                : null,
          }
        : null,
      quoteSource: "inspection_update",
      quoteReference: workOrderLineId,
    });

    return NextResponse.json({ ok: true, updated: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
