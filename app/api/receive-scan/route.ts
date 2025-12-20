// app/api/receive-scan/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type PurchaseOrderLine =
  DB["public"]["Tables"]["purchase_order_lines"]["Row"];

export async function POST(req: Request) {
  try {
    const supabase = createRouteHandlerClient<DB>({ cookies });

    const body = (await req.json().catch(() => ({}))) as Partial<{
      part_id: string;
      location_id: string;
      qty: number;
      po_id?: string | null;
    }>;

    const { part_id, location_id, qty, po_id } = body;

    if (!part_id || !location_id || !qty || qty <= 0) {
      return NextResponse.json(
        { error: "Missing or invalid input" },
        { status: 400 },
      );
    }

    /* ============================================================
     * 1) APPLY STOCK MOVE (AUTHORITATIVE INVENTORY RECORD)
     * ============================================================
     */
    const { error: smErr } = await supabase.rpc("apply_stock_move", {
      p_part: part_id,
      p_loc: location_id,
      p_qty: qty,
      p_reason: "receive",
      p_ref_kind: po_id ? "purchase_order" : "manual_receive",
      p_ref_id: po_id ?? "",
    });

    if (smErr) throw smErr;

    /* ============================================================
     * 2) UPDATE PURCHASE ORDER LINES (IF APPLICABLE)
     * ============================================================
     */
    if (po_id) {
      const { data: lines, error: lineErr } = await supabase
        .from("purchase_order_lines")
        .select("id, qty, received_qty, part_id")
        .eq("po_id", po_id)
        .eq("part_id", part_id)
        .order("created_at", { ascending: true });

      if (lineErr) throw lineErr;

      let remaining = qty;

      for (const ln of (lines ?? []) as PurchaseOrderLine[]) {
        if (remaining <= 0) break;

        const ordered = Number(ln.qty ?? 0);
        const received = Number(ln.received_qty ?? 0);
        const delta = Math.min(
          remaining,
          Math.max(0, ordered - received),
        );

        if (delta > 0) {
          const { error: updateErr } = await supabase
            .from("purchase_order_lines")
            .update({ received_qty: received + delta })
            .eq("id", ln.id);

          if (updateErr) throw updateErr;
          remaining -= delta;
        }
      }

      /* ============================================================
       * 3) AUTO-CLOSE PO IF FULLY RECEIVED
       * ============================================================
       */
      const { data: checkRows, error: checkErr } = await supabase
        .from("purchase_order_lines")
        .select("qty, received_qty")
        .eq("po_id", po_id);

      if (checkErr) throw checkErr;

      const allReceived = (checkRows ?? []).every(
        (r) =>
          Number(r.received_qty ?? 0) >= Number(r.qty ?? 0),
      );

      if (allReceived) {
        const { error: statusErr } = await supabase
          .from("purchase_orders")
          .update({ status: "received" })
          .eq("id", po_id);

        if (statusErr) throw statusErr;
      }
    }

    /* ============================================================
     * 4) RELEASE ONLY "AWAITING PARTS" LINE HOLDS
     *
     * RULES (LAUNCH LOCKED):
     * - ONLY affects lines held for parts
     * - Clears hold_reason + on_hold_since
     * - Sets status -> 'awaiting'
     * - NEVER auto-holds anything
     * ============================================================
     */
    const { error: relErr } = await supabase.rpc(
      "wo_release_parts_holds_for_part",
      {
        p_part_id: part_id,
      },
    );

    // Not fatal — inventory receipt must succeed even if this fails
    if (relErr) {
      console.warn(
        "[receive-scan] wo_release_parts_holds_for_part:",
        relErr.message,
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const message =
      e instanceof Error
        ? e.message
        : typeof e === "string"
          ? e
          : "Server error";

    console.error("[receive-scan] error:", message);
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}