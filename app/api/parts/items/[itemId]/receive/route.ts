// /app/api/parts/requests/items/[itemId]/receive/route.ts
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

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ itemId: string }> }, // ✅ Next 15 expects params as Promise
) {
  try {
    const supabase = createRouteHandlerClient<DB>({ cookies });

    const { itemId: rawItemId } = await ctx.params; // ✅ await params
    const itemId = typeof rawItemId === "string" ? rawItemId : "";

    const body = (await req.json().catch(() => null)) as Body | null;

    if (
      !itemId ||
      typeof itemId !== "string" ||
      !body ||
      typeof body.location_id !== "string" ||
      body.location_id.length === 0 ||
      typeof body.qty !== "number" ||
      !Number.isFinite(body.qty) ||
      body.qty <= 0
    ) {
      return NextResponse.json(
        { error: "Invalid body. Expect { location_id, qty, po_id? }" },
        { status: 400 },
      );
    }

    if (body.po_id != null) {
      if (typeof body.po_id !== "string" || !isUuid(body.po_id)) {
        return NextResponse.json(
          { error: "Invalid po_id (must be a UUID string when provided)" },
          { status: 400 },
        );
      }
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

    type RpcArgs =
      DB["public"]["Functions"]["receive_part_request_item"]["Args"];

    const args: RpcArgs = {
      p_item_id: itemId,
      p_location_id: body.location_id,
      p_qty: body.qty,
      ...(body.po_id ? { p_po_id: body.po_id } : {}),
    };

    const { data, error } = await supabase.rpc(
      "receive_part_request_item",
      args,
    );

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