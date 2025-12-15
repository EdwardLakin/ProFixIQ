import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@shared/types/types/supabase";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";

type DB = Database;

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const punchId = params?.id;

  if (!punchId) {
    return NextResponse.json({ error: "Missing punch id" }, { status: 400 });
  }

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

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const punchId = params?.id;

  if (!punchId) {
    return NextResponse.json({ error: "Missing punch id" }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as
    | {
        timestamp?: string;
        event_type?: DB["public"]["Tables"]["punch_events"]["Row"]["event_type"];
      }
    | null;

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

  const update: Partial<DB["public"]["Tables"]["punch_events"]["Update"]> = {
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