// /app/api/work-orders/add-line/route.ts
import { NextResponse } from "next/server";
import { createClient, type PostgrestError } from "@supabase/supabase-js";

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

type LineStatus =
  | "awaiting"
  | "queued"
  | "in_progress"
  | "on_hold"
  | "paused"
  | "completed"
  | "assigned"
  | "unassigned"
  | "awaiting_approval"
  | "declined";

type ApprovalState = "pending" | "approved" | "declined" | null;

type JobType =
  | "diagnosis"
  | "inspection"
  | "maintenance"
  | "repair"
  | "tech-suggested"
  | null;

interface InsertWorkOrderLine {
  work_order_id: string;
  description: string;
  job_type: JobType;
  status: LineStatus;
  approval_state: ApprovalState;

  // ✅ DB columns you actually have
  complaint: string | null;
  notes: string | null;
  labor_time: number | null;

  // ✅ important workflow controls (DB column exists)
  punchable: boolean;

  // ✅ store estimate and parts (DB columns exist)
  price_estimate: number | null;
  parts_needed: unknown | null;

  // ✅ optional link back to inspection session (DB column exists)
  inspection_session_id: string | null;
}

interface AddLineRequestBody {
  workOrderId: string;
  description: string;
  section?: string;
  status?: "recommend" | "fail";
  suggestion: AISuggestion;
  jobType?:
    | "inspection"
    | "repair"
    | "maintenance"
    | "diagnosis"
    | "tech-suggested";

  // ✅ allow client to pass complaint explicitly
  complaint?: string | null;

  // ✅ optional: link the WO line to the inspection session id
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
  return typeof v === "number" && Number.isFinite(v) && !Number.isNaN(v)
    ? v
    : null;
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

  // if we have neither usable labor nor usable parts cost, skip
  const hasPartsMoney = partsTotal > 0;
  const hasLaborMoney = hrs != null && rate != null && hrs >= 0 && rate >= 0;

  if (!hasPartsMoney && !hasLaborMoney) return null;

  const laborTotal = hasLaborMoney ? (hrs as number) * (rate as number) : 0;
  return Math.max(0, partsTotal + laborTotal);
}

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
      status, // "recommend" | "fail" from inspection
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

    const supabase = createClient(supabaseUrl, serviceKey);

    // ✅ Complaint precedence:
    // 1) explicit complaint from client
    // 2) suggestion.notes (your helper may copy inspection notes into suggestion.notes)
    const complaint =
      toNullableTrimmedString(complaintFromClient) ??
      toNullableTrimmedString(suggestion?.notes);

    // Build compact notes (extra context for advisors)
    const notesParts: string[] = [];
    if (section) notesParts.push(`Section: ${section}`);
    if (status) notesParts.push(`From inspection: ${status.toUpperCase()}`);
    if (suggestion.title?.trim()) notesParts.push(`Title: ${suggestion.title.trim()}`);
    if (suggestion.summary?.trim())
      notesParts.push(`AI: ${suggestion.summary.trim()}`);

    const notes: string | null = notesParts.length ? notesParts.join(" • ") : null;

    const laborTime: number | null = finiteNumberOrNull(suggestion?.laborHours);

    const laborRate: number | null = finiteNumberOrNull(suggestion?.laborRate);
    const parts = normalizeParts(suggestion?.parts);

    const priceEstimate = computePriceEstimate({
      parts,
      laborHours: laborTime,
      laborRate,
      explicit: finiteNumberOrNull(suggestion?.price),
    });

    // ✅ Store parts in parts_needed (jsonb)
    // Keep structure predictable for later consumption
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

    const insertPayload: InsertWorkOrderLine = {
      work_order_id: workOrderId,
      description,
      job_type: (jobType as JobType) ?? "inspection",

      // ✅ quote line (non-punchable)
      status: "awaiting_approval",
      approval_state: "pending",
      punchable: false,

      complaint,
      notes,
      labor_time: laborTime,

      price_estimate: priceEstimate,
      parts_needed: partsNeededJson,

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
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}