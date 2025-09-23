import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type Body = {
  workOrderId: string;
  workOrderLineId: string;
  vehicleId?: string | null;
  customerId?: string | null;
  template: "maintenance50" | "maintenance50-air";
};

type JsonOk = { sessionId: string; reused: boolean };
type JsonErr = { error: string };

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient<Database>({ cookies });

  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    return NextResponse.json<JsonErr>(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const body = parsed as Partial<Body>;
  const workOrderId = body.workOrderId?.trim();
  const workOrderLineId = body.workOrderLineId?.trim();
  const vehicleId = body.vehicleId ?? null;
  const customerId = body.customerId ?? null;
  const template: Body["template"] = body.template ?? "maintenance50";

  if (!workOrderId || !workOrderLineId) {
    return NextResponse.json<JsonErr>(
      { error: "workOrderId and workOrderLineId are required" },
      { status: 400 }
    );
  }

  try {
    // 1) If the line already has a session, reuse it
    const { data: existingLine, error: lineErr } = await supabase
      .from("work_order_lines")
      .select("id, inspection_session_id")
      .eq("id", workOrderLineId)
      .maybeSingle();

    if (lineErr) throw new Error(lineErr.message);

    if (existingLine?.inspection_session_id) {
      return NextResponse.json<JsonOk>({
        sessionId: existingLine.inspection_session_id,
        reused: true,
      });
    }

    // 2) Check for an existing session (safety)
    const { data: existingSession, error: findErr } = await supabase
      .from("inspection_sessions")
      .select("id")
      .eq("work_order_line_id", workOrderLineId)
      .eq("template", template)
      .maybeSingle();

    if (findErr) throw new Error(findErr.message);

    let sessionId: string | undefined = existingSession?.id ?? undefined;

    // 3) Insert session if none exists
    if (!sessionId) {
      const { data: inserted, error: insErr } = await supabase
        .from("inspection_sessions")
        .insert({
          work_order_id: workOrderId,
          work_order_line_id: workOrderLineId,
          vehicle_id: vehicleId,
          customer_id: customerId,
          template,
          status: "new",
        })
        .select("id")
        .maybeSingle();

      if (insErr) throw new Error(insErr.message);
      sessionId = inserted?.id;
      if (!sessionId) {
        return NextResponse.json<JsonErr>(
          { error: "Failed to create inspection session" },
          { status: 500 }
        );
      }
    }

    // 4) Link session back to the line
    const { error: upErr } = await supabase
      .from("work_order_lines")
      .update({ inspection_session_id: sessionId })
      .eq("id", workOrderLineId);

    if (upErr) throw new Error(upErr.message);

    return NextResponse.json<JsonOk>({ sessionId, reused: !!existingSession });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Failed to create inspection session";
    console.error("[inspection session create] error:", e);
    return NextResponse.json<JsonErr>({ error: message }, { status: 500 });
  }
}