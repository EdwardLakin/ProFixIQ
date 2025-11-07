// app/api/inspections/save/route.ts
import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import type { InspectionSession } from "@/features/inspections/lib/inspection/types";

type DB = Database;

/**
 * Body shape we expect from the client.
 * You already send { workOrderLineId, session } from saveInspectionSession(...)
 */
type SaveBody = {
  workOrderLineId: string;
  session: InspectionSession;
};

/**
 * Safely turn a typed object into a plain JSON object
 * so Supabase can store it in a jsonb column without TS complaining.
 */
const serialize = <T extends object>(obj: T): Record<string, unknown> =>
  JSON.parse(JSON.stringify(obj)) as Record<string, unknown>;

/**
 * Very small helpers to read optional strings off the session
 * without introducing `any`.
 */
const getString = (value: unknown): string | null => {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  return null;
};

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient<DB>({ cookies });

  // 1) parse body
  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const body = parsed as Partial<SaveBody>;
  if (!body.workOrderLineId || !body.session) {
    return NextResponse.json(
      { error: "Missing workOrderLineId or session" },
      { status: 400 },
    );
  }

  // 2) make sure user is signed in
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workOrderLineId = body.workOrderLineId;
  const session = body.session;

  // 3) pull a few optional fields off the session if they exist
  // (these may or may not exist in your actual InspectionSession — we gate them)
  const workOrderId = getString((session as unknown as Record<string, unknown>)["workOrderId"]);
  const vehicleId = getString((session as unknown as Record<string, unknown>)["vehicleId"]);
  const customerId = getString((session as unknown as Record<string, unknown>)["customerId"]);
  const template = getString((session as unknown as Record<string, unknown>)["template"]);
  const status = getString((session as unknown as Record<string, unknown>)["status"]);
  const completedAtRaw = (session as unknown as Record<string, unknown>)["completedAt"];
  const completed_at =
    typeof completedAtRaw === "string" && completedAtRaw.trim().length > 0
      ? completedAtRaw
      : null;

  // 4) upsert into your existing table structure
  // table columns (from you):
  // id | user_id | work_order_id | state (jsonb) | updated_at | work_order_line_id | vehicle_id | customer_id | template | created_by | completed_at | status
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
        status,
        completed_at,
        state: serialize(session), // 👈 the important part: jsonb = your session
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "work_order_line_id",
      },
    );

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}