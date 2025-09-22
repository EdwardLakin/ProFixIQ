// app/api/inspections/complete/route.ts
import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

import type { InspectionItem } from "@inspections/lib/inspection/types";
import { generateQuoteFromInspection } from "@quotes/lib/quote/generateQuoteFromInspection";

type DB = Database;

type BodyShape = {
  workOrderId: string;
  vehicleId?: string | null;
  /** If provided, we’ll write the inspection summary to this line’s `correction`
   *  and mark it completed. */
  workOrderLineId?: string | null;

  /** Raw inspection items (if you want the route to build quote lines + summary). */
  results?: InspectionItem[];

  /** Optional prebuilt items if you’ve already run AI elsewhere.
   *  If provided, we’ll insert these directly. */
  items?: Array<{
    description: string;
    hours?: number | null;     // -> labor_time
    rate?: number | null;      // -> labor_rate
    total?: number | null;     // -> total
    status?: string | null;    // -> status
    notes?: string | null;     // -> notes
    photoUrls?: string[] | null;
  }>;

  /** If present we’ll use this, otherwise we’ll build one from `results`. */
  summaryText?: string | null;
};

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient<DB>({ cookies });

  try {
    const body = (await req.json()) as BodyShape;

    const workOrderId = body.workOrderId;
    const vehicleId = body.vehicleId ?? null;
    const workOrderLineId = body.workOrderLineId ?? null;

    if (!workOrderId) {
      return NextResponse.json({ error: "Missing workOrderId" }, { status: 400 });
    }

    // Build quote + summary if the caller only sent raw inspection results
    let summary = body.summaryText ?? null;
    let quoteInput =
      body.items && Array.isArray(body.items) && body.items.length > 0
        ? body.items
        : null;

    if (!quoteInput && body.results && Array.isArray(body.results)) {
      // Use your existing generator to convert inspection items → quote lines
      const { summary: autoSummary, quote } = await generateQuoteFromInspection(body.results);
      summary = summary ?? autoSummary;

      // Normalize to the insert shape we need below
      quoteInput = quote.map((q) => ({
        description: q.description,
        hours: typeof q.hours === "number" ? q.hours : null,
        rate: typeof q.rate === "number" ? q.rate : null,
        total: typeof q.total === "number" ? q.total : null,
        status: "proposed" as const,
        notes: null,
        photoUrls: null,
      }));
    }

    // Nothing to insert? We can still finalize the work order line summary.
    if (!quoteInput || quoteInput.length === 0) {
      // still write summary if requested
      if (workOrderLineId && summary) {
        const { error: updErr } = await supabase
          .from("work_order_lines")
          .update({ correction: summary, status: "completed" })
          .eq("id", workOrderLineId);

        if (updErr) {
          return NextResponse.json({ error: updErr.message }, { status: 500 });
        }
      }

      return NextResponse.json({ ok: true, inserted: 0, summaryWritten: !!summary });
    }

    // Insert rows into quote_lines (matches your current schema).
    // IMPORTANT: Your generated types show `title` exists, so we provide it
    // (aliasing it to description) to satisfy the Insert type.
    const rows = quoteInput.map((q) => ({
      work_order_id: workOrderId,
      vehicle_id: vehicleId,
      description: q.description,
      title: q.description, // satisfy schema that includes `title`
      item: q.description,  // harmless alias; some UIs read `item`
      name: q.description,  // ditto
      notes: q.notes ?? null,
      status: (q.status as string) ?? "proposed",
      labor_time: typeof q.hours === "number" ? q.hours : null,
      labor_rate: typeof q.rate === "number" ? q.rate : null,
      total: typeof q.total === "number" ? q.total : null,
      price: typeof q.total === "number" ? q.total : null,
      photo_urls: q.photoUrls ?? null,
      // Any other nullable fields (e.g., parts) can be added here if you later need them:
      // part_name: null,
      // part_price: null,
      // parts_costs: null,
      // quantity: 1,
    }));

    const { error: insErr } = await supabase.from("quote_lines").insert(rows);

    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }

    // If a work order line id was supplied, write the (AI) summary + mark completed
    if (workOrderLineId && summary) {
      const { error: updErr } = await supabase
        .from("work_order_lines")
        .update({ correction: summary, status: "completed" })
        .eq("id", workOrderLineId);

      if (updErr) {
        return NextResponse.json({ error: updErr.message }, { status: 500 });
      }
    }

    return NextResponse.json({
      ok: true,
      inserted: rows.length,
      summaryWritten: !!summary && !!workOrderLineId,
    });
  } catch (err: any) {
    console.error("[inspections/complete] failed:", err);
    return NextResponse.json({ error: "Failed to complete inspection" }, { status: 500 });
  }
}