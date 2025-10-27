import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

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

type IncomingBody = {
  workOrderId: string;
  description: string;
  section?: string;
  status?: "recommend" | "fail";
  suggestion: AISuggestion;
  source?: "inspection";
  // jobType intentionally omitted here to avoid enum mismatches
};

type DB = Database;
type WOLInsert = DB["public"]["Tables"]["work_order_lines"]["Insert"];
type WOLRow = DB["public"]["Tables"]["work_order_lines"]["Row"];

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as IncomingBody | null;

    if (!body?.workOrderId || !body?.description || !body?.suggestion) {
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

    const supabase = createClient<Database>(supabaseUrl, supabaseKey);

    // Compose useful notes (compact)
    const aiSummary = body.suggestion.summary?.trim() || "";
    const aiNotes =
      [
        body.section ? `Section: ${body.section}` : "",
        body.status ? `From inspection: ${body.status.toUpperCase()}` : "",
        aiSummary ? `AI: ${aiSummary}` : "",
      ]
        .filter(Boolean)
        .join(" • ") || null;

    const laborTime =
      typeof body.suggestion.laborHours === "number" ? body.suggestion.laborHours : null;

    // IMPORTANT: split status vs approval_state
    const payload: WOLInsert = {
      work_order_id: body.workOrderId as WOLInsert["work_order_id"],
      description: body.description as WOLInsert["description"],
      status: "awaiting" as WOLInsert["status"],               // valid status enum
      approval_state: "awaiting_approval" as WOLInsert["approval_state"], // approval enum
      notes: aiNotes as WOLInsert["notes"],
      labor_time: laborTime as WOLInsert["labor_time"],
      // Do NOT set job_type here to avoid enum mismatch; we can add it later once we confirm allowed values.
    };

    const { data, error } = await supabase
      .from("work_order_lines")
      .insert(payload)
      .select("id")
      .single<WOLRow>();

    if (error) {
      // log enough details to diagnose enum/constraint issues
      // eslint-disable-next-line no-console
      console.error("[add-line] insert failed", {
        message: error.message,
        details: (error as { details?: string }).details,
        hint: (error as { hint?: string }).hint,
        code: (error as { code?: string }).code,
        payload,
      });
      return NextResponse.json({ error: error.message ?? "Insert failed" }, { status: 500 });
    }

    return NextResponse.json({ id: data.id });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[add-line] route error:", e);
    return NextResponse.json({ error: "Failed to add line" }, { status: 500 });
  }
}