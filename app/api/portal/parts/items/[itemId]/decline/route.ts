// app/api/portal/parts/items/[itemId]/decline/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

function getStringParam(
  params: Record<string, string>,
  key: string,
): string | null {
  const v = params[key];
  return typeof v === "string" && v.trim().length > 0 ? v : null;
}

export async function POST(
  _req: Request,
  ctx: { params: Promise<Record<string, string>> },
) {
  const supabase = createRouteHandlerClient<DB>({ cookies });

  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 401 });
  if (!auth?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const params = await ctx.params;
  const itemId = getStringParam(params, "itemId");
  if (!itemId) return NextResponse.json({ error: "Missing itemId" }, { status: 400 });

  const { error } = await supabase.rpc("portal_decline_part_request_item", {
    p_item_id: itemId,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}