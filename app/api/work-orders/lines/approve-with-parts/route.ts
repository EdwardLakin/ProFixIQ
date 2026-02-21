import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type PartNeed = {
  partId: string;
  qty: number;
  unitCost?: number | null;
  description?: string | null;
  supplierId?: string | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function badRequest(message: string, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status: 400 });
}

export async function POST(req: NextRequest) {
  try {
    const bodyUnknown: unknown = await req.json().catch(() => null);

    if (!isRecord(bodyUnknown)) return badRequest("Invalid JSON body");

    const workOrderLineId = asString(bodyUnknown.workOrderLineId);
    const partsRaw = bodyUnknown.parts;
    const supplierIdOverride = asString(bodyUnknown.supplierId);
    const createDraftPoWhenMissing =
      typeof bodyUnknown.createDraftPoWhenMissing === "boolean"
        ? bodyUnknown.createDraftPoWhenMissing
        : true;
    const note = asString(bodyUnknown.note);

    if (!workOrderLineId) return badRequest("Missing workOrderLineId");
    if (!Array.isArray(partsRaw) || partsRaw.length === 0) {
      return badRequest("Missing parts[] (must include at least 1 part)");
    }

    const parts: PartNeed[] = [];
    for (const p of partsRaw) {
      if (!isRecord(p)) continue;

      const partId = asString(p.partId);
      const qty = asNumber(p.qty);
      const unitCost = p.unitCost === undefined ? null : asNumber(p.unitCost);
      const description = p.description === undefined ? null : asString(p.description);
      const supplierId = p.supplierId === undefined ? null : asString(p.supplierId);

      if (!partId || qty == null || qty <= 0) {
        return badRequest("Each part must include { partId, qty > 0 }", p);
      }

      parts.push({ partId, qty, unitCost, description, supplierId });
    }

    if (parts.length === 0) return badRequest("No valid parts in parts[]");

    const supabase = createRouteHandlerClient<DB>({ cookies });

    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: line, error: lineErr } = await supabase
      .from("work_order_lines")
      .select("id, work_order_id, shop_id, status, approval_state, description, notes")
      .eq("id", workOrderLineId)
      .maybeSingle();

    if (lineErr) return NextResponse.json({ error: lineErr.message }, { status: 500 });
    if (!line?.id) return NextResponse.json({ error: "Work order line not found" }, { status: 404 });

    const shopId = line.shop_id ?? null;
    const workOrderId = line.work_order_id ?? null;
    if (!shopId || !workOrderId) {
      return NextResponse.json(
        { error: "work_order_lines row missing shop_id or work_order_id" },
        { status: 400 },
      );
    }

    // resolve default stock location for shop
    const { data: shop, error: shopErr } = await supabase
      .from("shops")
      .select("id, default_stock_location_id")
      .eq("id", shopId)
      .maybeSingle();

    if (shopErr) return NextResponse.json({ error: shopErr.message }, { status: 500 });

    let locationId: string | null = shop?.default_stock_location_id ?? null;

    // fallback: first stock location for shop
    if (!locationId) {
      const { data: loc, error: locErr } = await supabase
        .from("stock_locations")
        .select("id")
        .eq("shop_id", shopId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (locErr) return NextResponse.json({ error: locErr.message }, { status: 500 });
      locationId = loc?.id ?? null;
    }

    // fallback: create MAIN if none exist
    if (!locationId) {
      const { data: created, error: cErr } = await supabase
        .from("stock_locations")
        .insert({ shop_id: shopId, code: "MAIN", name: "Main" })
        .select("id")
        .single();

      if (cErr) {
        return NextResponse.json(
          { error: "No stock location found and failed to create MAIN", details: cErr.message },
          { status: 500 },
        );
      }

      locationId = created?.id ?? null;
    }

    if (!locationId) {
      return NextResponse.json({ error: "Could not resolve stock location" }, { status: 500 });
    }

    // Fetch current stock for requested parts at this location
    const partIds = Array.from(new Set(parts.map((p) => p.partId)));

    const { data: stockRows, error: stockErr } = await supabase
      .from("part_stock")
      .select("part_id, location_id, qty_on_hand, qty_reserved")
      .eq("location_id", locationId)
      .in("part_id", partIds);

    if (stockErr) return NextResponse.json({ error: stockErr.message }, { status: 500 });

    const stockByPart = new Map<string, { onHand: number; reserved: number }>();

    for (const r of stockRows ?? []) {
      const onHand = asNumber(r.qty_on_hand) ?? 0;
      const reserved = asNumber(r.qty_reserved) ?? 0;
      stockByPart.set(String(r.part_id), { onHand, reserved });
    }

    const allocatable: PartNeed[] = [];
    const missing: Array<PartNeed & { missingQty: number }> = [];

    for (const p of parts) {
      const st = stockByPart.get(p.partId);
      const available = st ? Math.max(0, st.onHand - st.reserved) : 0;

      if (available >= p.qty) {
        allocatable.push(p);
      } else {
        const missingQty = Math.max(0, p.qty - available);
        missing.push({ ...p, missingQty });

        // allocate partial if any
        if (available > 0) allocatable.push({ ...p, qty: available });
      }
    }

    // 1) Create allocations for whatever is allocatable
    if (allocatable.length > 0) {
      const allocationRows = allocatable.map((p) => ({
        work_order_line_id: workOrderLineId,
        part_id: p.partId,
        location_id: locationId as string,
        qty: p.qty,
        unit_cost: p.unitCost ?? null,
        work_order_id: workOrderId,
        shop_id: shopId,
      }));

      const { error: allocErr } = await supabase
        .from("work_order_part_allocations")
        .insert(allocationRows);

      if (allocErr) {
        return NextResponse.json(
          { error: "Failed to create part allocations", details: allocErr.message },
          { status: 500 },
        );
      }
    }

    // 2) Create draft PO when missing
    let poId: string | null = null;

    if (missing.length > 0 && createDraftPoWhenMissing) {
      // ✅ FIX: prefer-const
      const inferredSupplierByPart = new Map<string, string | null>();

      const { data: partRows, error: partErr } = await supabase
        .from("parts")
        .select("id, name, supplier_id")
        .in("id", partIds);

      if (!partErr) {
        for (const pr of partRows ?? []) {
          const sid = asString((pr as unknown as Record<string, unknown>).supplier_id);
          inferredSupplierByPart.set(String(pr.id), sid);
        }
      }

      const chooseSupplier = (p: PartNeed): string | null => {
        if (supplierIdOverride) return supplierIdOverride;
        if (p.supplierId) return p.supplierId;
        return inferredSupplierByPart.get(p.partId) ?? null;
      };

      const supplierCandidates = new Set<string>();
      const unresolvedParts: string[] = [];

      for (const p of missing) {
        const sid = chooseSupplier(p);
        if (sid) supplierCandidates.add(sid);
        else unresolvedParts.push(p.partId);
      }

      if (supplierCandidates.size === 0) {
        return badRequest(
          "Missing supplierId. Provide supplierId on request or ensure parts.supplier_id exists.",
          { unresolvedParts },
        );
      }

      const chosenSupplierId = Array.from(supplierCandidates.values())[0];

      const baseNotes = [
        "Auto-created draft PO (missing stock for approved line).",
        `WO line: ${workOrderLineId}`,
        note ? `Note: ${note}` : null,
      ].filter(Boolean);

      const { data: po, error: poErr } = await supabase
        .from("purchase_orders")
        .insert({
          shop_id: shopId,
          supplier_id: chosenSupplierId,
          status: "draft",
          notes: baseNotes.join(" "),
        })
        .select("id")
        .single();

      if (poErr) {
        return NextResponse.json(
          { error: "Failed to create purchase order", details: poErr.message },
          { status: 500 },
        );
      }

      poId = po?.id ?? null;

      const itemRows = missing.map((p) => ({
        po_id: poId as string,
        part_id: p.partId,
        description: p.description ?? null,
        qty_ordered: p.missingQty,
        unit_cost: p.unitCost ?? 0,
        location_id: locationId,
      }));

      const { error: poiErr } = await supabase
        .from("purchase_order_items")
        .insert(itemRows);

      if (poiErr) {
        return NextResponse.json(
          { error: "Failed to create purchase order items", details: poiErr.message },
          { status: 500 },
        );
      }
    }

    // 3) Update line state
    const lineStatusValue = missing.length > 0 ? "awaiting_authorization" : null;

    const nextNotes = [
      line.notes ?? null,
      note ? note : null,
      poId ? `Draft PO created: ${poId}` : null,
      allocatable.length > 0 ? `Allocated parts at location ${locationId}` : null,
    ]
      .filter(Boolean)
      .join(" • ");

    const { error: updErr } = await supabase
      .from("work_order_lines")
      .update({
        approval_state: "approved",
        status: line.status ?? "awaiting",
        line_status: lineStatusValue,
        notes: nextNotes || null,
        updated_at: new Date().toISOString(),
        approval_at: new Date().toISOString(),
        approval_by: user.id,
      })
      .eq("id", workOrderLineId);

    if (updErr) {
      return NextResponse.json(
        { error: "Failed to update work order line after approval", details: updErr.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      workOrderLineId,
      workOrderId,
      shopId,
      locationId,
      allocated: allocatable.map((p) => ({ partId: p.partId, qty: p.qty })),
      missing: missing.map((p) => ({ partId: p.partId, missingQty: p.missingQty })),
      poId,
      line_status: lineStatusValue,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[approve-with-parts] error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}