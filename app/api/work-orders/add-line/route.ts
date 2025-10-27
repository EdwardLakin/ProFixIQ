// app/api/work-orders/add-line/route.ts
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
      status,
      suggestion,
      jobType = "inspection",
    }: {
      workOrderId: string;
      description: string;
      section?: string;
      status?: "recommend" | "fail";
      suggestion: AISuggestion;
      jobType?: "inspection" | "repair" | "maintenance";
    } = body;

    if (!workOrderId || !description || !suggestion) {
      return NextResponse.json(
        { error: "Missing required fields (workOrderId, description, suggestion)" },
        { status: 400 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const labor_time =
      typeof suggestion.laborHours === "number" ? suggestion.laborHours : null;

    const notes = [
      section ? `Section: ${section}` : "",
      status ? `From inspection: ${status.toUpperCase()}` : "",
      suggestion.summary ? `AI: ${suggestion.summary}` : "",
    ]
      .filter(Boolean)
      .join(" • ") || null;

    const insertPayload = {
      work_order_id: workOrderId,
      description,
      job_type: jobType,
      status: "awaiting",          // ✅ allowed
      approval_state: "pending",   // ✅ allowed
      notes,
      labor_time,
    };

    const { data, error } = await supabase
      .from("work_order_lines")
      .insert(insertPayload)
      .select("id")
      .single();

    if (error) {
      console.error("Insert failed:", error);
      return NextResponse.json(
        {
          error: error.message,
          // helpful debug:
          details: (error as any).details,
          hint: (error as any).hint,
          code: (error as any).code,
          insertPayload,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ id: data.id });
  } catch (e) {
    console.error("Route error:", e);
    return NextResponse.json({ error: "Failed to add line" }, { status: 500 });
  }
}