// app/api/scheduling/punches/[id]/route.ts
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@shared/types/types/supabase";
import {
  createServerSupabaseRoute,
} from "@/features/shared/lib/supabase/server";

type DB = Database;

type RouteParams = {
  params: {
    id: string;
  };
};

/* ------------------------------------------------------------------ */
/* DELETE /api/scheduling/punches/:id                                  */
/* ------------------------------------------------------------------ */
export async function DELETE(
  _req: NextRequest,
  { params }: RouteParams,
) {
  const punchId = params.id;

  if (!punchId) {
    return NextResponse.json(
      { error: "Missing punch id" },
      { status: 400 },
    );
  }

  const supabase = createServerSupabaseRoute();

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401 },
    );
  }

  // RLS ensures:
  // - user owns the punch (via user_id)
  // - shift ownership enforced by triggers (Rule A)
  const { error } = await supabase
    .from("punch_events")
    .delete()
    .eq("id", punchId);

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}

/* ------------------------------------------------------------------ */
/* PUT /api/scheduling/punches/:id                                     */
/* ------------------------------------------------------------------ */
export async function PUT(
  req: NextRequest,
  { params }: RouteParams,
) {
  const punchId = params.id;

  if (!punchId) {
    return NextResponse.json(
      { error: "Missing punch id" },
      { status: 400 },
    );
  }

  const body = (await req.json().catch(() => null)) as
    | {
        timestamp?: string;
        event_type?: DB["public"]["Tables"]["punch_events"]["Row"]["event_type"];
      }
    | null;

  if (!body) {
    return NextResponse.json(
      { error: "Invalid JSON" },
      { status: 400 },
    );
  }

  if (!body.timestamp && !body.event_type) {
    return NextResponse.json(
      { error: "Nothing to update" },
      { status: 400 },
    );
  }

  const supabase = createServerSupabaseRoute();

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401 },
    );
  }

  const update: Partial<
    DB["public"]["Tables"]["punch_events"]["Update"]
  > = {
    ...(body.timestamp ? { timestamp: body.timestamp } : {}),
    ...(body.event_type ? { event_type: body.event_type } : {}),
  };

  const { error } = await supabase
    .from("punch_events")
    .update(update)
    .eq("id", punchId);

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}