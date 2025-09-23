import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

type Body = {
  workOrderId: string;
  workOrderLineId: string;
  vehicleId?: string | null;
  customerId?: string | null;
  template: "maintenance50" | "maintenance50-air";
};

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });

  try {
    const body = (await req.json()) as Partial<Body>;
    const workOrderId = body.workOrderId?.trim();
    const workOrderLineId = body.workOrderLineId?.trim();
    const vehicleId = body.vehicleId ?? null;
    const customerId = body.customerId ?? null;
    const template = (body.template as Body["template"]) || "maintenance50";

    if (!workOrderId || !workOrderLineId) {
      return NextResponse.json(
        { error: "workOrderId and workOrderLineId are required" },
        { status: 400 }
      );
    }

    // 1) If the line already has a session, re-use it.
    const { data: existingLine, error: lineErr } = await supabase
      .from("work_order_lines")
      .select("id, inspection_session_id")
      .eq("id", workOrderLineId)
      .maybeSingle();

    if (lineErr) throw lineErr;

    if (existingLine?.inspection_session_id) {
      return NextResponse.json({
        sessionId: existingLine.inspection_session_id,
        reused: true,
      });
    }

    // 2) Check for any existing session for this line+template (safety).
    const { data: existingSession, error: findErr } = await supabase
      .from("inspection_sessions")
      .select("id")
      .eq("work_order_line_id", workOrderLineId)
      .eq("template", template)
      .maybeSingle();

    if (findErr) throw findErr;

    let sessionId = existingSession?.id as string | undefined;

    // 3) Insert session if none.
    if (!sessionId) {
      const { data: inserted, error: insErr } = await supabase
        .from("inspection_sessions")
        .insert({
          work_order_id: workOrderId,
          work_order_line_id: workOrderLineId,
          vehicle_id: vehicleId,
          customer_id: customerId,
          template, // "maintenance50" | "maintenance50-air"
          status: "new",
        })
        .select("id")
        .maybeSingle();

      if (insErr) throw insErr;
      sessionId = inserted?.id as string;
      if (!sessionId) {
        return NextResponse.json(
          { error: "Failed to create inspection session" },
          { status: 500 }
        );
      }
    }

    // 4) Link session back to the line.
    const { error: upErr } = await supabase
      .from("work_order_lines")
      .update({ inspection_session_id: sessionId })
      .eq("id", workOrderLineId);

    if (upErr) throw upErr;

    return NextResponse.json({ sessionId, reused: !!existingSession });
  } catch (e: any) {
    console.error("[inspection session create] error:", e);
    return NextResponse.json(
      { error: e?.message ?? "Failed to create inspection session" },
      { status: 500 }
    );
    }
}