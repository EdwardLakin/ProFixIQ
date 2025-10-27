import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// --- Data Contracts ---
type SuggestionPart = {
  name: string;
  qty?: number;
  cost?: number;
  notes?: string;
};

export type AISuggestion = {
  parts: SuggestionPart[];
  laborHours: number;
  laborRate?: number;
  summary: string;
  confidence?: "low" | "medium" | "high";
  price?: number;
  notes?: string;
  title?: string;
};

type AddLineRequest = {
  workOrderId: string;
  description: string;
  section?: string;
  status?: "recommend" | "fail"; // original inspection status
  suggestion: AISuggestion;
  source?: "inspection";
  jobType?: "inspection";
};

// --- DB Insert Payload Type ---
type InsertWorkOrderLine = {
  work_order_id: string;
  description: string;
  section: string | null;
  job_type: string;
  status: "awaiting_approval";
  notes: string | null;
  labor_time: number | null;
  price_estimate: number | null;
  source: string;
};

export async function POST(req: Request) {
  try {
    const body: AddLineRequest = await req.json();

    const {
      workOrderId,
      description,
      section,
      status,
      suggestion,
      source = "inspection",
      jobType = "inspection",
    } = body;

    if (!workOrderId || !description || !suggestion) {
      return NextResponse.json(
        { error: "Missing required fields (workOrderId, description, suggestion)" },
        { status: 400 },
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: "Server not configured for Supabase" },
        { status: 500 },
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // AI Notes formatting
    const aiSummary = suggestion.summary?.trim() || "";
    const aiNotes =
      [
        section ? `Section: ${section}` : "",
        status ? `From inspection: ${status.toUpperCase()}` : "",
        aiSummary ? `AI: ${aiSummary}` : "",
      ]
        .filter(Boolean)
        .join(" • ") || null;

    const labor_time =
      typeof suggestion.laborHours === "number"
        ? suggestion.laborHours
        : null;

    const partsTotal = suggestion.parts?.reduce<number>(
      (sum, p) => sum + (p.cost || 0),
      0,
    ) ?? 0;

    const price_estimate =
      typeof suggestion.laborRate === "number" && labor_time
        ? partsTotal + suggestion.laborRate * labor_time
        : partsTotal || null;

    const payload: InsertWorkOrderLine = {
      work_order_id: workOrderId,
      description,
      section: section ?? null,
      job_type: jobType,
      status: "awaiting_approval",
      notes: aiNotes,
      labor_time,
      price_estimate,
      source,
    };

    const { data, error } = await supabase
      .from("work_order_lines")
      .insert(payload)
      .select("id")
      .single();

    if (error) {
      console.error("Insert failure:", error);
      return NextResponse.json(
        { error: error.message ?? "Insert failed" },
        { status: 500 },
      );
    }

    return NextResponse.json({ id: data.id });
  } catch (err) {
    console.error("Unexpected API error:", err);
    return NextResponse.json(
      { error: "Failed to add line" },
      { status: 500 },
    );
  }
}