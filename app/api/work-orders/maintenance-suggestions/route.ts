// app/api/work-orders/maintenance-suggestions/route.ts
import "server-only";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { computeMaintenanceSuggestionsForWorkOrder } from "@/features/maintenance/server/computeMaintenanceSuggestions";

type DB = Database;

export const runtime = "nodejs";

type PostBody = {
  workOrderId?: string;
};

function normalizeWorkOrderId(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

/* ------------------------- GET ------------------------- */
/** Fetch cached suggestions */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const workOrderId = normalizeWorkOrderId(url.searchParams.get("workOrderId"));

  if (!workOrderId) {
    return NextResponse.json({ error: "Missing workOrderId" }, { status: 400 });
  }

  const supabase = createServerComponentClient<DB>({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("maintenance_suggestions")
    .select("*")
    .eq("work_order_id", workOrderId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json(
      { status: "empty", suggestions: [] },
      { status: 200 },
    );
  }

  return NextResponse.json({
    status: data.status,
    suggestions: data.suggestions ?? [],
    mileage_km: data.mileage_km,
    error_message: data.error_message,
    created_at: data.created_at,
    updated_at: data.updated_at,
  });
}

/* ------------------------- POST ------------------------- */
/** Compute + cache suggestions */
export async function POST(req: Request) {
  const supabase = createServerComponentClient<DB>({ cookies });

  let body: PostBody = {};
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const workOrderId = normalizeWorkOrderId(body.workOrderId);
  if (!workOrderId) {
    return NextResponse.json({ error: "Missing workOrderId" }, { status: 400 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  try {
    // mark pending (best effort)
    const { error: upsertErr } = await supabase
      .from("maintenance_suggestions")
      .upsert(
        {
          work_order_id: workOrderId,
          status: "pending",
          error_message: null,
        },
        { onConflict: "work_order_id" },
      );

    if (upsertErr) {
      return NextResponse.json({ error: upsertErr.message }, { status: 500 });
    }

    const { suggestions } = await computeMaintenanceSuggestionsForWorkOrder({
      supabase,
      workOrderId,
    });

    return NextResponse.json({ status: "ready", suggestions });
  } catch (e) {
    const errorMessage =
      e instanceof Error ? e.message : "Failed to compute suggestions";

    await supabase
      .from("maintenance_suggestions")
      .upsert(
        {
          work_order_id: workOrderId,
          status: "error",
          error_message: errorMessage,
        },
        { onConflict: "work_order_id" },
      );

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}