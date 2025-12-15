import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@shared/types/types/supabase";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";

type DB = Database;

type PunchUpdate = Pick<
  DB["public"]["Tables"]["punch_events"]["Update"],
  "timestamp" | "event_type"
>;

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const punchId = params.id;

  const supabase = createServerSupabaseRoute();

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { error } = await supabase.from("punch_events").delete().eq("id", punchId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const punchId = params.id;

  const body = (await req.json().catch(() => null)) as PunchUpdate | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.timestamp === undefined && body.event_type === undefined) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const supabase = createServerSupabaseRoute();

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const update: PunchUpdate = {
    ...(body.timestamp !== undefined ? { timestamp: body.timestamp } : {}),
    ...(body.event_type !== undefined ? { event_type: body.event_type } : {}),
  };

  const { error } = await supabase
    .from("punch_events")
    .update(update)
    .eq("id", punchId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}