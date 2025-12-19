import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;


function getStringParam(
  params: Record<string, unknown>,
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

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 401 });
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const params = await ctx.params;
  const lineId = getStringParam(params, "lineId");
  if (!lineId) return NextResponse.json({ error: "Missing lineId" }, { status: 400 });

  // If you truly want "approve the whole line" you need an RPC for it.
  // If you DON'T have one, fail loudly so you don’t silently ship broken behavior.
  return NextResponse.json(
    { error: "Line approve is not supported. Approve individual part_request_items instead." },
    { status: 400 },
  );
}