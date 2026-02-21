import { NextResponse } from "next/server";
import { createClient, type PostgrestError, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

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
  | "tech-suggested"
  | null;

type PartInput = {
  name: string;
  qty?: number;
  cost?: number;
  notes?: string;

  // optional “best” path for automation
  partId?: string;
  sku?: string;
};

type AISuggestion = {
  parts: PartInput[];
  laborHours: number;
  laborRate?: number;
  summary: string;
  confidence?: "low" | "medium" | "high";
  price?: number;
  notes?: string;
  title?: string;
};

type AddLineInventoryBody = {
  workOrderId: string;
  description: string;
  section?: string;
  status?: "recommend" | "fail";
  suggestion: AISuggestion;

  jobType?: "inspection" | "repair" | "maintenance" | "diagnosis" | "tech-suggested";

  // optional override (if UI passes it)
  stockLocationId?: string | null;
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

function isValidBody(b: unknown): b is AddLineInventoryBody {
  if (!isRecord(b)) return false;
  return (
    typeof b.workOrderId === "string" &&
    typeof b.description === "string" &&
    isRecord(b.suggestion) &&
    Array.isArray((b.suggestion as Record<string, unknown>).parts)
  );
}

function toNumber(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function safeTrim(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

type InsertWorkOrderLine = {
  work_order_id: string;
  shop_id: string | null;
  vehicle_id: string | null;
  description: string;
  job_type: JobType;
  status: LineStatus;
  approval_state: ApprovalState;
  notes: string | null;
  labor_time: number | null;

  // you have this column (jsonb)
  parts_needed?: unknown | null;
};

type PartsNeededRow = {
  name: string;
  qty: number;
  est_unit_cost: number | null;
  part_id: string | null;
  location_id: string | null;

  qty_on_hand: number | null;
  qty_reserved: number | null;
  qty_available: number | null;

  in_stock: boolean | null; // null means “unknown” (no part_id / no location)
  missing_qty: number | null;
};

async function pickDefaultStockLocationId(args: {
  supabase: SupabaseClient<DB>;
  shopId: string;
}): Promise<string | null> {
  const { supabase, shopId } = args;

  // 1) try shops.default_stock_location_id
  const { data: shop, error: shopErr } = await supabase
    .from("shops")
    .select("default_stock_location_id")
    .eq("id", shopId)
    .maybeSingle();

  if (!shopErr) {
    const v =
      (shop as { default_stock_location_id?: unknown } | null)
        ?.default_stock_location_id;
    if (typeof v === "string" && v) return v;
  }

  // 2) fallback: if shop has stock locations, use the first (deterministic order)
  const { data: locs, error: locErr } = await supabase
    .from("stock_locations")
    .select("id")
    .eq("shop_id", shopId)
    .order("id", { ascending: true })
    .limit(2);

  if (locErr) return null;

  const rows = (locs ?? []) as Array<{ id: string }>;
  if (rows.length === 1) return rows[0].id;
  return rows.length > 0 ? rows[0].id : null;
}

async function resolvePartIdBestEffort(args: {
  supabase: SupabaseClient<DB>;
  part: PartInput;
}): Promise<string | null> {
  const { supabase, part } = args;

  if (typeof part.partId === "string" && part.partId) return part.partId;

  const sku = safeTrim(part.sku);
  const name = safeTrim(part.name);

  // Best effort: try to match in parts table (if schema differs, it fails gracefully)
  if (sku) {
    const { data, error } = await supabase
      .from("parts")
      .select("id")
      .or(`sku.ilike.${sku},part_number.ilike.${sku}`)
      .limit(1);

    if (!error) {
      const id = (data?.[0] as { id?: unknown } | undefined)?.id;
      if (typeof id === "string" && id) return id;
    }
  }

  if (name) {
    const { data, error } = await supabase
      .from("parts")
      .select("id")
      .or(`name.ilike.%${name}%,description.ilike.%${name}%`)
      .limit(1);

    if (!error) {
      const id = (data?.[0] as { id?: unknown } | undefined)?.id;
      if (typeof id === "string" && id) return id;
    }
  }

  return null;
}

export async function POST(req: Request) {
  try {
    const bodyUnknown: unknown = await req.json();

    if (!isValidBody(bodyUnknown)) {
      return NextResponse.json(
        { error: "Invalid body: require workOrderId, description, suggestion.parts[]" },
        { status: 400 },
      );
    }

    const {
      workOrderId,
      description,
      section,
      status,
      suggestion,
      jobType = "inspection",
      stockLocationId,
    } = bodyUnknown;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json(
        { error: "Server not configured for Supabase" },
        { status: 500 },
      );
    }

    // ✅ FIX: typed client
    const supabase = createClient<DB>(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    // 1) Load work order context (shop_id, vehicle_id)
    const { data: wo, error: woErr } = await supabase
      .from("work_orders")
      .select("id, shop_id, vehicle_id")
      .eq("id", workOrderId)
      .maybeSingle();

    if (woErr) {
      const e = woErr as PostgrestError;
      return NextResponse.json({ error: e.message }, { status: 500 });
    }

    const shopId =
      (wo as { shop_id?: unknown } | null)?.shop_id &&
      typeof (wo as { shop_id?: unknown }).shop_id === "string"
        ? ((wo as { shop_id: string }).shop_id as string)
        : null;

    const vehicleId =
      (wo as { vehicle_id?: unknown } | null)?.vehicle_id &&
      typeof (wo as { vehicle_id?: unknown }).vehicle_id === "string"
        ? ((wo as { vehicle_id: string }).vehicle_id as string)
        : null;

    if (!shopId) {
      return NextResponse.json(
        { error: "Work order is missing shop_id (required for inventory check)" },
        { status: 400 },
      );
    }

    // 2) Choose stock location (override > shop default > fallback)
    const locId =
      typeof stockLocationId === "string" && stockLocationId
        ? stockLocationId
        : await pickDefaultStockLocationId({ supabase, shopId });

    // 3) Build notes
    const notesParts: string[] = [];
    if (section) notesParts.push(`Section: ${section}`);
    if (status) notesParts.push(`From inspection: ${status.toUpperCase()}`);
    if (safeTrim(suggestion.summary))
      notesParts.push(`AI: ${safeTrim(suggestion.summary)}`);
    const notes: string | null = notesParts.length ? notesParts.join(" • ") : null;

    const laborTime: number | null =
      typeof suggestion.laborHours === "number" && Number.isFinite(suggestion.laborHours)
        ? suggestion.laborHours
        : null;

    // 4) Insert work order line (quote-style)
    const insertPayload: InsertWorkOrderLine = {
      work_order_id: workOrderId,
      shop_id: shopId,
      vehicle_id: vehicleId,
      description,
      job_type: (jobType as JobType) ?? "inspection",
      status: "awaiting_approval",
      approval_state: "pending",
      notes,
      labor_time: laborTime,
    };

    const { data: line, error: insErr } = await supabase
      .from("work_order_lines")
      .insert(insertPayload)
      .select("id")
      .single();

    if (insErr) {
      const e = insErr as PostgrestError;
      return NextResponse.json(
        { error: e.message, details: e.details, hint: e.hint, code: e.code },
        { status: 500 },
      );
    }

    const lineId = (line as { id: string }).id;

    // 5) Inventory check + build parts_needed json
    const parts = Array.isArray(suggestion.parts)
      ? (suggestion.parts as PartInput[])
      : [];
    const partsNeeded: PartsNeededRow[] = [];

    let anyMissing = false;
    let anyUnknown = false;

    for (const p of parts) {
      const name = safeTrim(p.name) || "Part";
      const qty = Math.max(0, toNumber(p.qty ?? 1)) || 1;
      const estUnitCost =
        typeof p.cost === "number" && Number.isFinite(p.cost) ? p.cost : null;

      const partId = await resolvePartIdBestEffort({ supabase, part: p });

      if (!partId || !locId) {
        anyUnknown = true;
        partsNeeded.push({
          name,
          qty,
          est_unit_cost: estUnitCost,
          part_id: partId,
          location_id: locId,
          qty_on_hand: null,
          qty_reserved: null,
          qty_available: null,
          in_stock: null,
          missing_qty: null,
        });
        continue;
      }

      const { data: stock, error: stockErr } = await supabase
        .from("part_stock")
        .select("qty_on_hand, qty_reserved")
        .eq("part_id", partId)
        .eq("location_id", locId)
        .maybeSingle();

      if (stockErr) {
        anyUnknown = true;
        partsNeeded.push({
          name,
          qty,
          est_unit_cost: estUnitCost,
          part_id: partId,
          location_id: locId,
          qty_on_hand: null,
          qty_reserved: null,
          qty_available: null,
          in_stock: null,
          missing_qty: null,
        });
        continue;
      }

      const onHand = toNumber((stock as { qty_on_hand?: unknown } | null)?.qty_on_hand ?? 0);
      const reserved = toNumber((stock as { qty_reserved?: unknown } | null)?.qty_reserved ?? 0);
      const available = onHand - reserved;

      const inStock = available >= qty;
      const missingQty = inStock ? 0 : Math.max(0, qty - Math.max(0, available));

      if (!inStock) anyMissing = true;

      partsNeeded.push({
        name,
        qty,
        est_unit_cost: estUnitCost,
        part_id: partId,
        location_id: locId,
        qty_on_hand: onHand,
        qty_reserved: reserved,
        qty_available: available,
        in_stock: inStock,
        missing_qty: missingQty,
      });
    }

    // 6) Persist parts_needed on the line (jsonb)
    if (partsNeeded.length > 0) {
      const { error: updErr } = await supabase
        .from("work_order_lines")
        .update({
          parts_needed: {
            source: "inspection_ai",
            checked_at: new Date().toISOString(),
            stock_location_id: locId,
            any_missing: anyMissing,
            any_unknown: anyUnknown,
            parts: partsNeeded,
          },
        })
        .eq("id", lineId);

      if (updErr) {
        return NextResponse.json(
          {
            id: lineId,
            stockLocationIdUsed: locId,
            anyMissing,
            anyUnknown,
            warning: "Line created but failed to store parts_needed JSON",
            details: (updErr as PostgrestError).message,
          },
          { status: 200 },
        );
      }
    }

    // PO creation happens later (after approval)
    return NextResponse.json({
      id: lineId,
      stockLocationIdUsed: locId,
      anyMissing,
      anyUnknown,
      partsNeeded,
      nextStep: "On approval, generate draft PO for missing parts",
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}