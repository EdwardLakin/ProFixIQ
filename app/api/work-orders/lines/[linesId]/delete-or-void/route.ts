// /app/api/work-orders/lines/[lineId]/delete-or-void/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type Disposition = "return_to_stock" | "keep_consumed" | "scrap";
type Mode = "delete" | "void";

type Body = {
  mode: Mode;
  disposition?: Disposition; // required when allocations exist
  reason: string;
  note?: string | null;
};

function safeTrim(x: unknown): string {
  return typeof x === "string" ? x.trim() : "";
}

function asNumber(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ lineId: string }> },
) {
  try {
    const supabase = createRouteHandlerClient<DB>({ cookies });

    const { lineId } = await ctx.params;
    const id = safeTrim(lineId);

    const body = (await req.json().catch(() => null)) as Body | null;

    const mode = safeTrim(body?.mode) as Mode;
    const disposition = safeTrim(body?.disposition) as Disposition;
    const reason = safeTrim(body?.reason);
    const note = body?.note ?? null;

    if (!id) {
      return NextResponse.json({ error: "Missing lineId" }, { status: 400 });
    }
    if (mode !== "delete" && mode !== "void") {
      return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
    }
    if (!reason) {
      return NextResponse.json({ error: "Reason is required" }, { status: 400 });
    }

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

    // Load line + WO status (block if invoiced)
    const { data: lineRow, error: lineErr } = await supabase
      .from("work_order_lines")
      .select("id, work_order_id, shop_id, status, voided_at")
      .eq("id", id)
      .maybeSingle();

    if (lineErr) {
      return NextResponse.json({ error: lineErr.message }, { status: 500 });
    }
    if (!lineRow) {
      return NextResponse.json({ error: "Line not found" }, { status: 404 });
    }

    if (lineRow.voided_at) {
      return NextResponse.json(
        { error: "This line is already voided." },
        { status: 409 },
      );
    }

    const workOrderId = lineRow.work_order_id;
    const shopId = lineRow.shop_id;

    if (!workOrderId || !shopId) {
      return NextResponse.json(
        { error: "Line is missing work_order_id or shop_id" },
        { status: 500 },
      );
    }

    const { data: woRow, error: woErr } = await supabase
      .from("work_orders")
      .select("id, status")
      .eq("id", workOrderId)
      .maybeSingle();

    if (woErr) {
      return NextResponse.json({ error: woErr.message }, { status: 500 });
    }

    const woStatus = safeTrim(woRow?.status).toLowerCase();
    const lineStatus = safeTrim(lineRow.status).toLowerCase();

    if (woStatus === "invoiced" || lineStatus === "invoiced") {
      return NextResponse.json(
        { error: "Cannot delete/void an invoiced line." },
        { status: 409 },
      );
    }

    // Set shop context for RLS (server session)
    const { error: ctxErr } = await supabase.rpc("set_current_shop_id", {
      p_shop_id: shopId,
    });
    if (ctxErr) {
      return NextResponse.json(
        { error: ctxErr.message || "Failed to set current_shop_id" },
        { status: 500 },
      );
    }

    // Load allocations for this line
    const { data: allocs, error: aErr } = await supabase
      .from("work_order_part_allocations")
      .select("id, part_id, location_id, qty, stock_move_id")
      .eq("work_order_line_id", id);

    if (aErr) {
      return NextResponse.json({ error: aErr.message }, { status: 500 });
    }

    const allocations = Array.isArray(allocs) ? allocs : [];
    const hasAllocs = allocations.length > 0;

    if (hasAllocs) {
      if (
        disposition !== "return_to_stock" &&
        disposition !== "keep_consumed" &&
        disposition !== "scrap"
      ) {
        return NextResponse.json(
          { error: "Disposition is required when parts are on the line." },
          { status: 400 },
        );
      }
    }

    // Decide whether we allow a hard delete:
    // Only allowed when:
    // - mode=delete
    // - no allocations
    // - line is not completed/ready_to_invoice/etc
    const hardDeleteAllowed =
      mode === "delete" &&
      !hasAllocs &&
      !["completed", "ready_to_invoice", "invoiced"].includes(lineStatus);

    if (hardDeleteAllowed) {
      const { error: delErr } = await supabase
        .from("work_order_lines")
        .delete()
        .eq("id", id);

      if (delErr) {
        return NextResponse.json({ error: delErr.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true, mode: "deleted" });
    }

    // Otherwise: we VOID (soft delete)
    // Inventory handling:
    // - return_to_stock => apply_stock_move(+qty, reason=return_in), then delete allocations
    // - keep_consumed/scrap => just delete allocations (inventory unchanged)
    if (hasAllocs) {
      if (disposition === "return_to_stock") {
        for (const a of allocations) {
          const partId = a.part_id;
          const locId = a.location_id;
          const qty = asNumber(a.qty);

          if (!partId || !locId || qty <= 0) continue;

          const { error: mvErr } = await supabase.rpc("apply_stock_move", {
            p_part: partId,
            p_loc: locId,
            p_qty: qty, // returning stock back in
            p_reason: "return_in",
            p_ref_kind: "work_order_line_void",
            p_ref_id: id,
          });

          if (mvErr) {
            return NextResponse.json({ error: mvErr.message }, { status: 500 });
          }
        }
      }

      // Remove allocations so this voided line stops affecting quote/invoice totals
      const { error: daErr } = await supabase
        .from("work_order_part_allocations")
        .delete()
        .eq("work_order_line_id", id);

      if (daErr) {
        return NextResponse.json({ error: daErr.message }, { status: 500 });
      }
    }

    // Mark the line voided (requires the SQL migration columns)
    const { error: vErr } = await supabase
      .from("work_order_lines")
      .update({
        voided_at: new Date().toISOString(),
        voided_by: user.id,
        void_reason: reason,
        void_note: note,
      } as DB["public"]["Tables"]["work_order_lines"]["Update"])
      .eq("id", id);

    if (vErr) {
      return NextResponse.json(
        {
          error:
            vErr.message +
            " (Did you run the migration to add voided_at/void_reason/etc?)",
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      mode: "voided",
      disposition: hasAllocs ? disposition : null,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}