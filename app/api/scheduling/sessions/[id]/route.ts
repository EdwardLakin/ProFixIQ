import { NextResponse, type NextRequest } from "next/server";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import type { Database } from "@shared/types/types/supabase";

type SessionUpdate = Pick<
  Database["public"]["Tables"]["tech_sessions"]["Update"],
  "started_at" | "ended_at" | "work_order_line_id"
>;

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(req: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  const supabase = createAdminSupabase();
  const body = (await req.json().catch(() => null)) as SessionUpdate | null;

  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (
    body.started_at === undefined &&
    body.ended_at === undefined &&
    body.work_order_line_id === undefined
  ) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { error } = await supabase.from("tech_sessions").update(body).eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  const supabase = createAdminSupabase();

  const { error } = await supabase.from("tech_sessions").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}