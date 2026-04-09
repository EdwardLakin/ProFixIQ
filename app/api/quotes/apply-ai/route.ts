// app/api/quotes/apply-ai/route.ts (FULL FILE REPLACEMENT)


import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { recordQuoteTraining } from "@/features/integrations/ai";
import { maybeRefreshPricingSnapshotForLine } from "@/features/work-orders/server/maybeRefreshPricingSnapshotForLine";
import { logOperationalEvent } from "@/features/work-orders/server/logOperationalEvent";

type DB = Database;

/* -------------------------- AI Suggestion Types -------------------------- */

type AISuggestion = {
  parts: { name: string; qty?: number; cost?: number; notes?: string }[];
  laborHours: number;
  laborRate: number;
  summary: string;
  confidence: "low" | "medium" | "high";
  price?: number;
  notes?: string;
  title?: string;
};

type Body = {
  workOrderLineId: string;
  suggestion: AISuggestion;
};

function isBody(x: unknown): x is Body {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;

  const suggestion = o.suggestion;
  const parts =
    typeof suggestion === "object" &&
    suggestion !== null &&
    Array.isArray((suggestion as Record<string, unknown>).parts);

  return typeof o.workOrderLineId === "string" && parts;
}

function safeQty(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return 1;
  return v > 0 ? v : 1;
}

function getSupabaseEnv(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) return null;
  return { url, key };
}

/* ----------------- Resolve shop + primary inventory location ---------------- */

async function resolveShopAndPrimaryLocationId(
  sb: SupabaseClient<DB>,
  workOrderLineId: string,
): Promise<{ shopId: string; locationId: string; beforeLine: {
  id: string;
  price_estimate: number | null;
  labor_time: number | null;
  status: string | null;
  approval_state: string | null;
} | null } | null> {
  const { data: line, error: lineErr } = await sb
    .from("work_order_lines")
    .select("id, shop_id, price_estimate, labor_time, status, approval_state")
    .eq("id", workOrderLineId)
    .maybeSingle();

  if (lineErr) return null;

  const shopId = typeof line?.shop_id === "string" ? line.shop_id : null;
  const beforeLine = line
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
    : null;
  if (!shopId) return null;

  const { data: locs, error: locErr } = await sb
    .from("inventory_locations")
    .select("id, is_primary")
    .eq("shop_id", shopId)
    .order("is_primary", { ascending: false })
    .limit(1);

  if (locErr) return null;

  const locationId = typeof locs?.[0]?.id === "string" ? locs[0].id : null;
  if (!locationId) return null;

  return { shopId, locationId, beforeLine };
}

/* ---------------------------------- Route ---------------------------------- */

export async function POST(req: Request) {
  try {
    const body: unknown = await req.json();
    if (!isBody(body)) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { workOrderLineId, suggestion } = body;

    const env = getSupabaseEnv();
    if (!env) {
      return NextResponse.json(
        {
          error: "Server misconfiguration — Supabase env missing",
          detail:
            "Check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY).",
        },
        { status: 500 },
      );
    }

    const sb = createClient<DB>(env.url, env.key);

    // Require shop + primary inventory location (prevents FK errors on allocations)
    const resolved = await resolveShopAndPrimaryLocationId(sb, workOrderLineId);
    if (!resolved) {
      return NextResponse.json(
        {
          error: "Missing shop or inventory location 이해",
          detail: "This line must have a shop_id, and the shop must have a primary inventory location.",
          code: "NO_LOCATION_CONFIGURED",
        },
        { status: 422 },
      );
    }

    const { shopId, locationId } = resolved;

    const unmatched: { name: string; qty: number }[] = [];

    // Allocate each AI-suggested part to this line
    const partsList = Array.isArray(suggestion.parts) ? suggestion.parts : [];
    for (const p of partsList) {
      const name = typeof p?.name === "string" ? p.name.trim() : "";
      const qty = safeQty(p?.qty);

      if (!name) {
        unmatched.push({ name: "(missing name)", qty });
        continue;
      }

      const { data: found, error: pe } = await sb
        .from("parts")
        .select("id")
        .ilike("name", `%${name}%`)
        .limit(1);

      if (pe) {
        unmatched.push({ name, qty });
        continue;
      }

      const match = found?.[0];
      if (!match?.id) {
        unmatched.push({ name, qty });
        continue;
      }

      const alloc: DB["public"]["Tables"]["work_order_part_allocations"]["Insert"] = {
        shop_id: shopId, // ✅ REQUIRED by your DB types
        work_order_line_id: workOrderLineId,
        part_id: match.id,
        qty,
        location_id: locationId,
      };

      const { error: ae } = await sb.from("work_order_part_allocations").insert(alloc);

      if (ae) {
        unmatched.push({ name, qty });
        continue;
      }
    }

    // Mark as "quoted" flow started (keep workflow status; set approval_state)
    const { data: afterLine, error: updateErr } = await sb
      .from("work_order_lines")
      .update({ approval_state: "pending" })
      .eq("id", workOrderLineId)
      .select("id, price_estimate, labor_time, status, approval_state")
      .maybeSingle();

    if (updateErr) {
      return NextResponse.json(
        { error: "Failed updating approval state", detail: updateErr.message },
        { status: 500 },
      );
    }

    // ------------------------ AI TRAINING: APPLIED QUOTE ------------------------
    try {
      const { data: line } = await sb
        .from("work_order_lines")
        .select("id, work_order_id, shop_id, description, complaint")
        .eq("id", workOrderLineId)
        .maybeSingle();

      const lineShopId = typeof line?.shop_id === "string" ? line.shop_id : null;

      if (lineShopId) {
        await recordQuoteTraining({
          quoteId: workOrderLineId, // treat the line as the "quote" record
          shopId: lineShopId,
          workOrderId: line?.work_order_id ?? null,
          workOrderLineId,
          vehicleYmm: null, // TODO: hydrate via vehicles table
          payload: {
            complaint: line?.complaint ?? null,
            description: line?.description ?? null,
            suggestion,
            unmatched,
          },
        });
      }
    } catch (trainErr: unknown) {
      // Never block user flow on training errors
      // eslint-disable-next-line no-console
      console.warn("AI training for apply-ai quote failed:", trainErr);
    }

    await maybeRefreshPricingSnapshotForLine({
      supabase: sb,
      userId: "system_apply_ai",
      before: resolved.beforeLine ?? null,
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
      quoteSource: "quote_apply_ai",
      quoteReference: workOrderLineId,
    });

    await logOperationalEvent({
      supabase: sb,
      event: "work_order_parts_allocated_from_quote_ai",
      actorId: "system_apply_ai",
      entityType: "work_order_line",
      entityId: workOrderLineId,
      details: {
        shop_id: shopId,
        suggested_parts_count: partsList.length,
        unmatched_parts_count: unmatched.length,
      },
    });

    return NextResponse.json({ ok: true, unmatched });
  } catch (e: unknown) {
    // eslint-disable-next-line no-console
    console.error("apply-ai Quote Error 👉", e);
    return NextResponse.json({ error: "Failed applying AI quote" }, { status: 500 });
  }
}
