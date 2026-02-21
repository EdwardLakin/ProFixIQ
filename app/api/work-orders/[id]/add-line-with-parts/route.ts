// /app/api/work-orders/[id]/add-line-with-parts/route.ts
import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database, TablesInsert } from "@shared/types/types/supabase";

type DB = Database;

type WorkOrderRow = DB["public"]["Tables"]["work_orders"]["Row"];
type StockLocationRow = DB["public"]["Tables"]["stock_locations"]["Row"];

type WorkOrderLineInsert = TablesInsert<"work_order_lines">;
type AllocationInsert = TablesInsert<"work_order_part_allocations">;

type LineStatus =
  | "awaiting"
  | "queued"
  | "in_progress"
  | "on_hold"
  | "paused"
  | "completed"
  | "assigned"
  | "unassigned"
  | "awaiting_approval"
  | "declined";

type ApprovalState = "pending" | "approved" | "declined" | null;

type JobType =
  | "diagnosis"
  | "inspection"
  | "maintenance"
  | "repair"
  | "tech-suggested";

type PartLine = {
  part_id?: string | null;
  name?: string;
  qty?: number;
  cost?: number; // unit cost
  notes?: string;
};

type AISuggestion = {
  parts: PartLine[];
  laborHours: number;
  summary?: string;
  confidence?: "low" | "medium" | "high";
  notes?: string;
  title?: string;
};

type Body = {
  description: string;
  jobType?: JobType;
  suggestion?: AISuggestion;

  // optional linkages
  menuItemId?: string | null;
  inspectionTemplateId?: string | null;

  // optional explicit stock location for allocations
  locationId?: string | null;

  // optional advisor notes
  notes?: string | null;
};

function isUuid(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const s = v.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s,
  );
}

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function clampNonNeg(n: number): number {
  return n < 0 ? 0 : n;
}

