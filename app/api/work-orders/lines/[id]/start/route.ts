import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const id = params.id;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const supabase = createRouteHandlerClient({ cookies });

  // Ensure user is signed in (so RLS policies apply)
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date().toISOString();

  // If already punched in, only flip status; otherwise set punched_in_at and status
  const { data: row, error: selErr } = await supabase
    .from("work_order_lines")
    .select("id, punched_in_at, punched_out_at, status")
    .eq("id", id)
    .maybeSingle();

  if (selErr) return NextResponse.json({ error: selErr.message }, { status: 400 });
  if (!row) return NextResponse.json({ error: "Line not found" }, { status: 404 });

  const payload = {
  status: "in_progress" as const,
  punched_in_at: row?.punched_in_at ?? now,
  punched_out_at: row?.punched_out_at ? null : undefined,
};

  const { error: updErr } = await supabase
    .from("work_order_lines")
    .update(payload)
    .eq("id", id);

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 });

  return NextResponse.json({ success: true });
}
