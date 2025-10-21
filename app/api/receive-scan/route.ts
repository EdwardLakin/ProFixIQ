import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

export async function POST(req: Request) {
  try {
    const supabase = createRouteHandlerClient<DB>({ cookies });

    const body = await req.json().catch(() => ({}));
    const { part_id, location_id, qty, po_id } = body as {
      part_id: string;
      location_id: string;
      qty: number;
      po_id?: string | null;
    };

    if (!part_id || !location_id || !qty || qty <= 0) {
      return NextResponse.json({ error: "Missing or invalid input" }, { status: 400 });
    }

    // Apply stock move
    const { error: smErr } = await supabase.rpc("apply_stock_move", {
      p_part: part_id,
      p_loc: location_id,
      p_qty: qty,
      p_reason: "receive",
      p_ref_kind: po_id ? "purchase_order" : "manual_receive",
      p_ref_id: po_id || undefined,
    });
    if (smErr) throw smErr;

    // If PO provided: bump the received_qty on the first line with remaining qty for this part
    if (po_id) {
      const { data: lines, error: lerr } = await supabase
        .from("purchase_order_lines")
        .select("id, qty, received_qty, part_id")
        .eq("po_id", po_id)
        .eq("part_id", part_id)
        .order("created_at", { ascending: true });

      if (lerr) throw lerr;

      let remain = qty;
      for (const ln of lines ?? []) {
        if (remain <= 0) break;
        const ordered = Number(ln.qty);
        const rec = Number(ln.received_qty || 0);
        const delta = Math.min(remain, Math.max(0, ordered - rec));
        if (delta > 0) {
          const { error: uerr } = await supabase
            .from("purchase_order_lines")
            .update({ received_qty: rec + delta })
            .eq("id", ln.id);
          if (uerr) throw uerr;
          remain -= delta;
        }
      }
      // Optionally: mark PO received if all lines complete
      const { data: check } = await supabase
        .from("purchase_order_lines")
        .select("qty, received_qty")
        .eq("po_id", po_id);
      const allReceived = (check ?? []).every((r) => Number(r.received_qty || 0) >= Number(r.qty || 0));
      if (allReceived) {
        await supabase.from("purchase_orders").update({ status: "received" }).eq("id", po_id);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.error("[receive-scan] error:", e?.message || e);
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}