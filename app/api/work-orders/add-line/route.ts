// /app/api/work-orders/add-line/route.ts (FULL FILE REPLACEMENT)
import "server-only";

import { NextResponse } from "next/server";
import { createClient, type PostgrestError } from "@supabase/supabase-js";
import type { Database, TablesInsert } from "@shared/types/types/supabase";

type DB = Database;

type PartLine = { name: string; qty?: number; cost?: number; notes?: string };

type AISuggestion = {
  parts: PartLine[];
  laborHours: number;
  laborRate?: number;
  summary: string;
  confidence?: "low" | "medium" | "high";
  price?: number;
  notes?: string;
  title?: string;
};

type JobType =
  | "diagnosis"
  | "inspection"
  | "maintenance"
  | "repair"
  | "tech-suggested"
  | null;

type InspectionItemStatus = "recommend" | "fail";

interface AddLineRequestBody {
  workOrderId: string;
  description: string;
  section?: string;
  status?: InspectionItemStatus;
  suggestion: AISuggestion;
  jobType?: Exclude<JobType, null>;

  complaint?: string | null;
  inspectionSessionId?: string | null;
}

function isValidBody(b: unknown): b is AddLineRequestBody {
  if (typeof b !== "object" || b === null) return false;
  const o = b as Record<string, unknown>;
  return (
    typeof o.workOrderId === "string" &&
    typeof o.description === "string" &&
    typeof o.suggestion === "object" &&
    o.suggestion !== null
  );
}

function toNullableTrimmedString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

function finiteNumberOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && !Number.isNaN(v) ? v : null;
}

function normalizeParts(parts: PartLine[] | undefined): Array<{
  name: string;
  qty: number;
  cost: number | null;
  notes: string | null;
}> {
  const arr = Array.isArray(parts) ? parts : [];
  return arr
    .map((p) => ({
      name: String(p?.name ?? "").trim(),
      qty: typeof p?.qty === "number" && Number.isFinite(p.qty) && p.qty > 0 ? p.qty : 1,
      cost: finiteNumberOrNull(p?.cost),
      notes: toNullableTrimmedString(p?.notes),
    }))
    .filter((p) => p.name.length > 0);
}

function computePriceEstimate(args: {
  parts: Array<{ qty: number; cost: number | null }>;
  laborHours: number | null;
  laborRate: number | null;
  explicit: number | null;
}): number | null {
  const explicit = args.explicit;
  if (explicit != null && explicit >= 0) return explicit;

  const partsTotal = args.parts.reduce((sum, p) => {
    const cost = typeof p.cost === "number" ? p.cost : 0;
    const qty = typeof p.qty === "number" && p.qty > 0 ? p.qty : 1;
    return sum + cost * qty;
  }, 0);

  const hrs = args.laborHours ?? null;
  const rate = args.laborRate ?? null;

  const hasPartsMoney = partsTotal > 0;
  const hasLaborMoney = hrs != null && rate != null && hrs >= 0 && rate >= 0;

  if (!hasPartsMoney && !hasLaborMoney) return null;

  const laborTotal = hasLaborMoney ? (hrs as number) * (rate as number) : 0;
  return Math.max(0, partsTotal + laborTotal);
}

type WoRow = DB["public"]["Tables"]["work_orders"]["Row"];
type WoLineInsert = TablesInsert<"work_order_lines">;

export async function POST(req: Request) {
  try {
    const bodyUnknown: unknown = await req.json();

    if (!isValidBody(bodyUnknown)) {
      return NextResponse.json(
        { error: "Invalid body: require workOrderId, description, suggestion" },
        { status: 400 },
      );
    }

    const {
      workOrderId,
      description,
      section,
      status,
      suggestion,
      jobType = "inspection",
      complaint: complaintFromClient,
      inspectionSessionId,
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

    const supabase = createClient<DB>(supabaseUrl, serviceKey);

    // ✅ Always derive shop_id from the work order (keeps data consistent)
    const { data: wo, error: woErr } = await supabase
      .from("work_orders")
      .select("id, shop_id, vehicle_id")
      .eq("id", workOrderId)
      .maybeSingle<Pick<WoRow, "id" | "shop_id" | "vehicle_id">>();

    if (woErr) {
      const e = woErr as PostgrestError;
      return NextResponse.json(
        { error: e.message, details: e.details, hint: e.hint, code: e.code },
        { status: 500 },
      );
    }
    if (!wo) {
      return NextResponse.json({ error: "Work order not found" }, { status: 404 });
    }
    if (!wo.shop_id) {
      return NextResponse.json(
        { error: "Work order missing shop_id (required for inserts)" },
        { status: 400 },
      );
    }

    const complaint =
      toNullableTrimmedString(complaintFromClient) ??
      toNullableTrimmedString(suggestion?.notes);

    const notesParts: string[] = [];
    if (section) notesParts.push(`Section: ${section}`);
    if (status) notesParts.push(`From inspection: ${status.toUpperCase()}`);
    if (suggestion.title?.trim()) notesParts.push(`Title: ${suggestion.title.trim()}`);
    if (suggestion.summary?.trim()) notesParts.push(`AI: ${suggestion.summary.trim()}`);
    const notes = notesParts.length ? notesParts.join(" • ") : null;

    const laborTime: number | null = finiteNumberOrNull(suggestion?.laborHours);
    const laborRate: number | null = finiteNumberOrNull(suggestion?.laborRate);
    const parts = normalizeParts(suggestion?.parts);

    const priceEstimate = computePriceEstimate({
      parts,
      laborHours: laborTime,
      laborRate,
      explicit: finiteNumberOrNull(suggestion?.price),
    });

    const partsNeededJson =
      parts.length > 0
        ? parts.map((p) => ({
            name: p.name,
            qty: p.qty,
            cost: p.cost,
            notes: p.notes,
            source: "inspection_ai",
          }))
        : null;

    // ✅ CRITICAL FIX:
    // - work_order_lines.status has CHECK constraint and cannot be "fail"/"recommend".
    // - Store inspection meaning in line_status instead.
    const lineStatus: string | null =
      status === "fail" ? "fail" : status === "recommend" ? "recommend" : null;

    const insertPayload: WoLineInsert = {
      work_order_id: workOrderId,
      shop_id: wo.shop_id,
      vehicle_id: wo.vehicle_id ?? null,

      description,
      job_type: (jobType as JobType) ?? "inspection",

      // workflow status must be allowed by CHECK constraint
      status: "awaiting_approval",
      approval_state: "pending",
      punchable: false,

      // store inspection fail/recommend meaning here
      line_status: lineStatus,

      complaint,
      notes,
      labor_time: laborTime,

      price_estimate: priceEstimate,

      // typed safely (Json-like). If your generated type differs, this still compiles because it matches Json structure.
      parts_needed: partsNeededJson as unknown as WoLineInsert["parts_needed"],

      inspection_session_id: toNullableTrimmedString(inspectionSessionId),
    };

    const { data, error } = await supabase
      .from("work_order_lines")
      .insert(insertPayload)
      .select("id")
      .single();

    if (error) {
      const e = error as PostgrestError;
      return NextResponse.json(
        { error: e.message, details: e.details, hint: e.hint, code: e.code },
        { status: 500 },
      );
    }

    return NextResponse.json({ id: (data as { id: string }).id });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}