import { NextResponse, type NextRequest } from "next/server";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import type { Database } from "@shared/types/types/supabase";

type SessionUpdate = Pick<
  Database["public"]["Tables"]["tech_sessions"]["Update"],
  "started_at" | "ended_at" | "work_order_line_id"
>;

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = createAdminSupabase();
  const body = (await req.json()) as SessionUpdate;

  const { error } = await supabase
    .from("tech_sessions")
    .update(body)
    .eq("id", params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = createAdminSupabase();

  const { error } = await supabase
    .from("tech_sessions")
    .delete()
    .eq("id", params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
