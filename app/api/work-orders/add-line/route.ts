import { NextResponse } from "next/server";
import { createClient, type PostgrestError } from "@supabase/supabase-js";

type AISuggestion = {
  parts: { name: string; qty?: number; cost?: number; notes?: string }[];
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
  | "unassigned";

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
  notes: string | null;
  labor_time: number | null;
}

interface AddLineRequestBody {
  workOrderId: string;
  description: string;
  section?: string;
  status?: "recommend" | "fail";
  suggestion: AISuggestion;
  jobType?: "inspection" | "repair" | "maintenance";
}

function isValidBody(b: unknown): b is AddLineRequestBody {
  if (typeof b !== "object" || b === null) return false;
  const o = b as Record<string, unknown>;
  return (
    typeof o.workOrderId === "string" &&
    typeof o.description === "string" &&
    o.suggestion !== undefined
  );
}

export async function POST(req: Request) {
  try {
    const bodyUnknown: unknown = await req.json();

    if (!isValidBody(bodyUnknown)) {
      return NextResponse.json(
        { error: "Invalid body: require workOrderId, description, suggestion" },
        { status: 400 }
      );
    }

    const {
      workOrderId,
      description,
      section,
      status,
      suggestion,
      jobType = "inspection",
    } = bodyUnknown;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json(
        { error: "Server not configured for Supabase" },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const notesParts: string[] = [];
    if (section) notesParts.push(`Section: ${section}`);
    if (status) notesParts.push(`From inspection: ${status.toUpperCase()}`);
    if (suggestion.summary?.trim()) notesParts.push(`AI: ${suggestion.summary.trim()}`);

    const insertPayload: InsertWorkOrderLine = {
      work_order_id: workOrderId,
      description,
      job_type: (jobType as JobType) ?? "inspection",
      status: "awaiting",
      approval_state: "pending",
      notes: notesParts.length ? notesParts.join(" • ") : null,
      labor_time:
        typeof suggestion.laborHours === "number" ? suggestion.laborHours : null,
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
        { status: 500 }
      );
    }

    return NextResponse.json({ id: data!.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}