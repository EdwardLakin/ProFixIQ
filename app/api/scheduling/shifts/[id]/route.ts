// app/api/scheduling/shifts/[id]/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import type { Database } from "@shared/types/types/supabase";

type ShiftUpdate = Pick<
  Database["public"]["Tables"]["tech_shifts"]["Update"],
  "start_time" | "end_time" | "status" | "type"
>;

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(req: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  const supabase = createAdminSupabase();

  const body = (await req.json().catch(() => null)) as Partial<ShiftUpdate> | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const update: Partial<ShiftUpdate> = {
    ...(body.start_time !== undefined ? { start_time: body.start_time } : {}),
    ...(body.end_time !== undefined ? { end_time: body.end_time } : {}),
    ...(body.status !== undefined ? { status: body.status } : {}),
    ...(body.type !== undefined ? { type: body.type } : {}),
  };

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { error } = await supabase.from("tech_shifts").update(update).eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  const supabase = createAdminSupabase();

  const { error } = await supabase.from("tech_shifts").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}