import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type PRInsert = DB["public"]["Tables"]["part_requests"]["Insert"];
type PRIInsert = DB["public"]["Tables"]["part_request_items"]["Insert"];
type WORow = DB["public"]["Tables"]["work_orders"]["Row"];
type WOLUpdate = DB["public"]["Tables"]["work_order_lines"]["Update"];

type BodyItem = {
  description: string;
  qty: number;
  notes?: string | null;
  workOrderLineId: string; // tie each requested part to a specific job line
};

type Body = {
  workOrderId: string;
  items: BodyItem[];
  notes?: string | null; // header-level notes (optional)
};

function isValidBody(b: unknown): b is Body {
  if (typeof b !== "object" || b === null) return false;
  const o = b as Record<string, unknown>;
  if (typeof o.workOrderId !== "string") return false;
  if (!Array.isArray(o.items) || o.items.length === 0) return false;
  for (const it of o.items) {
    const i = it as Partial<BodyItem>;
    if (
      typeof i?.description !== "string" ||
      typeof i?.qty !== "number" ||
      !Number.isFinite(i.qty) ||
      i.qty <= 0 ||
      typeof i?.workOrderLineId !== "string"
    ) {
      return false;
    }
  }
  return true;
}

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient<DB>({ cookies });

  try {
    const bodyUnknown: unknown = await req.json().catch(() => null);
    if (!isValidBody(bodyUnknown)) {
      return NextResponse.json(
        { error: "Invalid body. Expect { workOrderId, items[] } with positive qty." },
        { status: 400 }
      );
    }

    const { workOrderId, items, notes } = bodyUnknown;

    // 1) Require an authenticated user
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

    // 2) Load work order to derive shop_id (keeps request scoped to shop)
    const { data: wo, error: woErr } = await supabase
      .from("work_orders")
      .select("id, shop_id")
      .eq("id", workOrderId)
      .maybeSingle<WORow>();
    if (woErr) {
      return NextResponse.json({ error: woErr.message }, { status: 400 });
    }
    if (!wo?.id || !wo.shop_id) {
      return NextResponse.json({ error: "Work order not found" }, { status: 404 });
    }

    // 3) Insert part_requests header
    const prInsert: PRInsert = {
      work_order_id: workOrderId,
      shop_id: wo.shop_id,
      requested_by: user.id, // ✅ guaranteed string after guard
      status: "requested",
      notes: notes ?? null,
    };

    const { data: pr, error: prErr } = await supabase
      .from("part_requests")
      .insert(prInsert)
      .select("id")
      .single();
    if (prErr || !pr?.id) {
      return NextResponse.json(
        { error: prErr?.message ?? "Failed to create part request" },
        { status: 500 }
      );
    }

    // 4) Insert items (batch)
    const itemRows: PRIInsert[] = items.map((it) => ({
      request_id: pr.id,
      description: it.description,
      qty: it.qty,
      notes: it.notes ?? null,
      work_order_line_id: it.workOrderLineId,
    }));

    const { error: itemsErr } = await supabase
      .from("part_request_items")
      .insert(itemRows);
    if (itemsErr) {
      // best-effort rollback header if items failed
      await supabase.from("part_requests").delete().eq("id", pr.id);
      return NextResponse.json(
        { error: itemsErr.message ?? "Failed to add request items" },
        { status: 500 }
      );
    }

    // 5) Put affected lines on hold & mark approval pending (tech view: "waiting for approval")
    const lineIds = Array.from(
      new Set(items.map((i) => i.workOrderLineId))
    );
    if (lineIds.length > 0) {
      const updatePayload: WOLUpdate = {
        status: "on_hold",
        approval_state: "pending",
      };
      const { error: wolErr } = await supabase
        .from("work_order_lines")
        .update(updatePayload)
        .in("id", lineIds);
      if (wolErr) {
        // Don’t fail the entire request if this best-effort UI state update errors
        // but do report it so you can monitor logs.
        // eslint-disable-next-line no-console
        console.warn("[parts/requests/create] line state update failed:", wolErr.message);
      }
    }

    return NextResponse.json({ requestId: pr.id });
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : typeof e === "string" ? e : "Server error";
    // eslint-disable-next-line no-console
    console.error("[parts/requests/create] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}