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

  // ✅ NEW: store complaint directly on the WO line
  complaint: string | null;

  // existing advisor context notes
  notes: string | null;

  labor_time: number | null;
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

  // ✅ NEW: allow client to pass complaint explicitly
  complaint?: string | null;
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

    const laborTime: number | null =
      typeof suggestion.laborHours === "number" ? suggestion.laborHours : null;

    // ✅ Create as a quote line:
    // - status: awaiting_approval (non-punchable)
    // - approval_state: pending
    const insertPayload: InsertWorkOrderLine = {
      work_order_id: workOrderId,
      description,
      job_type: (jobType as JobType) ?? "inspection",
      status: "awaiting_approval",
      approval_state: "pending",

      // ✅ this is what you want to show under "Complaint"
      complaint,

      // ✅ compact advisor context
      notes,

      labor_time: laborTime,
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