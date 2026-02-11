import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import type { Database } from "@shared/types/types/supabase";
import { reviewWorkOrder } from "../_lib/reviewWorkOrder";

type DB = Database;

function isError(x: unknown): x is Error {
  return typeof x === "object" && x !== null && "message" in x;
}

export async function POST(
  ctx: { params: { id?: string } },
) {
  const supabase = createRouteHandlerClient<DB>({ cookies });

  const woId = typeof ctx?.params?.id === "string" ? ctx.params.id : null;

  if (!woId) {
    return NextResponse.json(
      {
        ok: false,
        issues: [{ kind: "bad_request", message: "Missing work order id" }],
      },
      { status: 400 },
    );
  }

  try {
    const result = await reviewWorkOrder({
      supabase,
      workOrderId: woId,
      kind: "invoice_review",
    });

    // Optional: hard 404 on missing WO
    if (!result.ok && result.issues.some((i) => i.kind === "missing_wo")) {
      return NextResponse.json(result, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = isError(e) ? e.message : "Invoice review failed";
    return NextResponse.json(
      { ok: false, issues: [{ kind: "error", message: msg }] },
      { status: 500 },
    );
  }
}