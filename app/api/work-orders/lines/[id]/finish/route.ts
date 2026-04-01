// app/api/work-orders/lines/[id]/finish/route.ts
// app/api/work-orders/lines/[id]/finish/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type Body = {
  cause?: string | null;
  correction?: string | null;
};

type LineRow = Pick<
  DB["public"]["Tables"]["work_order_lines"]["Row"],
  | "id"
  | "work_order_id"
  | "status"
  | "cause"
  | "correction"
  | "labor_time"
  | "punched_in_at"
  | "punched_out_at"
>;

function extractLineId(req: NextRequest): string | null {
  const m = req.nextUrl.pathname.match(
    /\/api\/work-orders\/lines\/([^/]+)\/finish$/,
  );
  return m?.[1] ?? null;
}

function cleanString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function POST(req: NextRequest) {
  const id = extractLineId(req);
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const supabase = createRouteHandlerClient<DB>({ cookies });

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr) {
    return NextResponse.json({ error: userErr.message }, { status: 500 });
  }

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as Body;
  const incomingCause = cleanString(body.cause);
  const incomingCorrection = cleanString(body.correction);

  const { data: existingLine, error: lineLoadErr } = await supabase
    .from("work_order_lines")
    .select(
      "id, work_order_id, status, cause, correction, labor_time, punched_in_at, punched_out_at",
    )
    .eq("id", id)
    .maybeSingle<LineRow>();

  if (lineLoadErr) {
    return NextResponse.json({ error: lineLoadErr.message }, { status: 500 });
  }

  if (!existingLine) {
    return NextResponse.json({ error: "Line not found" }, { status: 404 });
  }

  const finalCause = incomingCause ?? cleanString(existingLine.cause);
  const finalCorrection =
    incomingCorrection ?? cleanString(existingLine.correction);
  const laborTime =
    typeof existingLine.labor_time === "number" ? existingLine.labor_time : 0;

  if (!finalCause) {
    return NextResponse.json(
      { error: "Cause is required before finishing this job." },
      { status: 400 },
    );
  }

  if (!finalCorrection) {
    return NextResponse.json(
      { error: "Correction is required before finishing this job." },
      { status: 400 },
    );
  }

  if (laborTime <= 0) {
    return NextResponse.json(
      { error: "Labor time must be greater than 0 before finishing this job." },
      { status: 400 },
    );
  }

  const nowIso = new Date().toISOString();

  const updatePayload: DB["public"]["Tables"]["work_order_lines"]["Update"] = {
    status: "completed",
    punched_out_at: nowIso,
    cause: finalCause,
    correction: finalCorrection,
    updated_at: nowIso,
  };

  const { data: updatedLine, error: updateErr } = await supabase
    .from("work_order_lines")
    .update(updatePayload)
    .eq("id", id)
    .select(
      "id, work_order_id, status, cause, correction, labor_time, punched_in_at, punched_out_at",
    )
    .single<LineRow>();

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 400 });
  }

  const inspectionUpdate: DB["public"]["Tables"]["inspections"]["Update"] = {
    completed: true,
    is_draft: false,
    locked: true,
    status: "completed",
    finalized_at: nowIso,
    finalized_by: user.id,
    updated_at: nowIso,
  };

  const { error: inspectionErr } = await supabase
    .from("inspections")
    .update(inspectionUpdate)
    .eq("work_order_line_id", id);

  if (inspectionErr) {
    console.warn("[finish] inspections finalize failed:", inspectionErr.message);
  }

  try {
    await supabase.from("activity_logs").insert({
      entity_type: "work_order_line",
      entity_id: id,
      action: "finish",
      actor_id: user.id,
      created_at: nowIso,
    });
  } catch (error) {
    console.warn("[finish] activity log insert failed", error);
  }

  return NextResponse.json({
    success: true,
    line: updatedLine,
  });
}