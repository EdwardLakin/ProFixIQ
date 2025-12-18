import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

import {
  nonEmpty,
  requireAuthedUser,
  requirePortalCustomer,
  requireWorkOrderOwnedByCustomer,
} from "@/features/portal/server/portalAuth";

export const runtime = "nodejs";

type QuoteOnlyBody = {
  workOrderId: string;

  // optional duplication for convenience (WO already has these)
  vehicleId?: string | null;

  // the customer request (e.g. "Replace tires", "Rear diff input u-joint")
  description: string;

  // optional notes the customer adds
  notes?: string | null;

  // quantity for quote lines (belongs in work_order_quote_lines)
  qty?: number;

  // optional hint for routing (parts/diag/etc)
  jobType?: "quote_only" | "custom" | "menu";
};

function jsonError(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

function clampQty(n: number): number {
  if (!Number.isFinite(n)) return 1;
  const i = Math.trunc(n);
  if (i < 1) return 1;
  if (i > 99) return 99;
  return i;
}

export async function POST(req: Request): Promise<Response> {
  try {
    const supabase = createRouteHandlerClient<Database>({ cookies });

    // Auth
    const user = await requireAuthedUser(supabase);

    // Parse body
    let body: QuoteOnlyBody;
    try {
      body = (await req.json()) as QuoteOnlyBody;
    } catch {
      return jsonError("Invalid JSON body");
    }

    const workOrderId = body?.workOrderId ?? "";
    const description = body?.description ?? "";
    const notes = body?.notes ?? null;
    const qty = clampQty(typeof body?.qty === "number" ? body.qty : 1);

    if (!nonEmpty(workOrderId)) return jsonError("Missing workOrderId");
    if (!nonEmpty(description)) return jsonError("Missing description");

    // Portal customer (owner of auth account)
    const customer = await requirePortalCustomer(supabase as any, user.id);

    // Ensure WO belongs to this customer
    const wo = await requireWorkOrderOwnedByCustomer(
      supabase as any,
      workOrderId,
      customer.id,
    );

    // Enforce portal-only rule: customer can only add quote lines while WO is still not invoiced
    const status = (wo.status ?? "").toLowerCase();
    if (status === "invoiced") {
      return jsonError("This work order has already been invoiced", 409);
    }

    // Insert quote-only into work_order_quote_lines
    // IMPORTANT: qty exists here (not on work_order_lines)
    const insert: Database["public"]["Tables"]["work_order_quote_lines"]["Insert"] = {
      work_order_id: wo.id,
      shop_id: wo.shop_id,
      vehicle_id: (body?.vehicleId ?? wo.vehicle_id) ?? null,

      // customer requested quote line
      description: description.trim(),
      notes: typeof notes === "string" ? notes.trim() || null : null,

      qty,

      // Stage starts internal-pending; later your parts flow can promote to customer_pending
      stage: "advisor_pending",

      // optional classification (safe default)
      job_type: "customer-requested",
    };

    const { data: created, error: insErr } = await supabase
      .from("work_order_quote_lines")
      .insert(insert)
      .select("*")
      .single();

    if (insErr || !created) {
      const msg = insErr?.message || "Failed to add quote request";
      return jsonError(msg, 500);
    }

    // Optional: log ai_events later when we wire /ai/common-problems + /ai/similar-labor
    // (keeping this endpoint focused & minimal)

    return NextResponse.json({ quoteLine: created }, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("add-quote-only error:", msg);
    return jsonError("Unexpected error", 500);
  }
}
