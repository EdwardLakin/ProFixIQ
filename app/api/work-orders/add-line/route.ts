import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const {
      workOrderId,
      description,
      section,
      status,      // "recommend" | "fail" (from inspection)
      suggestion,  // AISuggestion
      source = "inspection",
      jobType = "inspection",
    }: {
      workOrderId: string;
      description: string;
      section?: string;
      status?: "recommend" | "fail";
      suggestion: AISuggestion;
      source?: string;
      jobType?: string;
    } = body || {};

    if (!workOrderId || !description || !suggestion) {
      return NextResponse.json(
        { error: "Missing required fields (workOrderId, description, suggestion)" },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: "Server not configured for Supabase" },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Compose a helpful notes string (don’t break strict typings)
    const aiSummary = suggestion.summary?.trim() || "";
    const aiNotes =
      [
        section ? `Section: ${section}` : "",
        status ? `From inspection: ${status.toUpperCase()}` : "",
        aiSummary ? `AI: ${aiSummary}` : "",
      ].filter(Boolean).join(" • ") || null;

    // Try to fill labor_time if your table has it
    const laborTime =
      typeof suggestion.laborHours === "number" ? suggestion.laborHours : null;

    // If your table has a price/estimate column and typings allow it, you can save it too.
    // We’ll keep it minimal to avoid type errors.
    const insertPayload: any = {
      work_order_id: workOrderId,
      description,
      job_type: jobType,       // e.g. "inspection"
      status: "awaiting",      // or "queued"/"awaiting_approval" per your flow
      notes: aiNotes,
      labor_time: laborTime,
      // price_estimate: suggestion.price ?? null, // only if column exists & types allow
      // source: source,                            // only if you have such a column
    };

    const { data, error } = await supabase
      .from("work_order_lines")
      .insert(insertPayload)
      .select("id")
      .single();

    if (error) {
      console.error("Insert work_order_lines failed", error);
      return NextResponse.json(
        { error: error.message || "Insert failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({ id: data?.id });
  } catch (e) {
    console.error("add-line route error:", e);
    return NextResponse.json(
      { error: "Failed to add line" },
      { status: 500 }
    );
  }
}