// app/api/inspections/save/route.ts
import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import type { InspectionSession } from "@/features/inspections/lib/inspection/types";

type DB = Database;

/**
 * Upsert an inspection session payload by work_order_line_id.
 * Body: { workOrderLineId: string, session: InspectionSession }
 * Table: inspection_sessions(work_order_line_id uuid unique, payload jsonb, updated_at timestamptz)
 */
export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient<DB>({ cookies });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { workOrderLineId, session } = (body ?? {}) as {
    workOrderLineId?: string;
    session?: InspectionSession;
  };

  if (!workOrderLineId || !session) {
    return NextResponse.json(
      { error: "Missing workOrderLineId or session" },
      { status: 400 }
    );
    }

  // Require auth
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Upsert by unique line id
  const { error: upErr } = await supabase
    .from("inspection_sessions")
    .upsert(
      {
        work_order_line_id: workOrderLineId,
        payload: session as unknown as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "work_order_line_id" }
    );

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}