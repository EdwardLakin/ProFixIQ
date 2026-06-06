// app/api/receive-scan/route.ts (FULL FILE REPLACEMENT)

import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import type { Database } from "@shared/types/types/supabase";
import { logOperationalEvent } from "@/features/work-orders/server/logOperationalEvent";

type DB = Database;

export async function POST(req: Request) {
  try {
    const supabase = createServerSupabaseRoute();

    const body = (await req.json().catch(() => ({}))) as Partial<{
      part_id: string;
      location_id: string;
      qty: number;
      po_id?: string | null;
    }>;

    const partId = typeof body.part_id === "string" ? body.part_id : "";
    const locationId = typeof body.location_id === "string" ? body.location_id : "";
    const qty =
      typeof body.qty === "number" && Number.isFinite(body.qty) ? body.qty : 0;
    const poId =
      typeof body.po_id === "string" && body.po_id.length > 0 ? body.po_id : null;

    if (!partId || !locationId || qty <= 0) {
      return NextResponse.json(
        { error: "Missing or invalid input" },
        { status: 400 },
      );
    }

    // Optional early auth check so errors are clean
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr) {
      return NextResponse.json({ error: userErr.message }, { status: 401 });
    }
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    /* ============================================================
     * PO RECEIVE (NEW): batch allocate received qty to request items
     * ============================================================
     */
    if (poId) {
      const { data, error } = await supabase.rpc(
        "receive_po_part_and_allocate",
        {
          p_po_id: poId,
          p_part_id: partId,
          p_location_id: locationId,
          p_qty: qty,
        } as unknown as DB["public"]["Functions"]["receive_po_part_and_allocate"]["Args"],
      );

      if (error) throw error;

      await logOperationalEvent({
        supabase,
        event: "parts_received",
        actorId: user.id,
        entityType: "part",
        entityId: partId,
        details: {
          mode: "po",
          po_id: poId,
          location_id: locationId,
          qty,
        },
      });

      return NextResponse.json({ ok: true, mode: "po", result: data });
    }

    /* ============================================================
     * MANUAL RECEIVE (legacy): just apply stock move
     * ============================================================
     * NOTE:
     * - Your apply_stock_move types want p_ref_id as string.
     * - For manual receive, we pass a deterministic non-null ref id.
     */
    const { error: smErr } = await supabase.rpc(
      "apply_stock_move",
      {
        p_part: partId,
        p_loc: locationId,
        p_qty: qty,
        p_reason: "receive",
        p_ref_kind: "manual_receive",
        p_ref_id: partId, // non-null placeholder for strict RPC args
      } as unknown as DB["public"]["Functions"]["apply_stock_move"]["Args"],
    );

    if (smErr) throw smErr;

    // Keep your existing behavior
    const { error: relErr } = await supabase.rpc(
      "wo_release_parts_holds_for_part",
      { p_part_id: partId },
    );

    if (relErr) {
      console.warn(
        "[receive-scan] wo_release_parts_holds_for_part:",
        relErr.message,
      );
    }

    await logOperationalEvent({
      supabase,
      event: "parts_received",
      actorId: user.id,
      entityType: "part",
      entityId: partId,
      details: {
        mode: "manual",
        location_id: locationId,
        qty,
      },
    });

    return NextResponse.json({ ok: true, mode: "manual" });
  } catch (e: unknown) {
    const message =
      e instanceof Error ? e.message : typeof e === "string" ? e : "Server error";

    console.error("[receive-scan] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
