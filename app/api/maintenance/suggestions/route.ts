import "server-only";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type SuggestionsRow = DB["public"]["Tables"]["maintenance_suggestions"]["Row"];

type Suggestion = unknown; // normalized on client

type Body = {
  workOrderId?: string;
  vehicleId?: string;
};

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function parseBody(raw: unknown): Body {
  if (!raw || typeof raw !== "object") return {};
  const obj = raw as Record<string, unknown>;

  const workOrderId = isNonEmptyString(obj.workOrderId) ? obj.workOrderId.trim() : undefined;
  const vehicleId = isNonEmptyString(obj.vehicleId) ? obj.vehicleId.trim() : undefined;

  return { workOrderId, vehicleId };
}

function coerceSuggestions(raw: unknown): Suggestion[] {
  // common: jsonb array
  if (Array.isArray(raw)) return raw as Suggestion[];

  // sometimes stored as stringified JSON
  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return [];
    try {
      const parsed = JSON.parse(s) as unknown;
      return Array.isArray(parsed) ? (parsed as Suggestion[]) : [];
    } catch {
      return [];
    }
  }

  // sometimes stored as { suggestions: [...] } or { items: [...] }
  if (raw && typeof raw === "object") {
    const rec = raw as Record<string, unknown>;
    const inner =
      (Array.isArray(rec.suggestions) ? rec.suggestions : null) ??
      (Array.isArray(rec.items) ? rec.items : null);

    return Array.isArray(inner) ? (inner as Suggestion[]) : [];
  }

  return [];
}

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient<DB>({ cookies });

  try {
    const raw = await req.json().catch(() => null);
    const body = parseBody(raw);

    if (!body.workOrderId && !body.vehicleId) {
      return NextResponse.json(
        { error: "Missing workOrderId or vehicleId" },
        { status: 400 },
      );
    }

    // 1) Prefer exact work-order match
    let row: SuggestionsRow | null = null;

    if (body.workOrderId) {
      const { data, error } = await supabase
        .from("maintenance_suggestions")
        .select("*")
        .eq("work_order_id", body.workOrderId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<SuggestionsRow>();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      row = (data as SuggestionsRow | null) ?? null;
    }

    // 2) Fallback: latest suggestions by vehicle (common pattern)
    if (!row && body.vehicleId) {
      const { data, error } = await supabase
        .from("maintenance_suggestions")
        .select("*")
        .eq("vehicle_id", body.vehicleId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<SuggestionsRow>();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      row = (data as SuggestionsRow | null) ?? null;
    }

    if (!row) {
      return NextResponse.json({
        ok: true,
        workOrderId: body.workOrderId ?? null,
        vehicleId: body.vehicleId ?? null,
        status: "empty",
        suggestions: [],
      });
    }

    const suggestions = coerceSuggestions((row as unknown as { suggestions?: unknown }).suggestions);

    return NextResponse.json({
      ok: true,
      workOrderId: (row as unknown as { work_order_id?: unknown }).work_order_id ?? body.workOrderId ?? null,
      vehicleId: row.vehicle_id ?? body.vehicleId ?? null,
      mileageKm: (row as unknown as { mileage_km?: unknown }).mileage_km ?? null,
      status: row.status ?? null,
      suggestions,
      error_message: (row as unknown as { error_message?: unknown }).error_message ?? null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    });
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Failed to load maintenance suggestions";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}