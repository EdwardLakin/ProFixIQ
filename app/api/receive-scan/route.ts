// app/api/receive-scan/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type StockMoveRow = DB["public"]["Tables"]["stock_moves"]["Row"];
type PurchaseOrderLine = DB["public"]["Tables"]["purchase_order_lines"]["Row"];

function extractStockMoveId(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const maybe = data as Partial<StockMoveRow>;
  const id = maybe.id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

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
     * NOTE:
     * - Your generated types currently want p_ref_id as string (not nullable).
     * - So we only include p_ref_id when we actually have one.
     */
    const rpcArgsBase = {
      p_part: part_id,
      p_loc: location_id,
      p_qty: qty,
      p_reason: "receive",
      p_ref_kind: po_id ? "purchase_order" : "manual_receive",
    };

    const rpcArgs = po_id
      ? { ...rpcArgsBase, p_ref_id: po_id }
      : rpcArgsBase;

    const { data: moveRow, error: smErr } = await supabase.rpc(
      "apply_stock_move",
      // Supabase rpc types can be overly strict; this is safe and intentional.
      rpcArgs as unknown as DB["public"]["Functions"]["apply_stock_move"]["Args"],
    );

    if (smErr) throw smErr;

    const moveId = extractStockMoveId(moveRow);
    if (!moveId) {
      console.warn("[receive-scan] apply_stock_move returned no id");
    }

    /* ============================================================
     * 2) UPDATE PURCHASE ORDER LINES (IF APPLICABLE)
     * ============================================================
     */
    if (po_id) {
      const { data: lines, error: lineErr } = await supabase
        .from("purchase_order_lines")
        .select("id, qty, received_qty, part_id, created_at")
        .eq("po_id", po_id)
        .eq("part_id", part_id)
        .order("created_at", { ascending: true });

      if (lineErr) throw lineErr;

      let remaining = qty;

      for (const ln of (lines ?? []) as PurchaseOrderLine[]) {
        if (remaining <= 0) break;

        const ordered = Number(ln.qty ?? 0);
        const received = Number(ln.received_qty ?? 0);
        const delta = Math.min(remaining, Math.max(0, ordered - received));

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
        (r) => Number(r.received_qty ?? 0) >= Number(r.qty ?? 0),
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
     * ============================================================
     */
    const { error: relErr } = await supabase.rpc(
      "wo_release_parts_holds_for_part",
      { p_part_id: part_id },
    );

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
    return NextResponse.json({ error: message }, { status: 500 });
  }
}