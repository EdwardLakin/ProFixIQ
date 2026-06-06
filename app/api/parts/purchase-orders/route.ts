import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { resolveCurrentActor } from "@/features/shared/lib/currentActor";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type PurchaseOrderLineInsert = DB["public"]["Tables"]["purchase_order_lines"]["Insert"];

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function toNum(value: unknown, fallback: number): number {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

async function requireActor() {
  const supabase = createServerSupabaseRoute();
  const actor = await resolveCurrentActor(supabase);
  if (!actor.user || !actor.shopId) {
    console.info("[PurchaseOrders] server auth unavailable", {
      actorPresent: Boolean(actor.user),
      profileId: actor.profile?.id ?? null,
      profileRole: actor.role ?? null,
      activeShopId: actor.shopId,
      route: "/api/parts/purchase-orders",
      table: "purchase_orders",
    });
    return { supabase, actor, response: NextResponse.json({ error: "Not authenticated." }, { status: 401 }) };
  }
  return { supabase, actor, response: null };
}

export async function GET() {
  const { supabase, actor, response } = await requireActor();
  if (response) return response;

  const [poRes, supplierRes, partsRes] = await Promise.all([
    supabase.from("purchase_orders").select("*").eq("shop_id", actor.shopId).order("created_at", { ascending: false }).limit(200),
    supabase.from("suppliers").select("*").eq("shop_id", actor.shopId).order("name", { ascending: true }).limit(1000),
    supabase.from("parts").select("*").eq("shop_id", actor.shopId).order("name", { ascending: true }).limit(2000),
  ]);

  const error = poRes.error ?? supplierRes.error ?? partsRes.error;
  if (error) {
    console.info("[PurchaseOrders] load query failed", {
      actorPresent: true,
      profileId: actor.profile?.id ?? null,
      profileRole: actor.role ?? null,
      activeShopId: actor.shopId,
      route: "/api/parts/purchase-orders",
      table: poRes.error ? "purchase_orders" : supplierRes.error ? "suppliers" : "parts",
      code: error.code,
      message: error.message,
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ shopId: actor.shopId, pos: poRes.data ?? [], suppliers: supplierRes.data ?? [], parts: partsRes.data ?? [] });
}

export async function POST(request: Request) {
  const { supabase, actor, response } = await requireActor();
  if (response) return response;

  const body = (await request.json().catch(() => null)) as {
    supplierId?: string;
    newSupplierName?: string;
    notes?: string;
    lines?: Array<{ part_id?: string; description?: string; vendor_part_number?: string; ordered_qty?: number; unit_cost?: number; notes?: string }>;
  } | null;

  const supplierName = (body?.newSupplierName ?? "").trim().replace(/\s+/g, " ");
  let supplierId = (body?.supplierId ?? "").trim();

  if (!supplierId) {
    const name = supplierName || "General / Stock";
    const { data: existing, error: existingErr } = await supabase
      .from("suppliers")
      .select("id")
      .eq("shop_id", actor.shopId)
      .ilike("name", name)
      .maybeSingle();
    if (existingErr) return NextResponse.json({ error: existingErr.message }, { status: 500 });

    if (existing?.id) {
      supplierId = existing.id;
    } else {
      const { data: created, error: createSupplierErr } = await supabase
        .from("suppliers")
        .insert({ id: uuidv4(), shop_id: actor.shopId, name })
        .select("id")
        .single();
      if (createSupplierErr) return NextResponse.json({ error: createSupplierErr.message }, { status: 500 });
      supplierId = created.id;
    }
  }

  const nowIso = new Date().toISOString();
  const fallbackId = uuidv4();
  const { data: poData, error: poErr } = await supabase
    .from("purchase_orders")
    .insert({ id: fallbackId, shop_id: actor.shopId, supplier_id: supplierId, status: "open", notes: body?.notes?.trim() || null, created_at: nowIso })
    .select("id")
    .single();
  if (poErr) return NextResponse.json({ error: poErr.message }, { status: 500 });

  const poId = poData?.id ?? fallbackId;
  const lineDrafts = Array.isArray(body?.lines) ? body.lines : [];
  const linesToInsert = lineDrafts
    .filter((line) => isNonEmptyString(line.part_id) || isNonEmptyString(line.description))
    .map((line): PurchaseOrderLineInsert => {
      const vendorPn = (line.vendor_part_number ?? "").trim();
      const notes = (line.notes ?? "").trim();
      const typedDescription = (line.description ?? "").trim();
      const descriptionParts = [typedDescription, vendorPn ? `Vendor PN: ${vendorPn}` : "", notes].filter(Boolean);
      return {
        id: uuidv4(),
        po_id: poId,
        part_id: isNonEmptyString(line.part_id) ? line.part_id.trim() : null,
        qty: Math.max(0, Math.floor(toNum(line.ordered_qty, 0))),
        unit_cost: Math.max(0, toNum(line.unit_cost, 0)),
        sku: vendorPn || null,
        description: descriptionParts.length ? descriptionParts.join(" • ") : null,
        received_qty: 0,
        location_id: null,
        created_at: nowIso,
      };
    });

  if (linesToInsert.length > 0) {
    const { error: lineErr } = await supabase.from("purchase_order_lines").insert(linesToInsert);
    if (lineErr) return NextResponse.json({ error: lineErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: poId });
}
