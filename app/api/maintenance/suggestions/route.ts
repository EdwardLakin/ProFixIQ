import "server-only";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type SuggestionsRow = DB["public"]["Tables"]["maintenance_suggestions"]["Row"];

type Suggestion = unknown; // we’ll normalize on the client

type Body = {
  workOrderId?: string;
};

function parseBody(raw: unknown): Body {
  if (!raw || typeof raw !== "object") return {};
  const obj = raw as Record<string, unknown>;

  const workOrderId =
    typeof obj.workOrderId === "string" && obj.workOrderId.trim().length > 0
      ? obj.workOrderId.trim()
      : undefined;

  return { workOrderId };
}

export async function POST(req: Request) {
  const supabase = createServerComponentClient<DB>({ cookies });

  try {
    const raw = await req.json().catch(() => null);
    const body = parseBody(raw);

    if (!body.workOrderId) {
      return NextResponse.json(
        { error: "Missing workOrderId" },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from("maintenance_suggestions")
      .select("*")
      .eq("work_order_id", body.workOrderId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<SuggestionsRow>();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 },
      );
    }

    if (!data) {
      // No suggestions yet for this work order
      return NextResponse.json({
        ok: true,
        workOrderId: body.workOrderId,
        status: "empty",
        suggestions: [],
      });
    }

    const suggestions: Suggestion[] = Array.isArray(data.suggestions)
      ? (data.suggestions as Suggestion[])
      : [];

    return NextResponse.json({
      ok: true,
      workOrderId: body.workOrderId,
      vehicleId: data.vehicle_id ?? null,
      mileageKm: data.mileage_km ?? null,
      status: data.status ?? null,
      suggestions,
      error_message: data.error_message ?? null,
      created_at: data.created_at,
      updated_at: data.updated_at,
    });
  } catch (e) {
    const msg =
      e instanceof Error
        ? e.message
        : "Failed to load maintenance suggestions";
    return NextResponse.json(
      { error: msg },
      { status: 500 },
    );
  }
}