import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient<DB>({ cookies });
  const woId = params.id;

  // Load WO + lines + minimal customer
  const { data: wo, error: woErr } = await supabase.from("work_orders").select("*").eq("id", woId).maybeSingle();
  if (woErr || !wo) return NextResponse.json({ ok: false, issues: [{ kind: "missing_wo", message: "WO not found" }] }, { status: 404 });

  const { data: lines, error: lnErr } = await supabase.from("work_order_lines").select("*").eq("work_order_id", wo.id);
  if (lnErr) return NextResponse.json({ ok: false, issues: [{ kind: "db", message: lnErr.message }] }, { status: 400 });

  const issues: { kind: string; lineId?: string; message: string }[] = [];

  for (const ln of (lines ?? [])) {
    const st = (ln.status ?? "awaiting").toString();
    if (st !== "completed") {
      issues.push({ kind: "line_not_completed", lineId: ln.id, message: `Line not completed: ${ln.description ?? ln.complaint ?? "job"}` });
    }
    if (!ln.cause && !(ln as unknown as { cause_marked_na?: boolean }).cause_marked_na) {
      issues.push({ kind: "missing_cause", lineId: ln.id, message: `Missing cause: ${ln.description ?? "job"}` });
    }
    if (!ln.correction && !(ln as unknown as { correction_marked_na?: boolean }).correction_marked_na) {
      issues.push({ kind: "missing_correction", lineId: ln.id, message: `Missing correction: ${ln.description ?? "job"}` });
    }
    if (!(typeof ln.labor_time === "number" && ln.labor_time > 0)) {
      issues.push({ kind: "no_labor_time", lineId: ln.id, message: `No labor time set: ${ln.description ?? "job"}` });
    }
  }

  // Customer email present?
  if (!wo.customer_id) {
    issues.push({ kind: "missing_customer", message: "Missing customer on WO" });
  } else {
    const { data: cust } = await supabase.from("customers").select("email").eq("id", wo.customer_id).maybeSingle();
    if (!cust?.email) issues.push({ kind: "missing_email", message: "Customer has no email" });
  }

  return NextResponse.json({ ok: issues.length === 0, issues });
}