export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  const supabase = createRouteHandlerClient<DB>({ cookies });

  try {
    const workOrderId = ctx?.params?.id ?? "";
    if (!isUuid(workOrderId)) {
      return NextResponse.json(
        { ok: false, error: "bad_request", detail: "Invalid work order id" },
        { status: 400 },
      );
    }

    const body = (await req.json().catch(() => null)) as Body | null;

    const description =
      typeof body?.description === "string" ? body.description.trim() : "";

    if (!description) {
      return NextResponse.json(
        { ok: false, error: "bad_request", detail: "description is required" },
        { status: 400 },
      );
    }

    // AUTH
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json(
        { ok: false, error: "auth_error", detail: userErr?.message ?? "Unauthorized" },
        { status: 401 },
      );
    }

    // Load work order -> shop_id (+vehicle_id if you want)
    const { data: wo, error: woErr } = await supabase
      .from("work_orders")
      .select("id, shop_id, vehicle_id")
      .eq("id", workOrderId)
      .maybeSingle<Pick<WorkOrderRow, "id" | "shop_id" | "vehicle_id">>();

    if (woErr) {
      return NextResponse.json(
        { ok: false, error: "order_load_failed", detail: woErr.message },
        { status: 500 },
      );
    }

    const shopId = wo?.shop_id ?? null;
    if (!shopId) {
      return NextResponse.json(
        { ok: false, error: "missing_shop", detail: "work order missing shop_id" },
        { status: 400 },
      );
    }

    // Set shop context for RLS
    const { error: ctxErr } = await supabase.rpc("set_current_shop_id", {
      p_shop_id: shopId,
    });
    if (ctxErr) {
      return NextResponse.json(
        { ok: false, error: "shop_context_failed", detail: ctxErr.message },
        { status: 403 },
      );
    }

    // Resolve allocation location (stock location)
    let resolvedLocationId: string | null =
      typeof body?.locationId === "string" && body.locationId.trim().length
        ? body.locationId.trim()
        : null;

    if (resolvedLocationId && !isUuid(resolvedLocationId)) {
      return NextResponse.json(
        { ok: false, error: "bad_request", detail: "locationId must be a UUID" },
        { status: 400 },
      );
    }

    if (!resolvedLocationId) {
      const { data: locs, error: locErr } = await supabase
        .from("stock_locations")
        .select("id, shop_id, code, name")
        .eq("shop_id", shopId)
        .order("code", { ascending: true })
        .order("name", { ascending: true });

      if (locErr) {
        return NextResponse.json(
          { ok: false, error: "location_load_failed", detail: locErr.message },
          { status: 500 },
        );
      }

      const rows = (locs ?? []) as Pick<
        StockLocationRow,
        "id" | "shop_id" | "code" | "name"
      >[];

      if (rows.length === 0) {
        return NextResponse.json(
          {
            ok: false,
            error: "no_stock_locations",
            detail:
              "No stock_locations exist for this shop. Create at least one stock location before allocating parts.",
          },
          { status: 400 },
        );
      }

      if (rows.length > 1) {
        return NextResponse.json(
          {
            ok: false,
            error: "multiple_stock_locations",
            detail:
              "Multiple stock locations exist for this shop. Pass locationId to choose where to allocate from.",
            locations: rows.map((r) => ({
              id: r.id,
              code: r.code ?? null,
              name: r.name ?? null,
            })),
          },
          { status: 409 },
        );
      }

      resolvedLocationId = rows[0]?.id ?? null;
    }

    if (!resolvedLocationId) {
      return NextResponse.json(
        { ok: false, error: "missing_location", detail: "Could not resolve locationId" },
        { status: 400 },
      );
    }

    // Compose notes (keep compact)
    const suggestion = body?.suggestion ?? null;
    const notesParts: string[] = [];

    if (typeof body?.notes === "string" && body.notes.trim()) {
      notesParts.push(body.notes.trim());
    }

    if (suggestion?.summary && suggestion.summary.trim()) {
      notesParts.push(`AI: ${suggestion.summary.trim()}`);
    }

    const notes = notesParts.length ? notesParts.join(" • ") : null;

    const labor_time =
      suggestion && typeof suggestion.laborHours === "number"
        ? clampNonNeg(suggestion.laborHours)
        : null;

    const jobType: JobType =
      body?.jobType && typeof body.jobType === "string"
        ? body.jobType
        : "inspection";

    // Insert work order line
    const lineInsert: WorkOrderLineInsert = {
      work_order_id: workOrderId,
      shop_id: shopId,
      vehicle_id: wo?.vehicle_id ?? null,
      description,
      job_type: jobType,
      status: "awaiting_approval" as LineStatus,
      approval_state: "pending" as ApprovalState,
      labor_time,
      notes,

      // optional linkages if columns exist (they do in your generated types)
      menu_item_id: body?.menuItemId ?? null,
      inspection_template_id: body?.inspectionTemplateId ?? null,
      template_id: body?.inspectionTemplateId ?? null,
    };

    const { data: createdLine, error: insErr } = await supabase
      .from("work_order_lines")
      .insert(lineInsert)
      .select("id")
      .single();

    if (insErr || !createdLine?.id) {
      return NextResponse.json(
        { ok: false, error: "line_insert_failed", detail: insErr?.message ?? "Insert failed" },
        { status: 500 },
      );
    }

    const lineId = createdLine.id as string;

    // Insert allocations (only for parts that have part_id)
    const parts = Array.isArray(suggestion?.parts) ? suggestion!.parts : [];
    const allocs: AllocationInsert[] = parts
      .map((p) => {
        const partId = typeof p.part_id === "string" ? p.part_id.trim() : "";
        if (!isUuid(partId)) return null;

        const qty = clampNonNeg(num(p.qty || 0));
        if (qty <= 0) return null;

        const unit_cost = clampNonNeg(num(p.cost ?? 0));

        const a: AllocationInsert = {
          work_order_line_id: lineId,
          work_order_id: workOrderId,
          shop_id: shopId,
          part_id: partId,
          location_id: resolvedLocationId!,
          qty,
          unit_cost,
        };
        return a;
      })
      .filter((x): x is AllocationInsert => x !== null);

    if (allocs.length > 0) {
      const { error: allocInsertErr } = await supabase
        .from("work_order_part_allocations")
        .insert(allocs);

      if (allocInsertErr) {
        // We do NOT fail the line creation; but we do report it.
        return NextResponse.json(
          {
            ok: true,
            id: lineId,
            allocations_ok: false,
            allocations_error: allocInsertErr.message,
          },
          { status: 200 },
        );
      }
    }

    return NextResponse.json(
      { ok: true, id: lineId, allocations_ok: true, allocations_count: allocs.length },
      { status: 200 },
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { ok: false, error: "server_error", detail: msg },
      { status: 500 },
    );
  }
}