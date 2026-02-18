// app/api/inspections/complete/route.ts ✅ FULL FILE REPLACEMENT (NO any)
import "server-only";

export const runtime = "nodejs";

import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database, TablesInsert } from "@shared/types/types/supabase";

import type { InspectionItem } from "@/features/inspections/lib/inspection/types";
import { generateQuoteFromInspection } from "@quotes/lib/quote/generateQuoteFromInspection";
import { normalizeQuoteLine } from "@quotes/lib/quote/normalizeQuoteLine";

type DB = Database;
type QuoteLinesInsert = TablesInsert<"quote_lines">;

/* ----------------------------- Type guards ----------------------------- */
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function isInspectionItem(value: unknown): value is InspectionItem {
  // lightweight structural check — your InspectionItem is very flexible
  return isRecord(value);
}

function isInspectionItemArray(value: unknown): value is InspectionItem[] {
  return Array.isArray(value) && value.every(isInspectionItem);
}

/* -------------------------------- Types -------------------------------- */
type CompleteRequest = {
  workOrderId: string;
  workOrderLineId: string;
  results: InspectionItem[];
  templateName?: string | null;
};

/* --------------------------------- Route -------------------------------- */
export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient<DB>({ cookies });

  try {
    // 1) Parse & validate
    const body = (await req.json().catch(() => null)) as unknown;

    if (!isRecord(body)) {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const workOrderId = String(body.workOrderId ?? "").trim();
    const workOrderLineId = String(body.workOrderLineId ?? "").trim();
    const results = (body as Partial<CompleteRequest>).results;

    if (!workOrderId || !workOrderLineId) {
      return NextResponse.json(
        { error: "Missing workOrderId or workOrderLineId." },
        { status: 400 },
      );
    }

    if (!isInspectionItemArray(results)) {
      return NextResponse.json(
        { error: "results must be an array of InspectionItem." },
        { status: 400 },
      );
    }

    // current user (for quote_lines.user_id)
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr) {
      return NextResponse.json({ error: userErr.message }, { status: 500 });
    }

    const userId = user?.id ?? null;

    // 2) Verify the WO line exists
    const { data: line, error: lineErr } = await supabase
      .from("work_order_lines")
      .select("id, work_order_id")
      .eq("id", workOrderLineId)
      .maybeSingle();

    if (lineErr) {
      return NextResponse.json(
        { error: `Failed to load work order line: ${lineErr.message}` },
        { status: 500 },
      );
    }
    if (!line) {
      return NextResponse.json({ error: "Work order line not found." }, { status: 404 });
    }

    // Optional safety: ensure line belongs to the same WO passed
    if (typeof line.work_order_id === "string" && line.work_order_id !== workOrderId) {
      return NextResponse.json(
        { error: "workOrderId does not match the line's work_order_id." },
        { status: 400 },
      );
    }

    // 3) Generate AI summary and quote lines from inspection results
    const { summary, quote } = await generateQuoteFromInspection(results);
    const normalized = await Promise.all(quote.map((q) => normalizeQuoteLine(q)));

    // 4) Insert quote_lines (match your schema exactly)
    const nowIso = new Date().toISOString();

    const quoteRows: QuoteLinesInsert[] = normalized.map((n): QuoteLinesInsert => ({
      work_order_id: workOrderId,

      // text columns used by your UI
      description: n.description,
      item: n.item ?? n.name ?? n.description,
      name: n.name ?? n.description,
      title: n.description,

      // pricing / labor
      quantity: 1,
      labor_time: typeof n.laborHours === "number" ? n.laborHours : null,
      price: typeof n.price === "number" ? n.price : null,
      total: typeof n.price === "number" ? n.price : null,

      // parts info
      part_name: n.part?.name ?? n.partName ?? null,
      part_price:
        typeof n.part?.price === "number" ? n.part.price : n.partPrice ?? null,

      // misc columns
      photo_urls: Array.isArray(n.photoUrls) ? n.photoUrls : null,
      status: "draft",
      user_id: userId,
      updated_at: nowIso,
    }));

    if (quoteRows.length > 0) {
      const { error: insErr } = await supabase.from("quote_lines").insert(quoteRows);
      if (insErr) {
        return NextResponse.json(
          { error: `Failed to insert quote lines: ${insErr.message}` },
          { status: 500 },
        );
      }
    }

    // 5) Mark the inspection line complete & store AI summary in correction
    // ⚠️ DO NOT write columns that don't exist (e.g. completed_by)
    const updatePayload: DB["public"]["Tables"]["work_order_lines"]["Update"] = {
      status: "completed",
      correction: summary ?? null,
      updated_at: nowIso,
      punched_out_at: nowIso,
    };

    const { error: updErr } = await supabase
      .from("work_order_lines")
      .update(updatePayload)
      .eq("id", workOrderLineId);

    if (updErr) {
      return NextResponse.json(
        { error: `Failed to update work order line: ${updErr.message}` },
        { status: 500 },
      );
    }

    // 6) Done
    return NextResponse.json({
      ok: true,
      workOrderId,
      workOrderLineId,
      summary,
      inserted: quoteRows.length,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unexpected error handling inspection completion.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}