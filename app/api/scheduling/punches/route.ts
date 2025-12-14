import { NextResponse, type NextRequest } from "next/server";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import type { Database } from "@shared/types/types/supabase";

type PunchInsert =
  Database["public"]["Tables"]["punch_events"]["Insert"];

export async function POST(req: NextRequest) {
  const supabase = createAdminSupabase();
  const body = (await req.json()) as PunchInsert;

  if (!body.shift_id || !body.event_type || !body.timestamp) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 },
    );
  }

  const { error } = await supabase.from("punch_events").insert({
    shift_id: body.shift_id,
    event_type: body.event_type,
    timestamp: body.timestamp,
    note: body.note ?? null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
