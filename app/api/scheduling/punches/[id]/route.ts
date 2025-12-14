import { NextResponse, type NextRequest } from "next/server";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import type { Database } from "@shared/types/types/supabase";

type PunchUpdate = Pick<
  Database["public"]["Tables"]["punch_events"]["Update"],
  "timestamp" | "event_type" | "note"
>;

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = createAdminSupabase();
  const body = (await req.json()) as PunchUpdate;

  const { error } = await supabase
    .from("punch_events")
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
    .from("punch_events")
    .delete()
    .eq("id", params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
