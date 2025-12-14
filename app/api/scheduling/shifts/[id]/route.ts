import { NextResponse, type NextRequest } from "next/server";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import type { Database } from "@shared/types/types/supabase";

type ShiftUpdate = Pick<
  Database["public"]["Tables"]["tech_shifts"]["Update"],
  "start_time" | "end_time" | "status" | "type"
>;

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = createAdminSupabase();
  const body = (await req.json()) as ShiftUpdate;

  const { error } = await supabase
    .from("tech_shifts")
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
    .from("tech_shifts")
    .delete()
    .eq("id", params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
