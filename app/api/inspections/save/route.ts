// app/api/inspections/save/route.ts
import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import type { InspectionSession } from "@/features/inspections/lib/inspection/types";

type DB = Database;

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient<DB>({ cookies });

  // 1) parse body
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

  // 2) require auth
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 3) pull optional bits off the session so we can populate columns
  const workOrderId =
    (session as any).workOrderId ??
    (session as any).work_order_id ??
    null;
  const vehicleId =
    (session as any).vehicleId ??
    (session as any).vehicle_id ??
    null;
  const customerId =
    (session as any).customerId ??
    (session as any).customer_id ??
    null;
  const template = (session as any).template ?? null;
  const status =
    (session as any).status ??
    ((session as any).completed ? "completed" : "in_progress");

  // 4) upsert into inspection_sessions
  const { error: upErr } = await supabase
    .from("inspection_sessions")
    .upsert(
      {
        user_id: user.id,
        created_by: user.id,
        work_order_line_id: workOrderLineId,
        work_order_id: workOrderId,
        vehicle_id: vehicleId,
        customer_id: customerId,
        template,
        state: session as unknown as Record<string, unknown>, // 👈 use existing jsonb column
        status,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "work_order_line_id", // unique per line
      }
    );

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}