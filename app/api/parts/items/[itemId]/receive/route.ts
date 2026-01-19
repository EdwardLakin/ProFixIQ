// app/api/parts/requests/items/[itemId]/receive/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type Body = {
  location_id: string;
  qty: number;
  po_id?: string | null;
};

export async function POST(
  req: Request,
  ctx: { params: Promise<{ itemId: string }> },
) {
  try {
    const supabase = createRouteHandlerClient<DB>({ cookies });

    const { itemId } = await ctx.params;

    const body = (await req.json().catch(() => null)) as Body | null;
    if (
      !itemId ||
      !body ||
      typeof body.location_id !== "string" ||
      typeof body.qty !== "number" ||
      !Number.isFinite(body.qty) ||
      body.qty <= 0
    ) {
      return NextResponse.json(
        { error: "Invalid body. Expect { location_id, qty, po_id? }" },
        { status: 400 },
      );
    }

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr) return NextResponse.json({ error: userErr.message }, { status: 401 });
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    type RpcArgs =
      DB["public"]["Functions"]["receive_part_request_item"]["Args"];

    const args: RpcArgs = {
      p_item_id: itemId,
      p_location_id: body.location_id,
      p_qty: body.qty,
      ...(body.po_id ? { p_po_id: body.po_id } : {}),
    };

    const { data, error } = await supabase.rpc("receive_part_request_item", args);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // data is a row (table return) or array depending on supabase client behavior; normalize
    const row = Array.isArray(data) ? data[0] : data;

    return NextResponse.json({ ok: true, result: row });
  } catch (e: unknown) {
    const message =
      e instanceof Error ? e.message : typeof e === "string" ? e : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}