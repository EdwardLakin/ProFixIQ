import { NextResponse, type NextRequest } from "next/server";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import type { Database } from "@shared/types/types/supabase";

type SessionInsert =
  Database["public"]["Tables"]["tech_sessions"]["Insert"];

export async function POST(req: NextRequest) {
  const supabase = createAdminSupabase();
  const body = (await req.json()) as SessionInsert;

  if (!body.user_id || !body.shop_id || !body.started_at) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 },
    );
  }

  const { error } = await supabase.from("tech_sessions").insert(body);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
