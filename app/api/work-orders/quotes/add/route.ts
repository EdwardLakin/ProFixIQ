import "server-only";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

export async function POST(req: Request) {
  const supabase = createServerComponentClient<DB>({ cookies });

  try {
    const { workOrderId, vehicleId, items } = (await req.json()) as {
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

    if (!workOrderId || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "Missing workOrderId or items" },
        { status: 400 },
      );
    }

    // Who is suggesting these lines?
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const suggested_by = user?.id ?? null;

    // Fetch shop_id from the work order so new rows pass RLS
    const { data: wo, error: woErr } = await supabase
      .from("work_orders")
      .select("shop_id")
      .eq("id", workOrderId)
      .maybeSingle();

    if (woErr) {
      return NextResponse.json(
        { error: `Failed to load work order: ${woErr.message}` },
        { status: 500 },
      );
    }
    if (!wo?.shop_id) {
      return NextResponse.json(
        { error: "Work order has no shop_id; cannot create quote lines." },
        { status: 400 },
      );
    }

    type QuoteInsert = DB["public"]["Tables"]["work_order_quote_lines"]["Insert"];

    const rows: QuoteInsert[] = items.map((i) => ({
      work_order_id: workOrderId,
      // keep line-level null for now; can be wired later
      work_order_line_id: null,
      shop_id: wo.shop_id as string,

      // legacy fields that still exist on the table
      vehicle_id: vehicleId ?? null,
      suggested_by,
      description: i.description,
      job_type: (i.jobType ?? "tech-suggested") as any,
      est_labor_hours: i.estLaborHours ?? null,
      notes: i.notes ?? null,
      status: "pending_parts" as any,
      ai_complaint: i.aiComplaint ?? null,
      ai_cause: i.aiCause ?? null,
      ai_correction: i.aiCorrection ?? null,

      // NEW quote-line fields used by the Quote Review page
      // @ts-ignore – schema/types may still be catching up
      stage: "advisor_pending",
      // @ts-ignore
      qty: 1,
      // numeric totals can be null for now; you can compute & store later
      // labor_hours, parts_total, labor_total, subtotal, tax_total, grand_total left null
    }));

    const { error } = await supabase
      .from("work_order_quote_lines")
      .insert(rows);

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "Failed to add quote items" },
      { status: 500 },
    );
  }
}