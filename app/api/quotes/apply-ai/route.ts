import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { recordQuoteTraining } from "@/features/integrations/ai";

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

interface Body {
  workOrderLineId: string;
  suggestion: AISuggestion;
}

function isBody(x: unknown): x is Body {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.workOrderLineId === "string" &&
    typeof o.suggestion === "object" &&
    o.suggestion !== null
  );
}

/* ----------------- Resolve a shop's primary inventory location ---------------- */

async function resolvePrimaryLocationId(
  sb: SupabaseClient<DB>,
  workOrderLineId: string,
): Promise<string | null> {
  const { data: line } = await sb
    .from("work_order_lines")
    .select("shop_id")
    .eq("id", workOrderLineId)
    .maybeSingle();

  if (!line?.shop_id) return null;

  const { data: locs } = await sb
    .from("inventory_locations")
    .select("id, is_primary")
    .eq("shop_id", line.shop_id)
    .order("is_primary", { ascending: false }) // primary first
    .limit(1);

  return locs?.[0]?.id ?? null;
}

/* ---------------------------------- Route ---------------------------------- */

export async function POST(req: Request) {
  try {
    const body: unknown = await req.json();
    if (!isBody(body)) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { workOrderLineId, suggestion } = body;

    // Env: server key only (non-null)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey =
      (process.env.SUPABASE_SERVICE_ROLE_KEY ??
        process.env.SUPABASE_SERVICE_KEY)!;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        {
          error: "Server misconfiguration — Supabase env missing",
          detail:
            "Check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY).",
        },
        { status: 500 },
      );
    }

    const sb = createClient<DB>(supabaseUrl, supabaseKey);

    // Require an inventory location (prevents FK errors on allocations)
    const locationId = await resolvePrimaryLocationId(sb, workOrderLineId);
    if (!locationId) {
      return NextResponse.json(
        {
          error: "This shop has no inventory location configured.",
          detail: "Create a primary inventory location first.",
          code: "NO_LOCATION_CONFIGURED",
        },
        { status: 422 },
      );
    }

    const unmatched: { name: string; qty: number }[] = [];

    // Allocate each AI-suggested part to this line
    for (const { name, qty = 1 } of suggestion.parts ?? []) {
      const { data: found, error: pe } = await sb
        .from("parts")
        .select("id")
        // use % for ilike match; if you prefer exact, change to .eq("name", name)
        .ilike("name", `%${name}%`)
        .limit(1);

      if (pe) {
        unmatched.push({ name, qty });
        continue;
      }

      const match = found?.[0];
      if (!match) {
        unmatched.push({ name, qty });
        continue;
      }

      const alloc: DB["public"]["Tables"]["work_order_part_allocations"]["Insert"] =
        {
          work_order_line_id: workOrderLineId,
          part_id: match.id,
          qty,
          location_id: locationId, // required by FK; we resolved above
        };

      const { error: ae } = await sb
        .from("work_order_part_allocations")
        .insert(alloc);

      if (ae) {
        unmatched.push({ name, qty });
        continue;
      }
    }

    // Mark as "quoted" flow started (keep workflow status; set approval_state)
    const { error: updateErr } = await sb
      .from("work_order_lines")
      .update({ approval_state: "pending" })
      .eq("id", workOrderLineId);

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

      if (line?.shop_id) {
        await recordQuoteTraining({
          quoteId: workOrderLineId, // treat the line as the "quote" record
          shopId: line.shop_id,
          workOrderId: line.work_order_id ?? null,
          workOrderLineId,
          vehicleYmm: null, // TODO: hydrate via vehicles table
          payload: {
            complaint: line.complaint,
            description: line.description,
            suggestion,
            unmatched,
          },
        });
      }
    } catch (trainErr) {
      // Never block user flow on training errors
      // eslint-disable-next-line no-console
      console.warn("AI training for apply-ai quote failed:", trainErr);
    }

    return NextResponse.json({ ok: true, unmatched });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("apply-ai Quote Error 👉", e);
    return NextResponse.json(
      { error: "Failed applying AI quote" },
      { status: 500 },
    );
  }
}