import "server-only";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type QuoteInsert = DB["public"]["Tables"]["work_order_quote_lines"]["Insert"];

export async function POST(req: Request) {
  const supabase = createServerComponentClient<DB>({ cookies });

  try {
    const body = (await req.json()) as {
      workOrderId: string;
      vehicleId?: string | null;
      items: Array<{
        description: string;
        jobType?: "diagnosis" | "repair" | "maintenance" | "tech-suggested";
        estLaborHours?: number;
        notes?: string;
        aiComplaint?: string;
        aiCause?: string;
        aiCorrection?: string;
      }>;
    };

    const { workOrderId, vehicleId, items } = body;

    if (!workOrderId || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "Missing workOrderId or items" },
        { status: 400 }
      );
    }

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const suggested_by = user?.id ?? null;

    // Load work order → for shop_id
    const { data: wo, error: woErr } = await supabase
      .from("work_orders")
      .select("shop_id")
      .eq("id", workOrderId)
      .maybeSingle();

    if (woErr) {
      return NextResponse.json(
        { error: `Failed to load work order: ${woErr.message}` },
        { status: 500 }
      );
    }

    if (!wo?.shop_id) {
      return NextResponse.json(
        { error: "Work order has no shop_id; cannot create quote lines." },
        { status: 400 }
      );
    }

    // Build rows fully typed
    const rows: QuoteInsert[] = items.map((i) => ({
      work_order_id: workOrderId,
      work_order_line_id: null,
      shop_id: wo.shop_id,

      vehicle_id: vehicleId ?? null,
      suggested_by,
      description: i.description,
      job_type: i.jobType ?? "tech-suggested",
      est_labor_hours: i.estLaborHours ?? null,
      notes: i.notes ?? null,
      status: "pending_parts",
      ai_complaint: i.aiComplaint ?? null,
      ai_cause: i.aiCause ?? null,
      ai_correction: i.aiCorrection ?? null,

      // NEW fields ― now fully typed, no @ts-ignore
      stage: "advisor_pending",
      qty: 1,

      labor_hours: null,
      parts_total: null,
      labor_total: null,
      subtotal: null,
      tax_total: null,
      grand_total: null,
      metadata: null,
      group_id: null,
      sent_to_customer_at: null,
      approved_at: null,
      declined_at: null,
    }));

    const { error } = await supabase
      .from("work_order_quote_lines")
      .insert(rows);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[quotes/add] error:", err);
    return NextResponse.json(
      { error: "Failed to add quote items" },
      { status: 500 }
    );
  }
}