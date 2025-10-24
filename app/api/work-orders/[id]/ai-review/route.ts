import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

function getIdFromUrl(url: string): string | null {
  const parts = new URL(url).pathname.split("/"); // ["", "api", "work-orders", "<id>", "ai-review"]
  return parts.length >= 5 ? parts[3] : null;
}

function isError(x: unknown): x is Error {
  return typeof x === "object" && x !== null && "message" in x;
}

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient<DB>({ cookies });
  const woId = getIdFromUrl(req.url);
  if (!woId) {
    return NextResponse.json({ ok: false, issues: [{ kind: "bad_request", message: "Missing work order id" }] }, { status: 400 });
  }

  try {
    const { data: wo, error: woErr } = await supabase.from("work_orders").select("*").eq("id", woId).maybeSingle();
    if (woErr) throw woErr;
    if (!wo) {
      return NextResponse.json({ ok: false, issues: [{ kind: "missing_wo", message: "WO not found" }] }, { status: 404 });
    }

    const { data: lines, error: lnErr } = await supabase
      .from("work_order_lines")
      .select("*")
      .eq("work_order_id", wo.id);
    if (lnErr) throw lnErr;

    const issues: { kind: string; lineId?: string; message: string }[] = [];

    for (const ln of lines ?? []) {
      const st = String(ln.status ?? "awaiting");
      if (st !== "completed") {
        issues.push({ kind: "line_not_completed", lineId: ln.id, message: `Line not completed: ${ln.description ?? ln.complaint ?? "job"}` });
      }
      // optional “marked N/A” booleans if you add them later; kept narrow without any
      const causeNA = (ln as Record<string, unknown>)["cause_marked_na"] === true;
      const correctionNA = (ln as Record<string, unknown>)["correction_marked_na"] === true;
      if (!ln.cause && !causeNA) {
        issues.push({ kind: "missing_cause", lineId: ln.id, message: `Missing cause: ${ln.description ?? "job"}` });
      }
      if (!ln.correction && !correctionNA) {
        issues.push({ kind: "missing_correction", lineId: ln.id, message: `Missing correction: ${ln.description ?? "job"}` });
      }
      if (!(typeof ln.labor_time === "number" && ln.labor_time > 0)) {
        issues.push({ kind: "no_labor_time", lineId: ln.id, message: `No labor time set: ${ln.description ?? "job"}` });
      }
    }

    if (!wo.customer_id) {
      issues.push({ kind: "missing_customer", message: "Missing customer on WO" });
    } else {
      const { data: cust } = await supabase.from("customers").select("email").eq("id", wo.customer_id).maybeSingle();
      if (!cust?.email) issues.push({ kind: "missing_email", message: "Customer has no email" });
    }

    return NextResponse.json({ ok: issues.length === 0, issues });
  } catch (e: unknown) {
    const msg = isError(e) ? e.message : "AI review failed";
    return NextResponse.json({ ok: false, issues: [{ kind: "error", message: msg }] }, { status: 500 });
  }
}