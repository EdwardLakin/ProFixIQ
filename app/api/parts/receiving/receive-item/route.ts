// /app/api/parts/receiving/receive-item/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type Body = {
  part_request_item_id: string;
  qty: number;
  location_id: string;
  po_id?: string | null;
};

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
}

export async function POST(req: Request) {
  try {
    const supabase = createRouteHandlerClient<DB>({ cookies });

    const body = (await req.json().catch(() => null)) as Body | null;
    if (!body) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    const itemId = String(body.part_request_item_id ?? "").trim();
    const locId = String(body.location_id ?? "").trim();
    const qty = typeof body.qty === "number" ? body.qty : Number(body.qty);

    const poId =
      typeof body.po_id === "string" && body.po_id.trim().length > 0
        ? body.po_id.trim()
        : null;

    if (!itemId || !isUuid(itemId)) {
      return NextResponse.json(
        { error: "Invalid part_request_item_id (must be UUID)" },
        { status: 400 },
      );
    }

    if (!locId || !isUuid(locId)) {
      return NextResponse.json(
        { error: "Invalid location_id (must be UUID)" },
        { status: 400 },
      );
    }

    if (!Number.isFinite(qty) || qty <= 0) {
      return NextResponse.json(
        { error: "Invalid qty (must be > 0)" },
        { status: 400 },
      );
    }

    if (poId && !isUuid(poId)) {
      return NextResponse.json(
        { error: "Invalid po_id (must be UUID when provided)" },
        { status: 400 },
      );
    }

    // Auth guard (keeps behavior consistent with other parts routes)
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

    type RpcArgs = DB["public"]["Functions"]["receive_part_request_item"]["Args"];

    const args: RpcArgs = {
      p_item_id: itemId,
      p_location_id: locId,
      p_qty: qty,
      ...(poId ? { p_po_id: poId } : {}),
    };

    const { data, error } = await supabase.rpc("receive_part_request_item", args);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const row = Array.isArray(data) ? data[0] : data;

    return NextResponse.json({ ok: true, result: row });
  } catch (e: unknown) {
    const message =
      e instanceof Error ? e.message : typeof e === "string" ? e : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}