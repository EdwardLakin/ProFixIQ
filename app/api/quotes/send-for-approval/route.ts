// /app/api/quotes/send-for-approval/route.ts (FULL FILE REPLACEMENT)
import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import type { Database } from "@shared/types/types/supabase";

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
}

function asString(x: unknown): string | null {
  return typeof x === "string" ? x : null;
}

function toStringArray(x: unknown): string[] | null {
  if (!Array.isArray(x)) return null;
  const out: string[] = [];
  for (const v of x) {
    if (typeof v !== "string") return null;
    out.push(v);
  }
  return out;
}

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient<Database>({ cookies });

  let workOrderId: string | null = null;
  let lineIds: string[] | null = null;

  try {
    const body = (await req.json().catch(() => null)) as unknown;

    if (typeof body !== "object" || body === null) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    workOrderId = asString((body as Record<string, unknown>).workOrderId);
    lineIds = toStringArray((body as Record<string, unknown>).lineIds);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!workOrderId || !lineIds || lineIds.length === 0) {
    return NextResponse.json(
      { error: "workOrderId and lineIds[] required" },
      { status: 400 },
    );
  }

  // ✅ Catch the classic “pattern” error early (custom_id passed instead of UUID)
  if (!isUuid(workOrderId)) {
    return NextResponse.json(
      {
        error:
          "Invalid workOrderId (expected UUID). You may be sending custom_id instead.",
        detail: { received: workOrderId },
      },
      { status: 400 },
    );
  }

  // ✅ line ids must also be UUIDs
  const badLineIds = lineIds.filter((id) => !isUuid(id));
  if (badLineIds.length > 0) {
    return NextResponse.json(
      {
        error: "One or more lineIds are invalid (expected UUIDs).",
        detail: { badLineIds },
      },
      { status: 400 },
    );
  }

  const { error } = await supabase.rpc("send_for_approval", {
    _wo: workOrderId,
    _line_ids: lineIds,
    _set_wo_status: true,
  });

  if (error) {
    return NextResponse.json(
      {
        error: error.message,
        code: (error as unknown as { code?: string }).code,
        details: (error as unknown as { details?: string }).details,
        hint: (error as unknown as { hint?: string }).hint,
      },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true });
}