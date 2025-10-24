import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

function getIdFromUrl(url: string): string | null {
  const parts = new URL(url).pathname.split("/"); // ["", "api", "work-orders", "<id>", "mark-ready"]
  return parts.length >= 5 ? parts[3] : null;
}

function isError(x: unknown): x is Error {
  return typeof x === "object" && x !== null && "message" in x;
}

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient<DB>({ cookies });
  const woId = getIdFromUrl(req.url);
  if (!woId) {
    return NextResponse.json({ ok: false, error: "Missing work order id" }, { status: 400 });
  }

  try {
    // verify all lines completed first
    const { data: lines, error: lnErr } = await supabase
      .from("work_order_lines")
      .select("id,status")
      .eq("work_order_id", woId);
    if (lnErr) throw lnErr;

    const notDone = (lines ?? []).some((l) => String(l.status ?? "awaiting") !== "completed");
    if (notDone) {
      return NextResponse.json({ ok: false, error: "All lines must be completed first." }, { status: 400 });
    }

    const { error: updErr } = await supabase
      .from("work_orders")
      .update({ status: "ready_to_invoice" })
      .eq("id", woId);
    if (updErr) throw updErr;

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = isError(e) ? e.message : "Failed to mark ready";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}