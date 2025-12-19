// app/api/portal/parts/items/[itemId]/approve/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

export async function POST(
  _req: Request,
  { params }: { params: { itemId: string } },
) {
  const supabase = createRouteHandlerClient<DB>({ cookies });

  const { error } = await supabase.rpc("portal_approve_part_request_item", {
    p_item_id: params.itemId,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}