// app/api/work-orders/maintenance-suggestions/route.ts
import "server-only";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { computeMaintenanceSuggestionsForWorkOrder } from "@/features/maintenance/server/computeMaintenanceSuggestions";

type DB = Database;

export const runtime = "nodejs";

/* ------------------------- GET ------------------------- */

export async function GET(req: Request) {
  const url = new URL(req.url);
  const workOrderId = url.searchParams.get("workOrderId");

  if (!workOrderId) {
    return NextResponse.json(
      { error: "Missing workOrderId" },
      { status: 400 }
    );
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
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json(
      { status: "empty", suggestions: [] },
      { status: 200 }
    );
  }

  return NextResponse.json({
    status: data.status,
    suggestions: data.suggestions ?? [],
    mileage_km: data.mileage_km,
    error_message: data.error_message,
  });
}

/* ------------------------- POST ------------------------- */

type PostBody = {
  workOrderId?: string;
};

export async function POST(req: Request) {
  const supabase = createServerComponentClient<DB>({ cookies });

  let body: PostBody = {};

  // Safely parse once
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const workOrderId = body.workOrderId;

  if (!workOrderId) {
    return NextResponse.json(
      { error: "Missing workOrderId" },
      { status: 400 }
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  try {
    // Mark as pending
    const { error: upsertErr } = await supabase
      .from("maintenance_suggestions")
      .upsert(
        {
          work_order_id: workOrderId,
          status: "pending",
          error_message: null,
        },
        { onConflict: "work_order_id" }
      );

    if (upsertErr) {
      return NextResponse.json(
        { error: upsertErr.message },
        { status: 500 }
      );
    }

    // Compute immediately
    const { suggestions } =
      await computeMaintenanceSuggestionsForWorkOrder({
        supabase,
        workOrderId,
      });

    return NextResponse.json({
      status: "ready",
      suggestions,
    });
  } catch (e) {
    const errorMessage =
      e instanceof Error ? e.message : "Failed to compute suggestions";

    // Best effort update
    await supabase
      .from("maintenance_suggestions")
      .upsert(
        {
          work_order_id: workOrderId,
          status: "error",
          error_message: errorMessage,
        },
        { onConflict: "work_order_id" }
      );

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}