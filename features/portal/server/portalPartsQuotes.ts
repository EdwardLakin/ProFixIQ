import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@shared/types/types/supabase";
import {
  isPortalPartsQuoteStatus,
  type PortalPartsQuote,
  type PortalPartsQuoteChoice,
  type PortalPartsQuoteItem,
} from "@/features/portal/lib/partsQuotePresentation";

type DB = Database;
type QuoteRow = DB["public"]["Tables"]["portal_parts_quote_requests"]["Row"];
type VehicleRow = Pick<
  DB["public"]["Tables"]["vehicles"]["Row"],
  "id" | "year" | "make" | "model" | "license_plate"
>;

export const PORTAL_PARTS_QUOTE_COLUMNS =
  "id,shop_id,customer_id,vehicle_id,part_request_id,status,description,notes,qty,currency,subtotal,tax_rate,tax_total,total,priced_items,created_at,sent_at,approved_at,declined_at,approval_choice,paid_at,stripe_checkout_session_id";

function asNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function parsePricedItems(value: Json | null): PortalPartsQuoteItem[] {
  if (!Array.isArray(value)) return [];
  const items: PortalPartsQuoteItem[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const row = entry as Record<string, Json>;
    const id = asText(row.id);
    const description = asText(row.description);
    if (!id || !description) continue;
    items.push({
      id,
      description,
      partNumber: asText(row.part_number),
      qty: asNumber(row.qty) ?? 1,
      unitPrice: asNumber(row.unit_price),
      lineTotal: asNumber(row.line_total),
    });
  }
  return items;
}

export function vehicleLabel(vehicle: VehicleRow | null | undefined): string | null {
  if (!vehicle) return null;
  const name = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ");
  const plate = vehicle.license_plate?.trim();
  const label = [name, plate].filter(Boolean).join(" • ");
  return label || null;
}

export function toPortalPartsQuote(
  row: QuoteRow,
  vehicle: VehicleRow | null | undefined,
): PortalPartsQuote {
  // Quote contents stay hidden from the customer until the shop has sent it.
  const visible = row.status !== "requested" && row.status !== "quoted";
  const choice = row.approval_choice as PortalPartsQuoteChoice | null;
  return {
    id: row.id,
    status: isPortalPartsQuoteStatus(row.status) ? row.status : "requested",
    paid: Boolean(row.paid_at),
    description: row.description,
    notes: row.notes,
    qty: Number(row.qty),
    vehicleLabel: vehicleLabel(vehicle),
    currency: row.currency === "usd" ? "usd" : "cad",
    subtotal: visible ? asNumber(row.subtotal) : null,
    taxTotal: visible ? asNumber(row.tax_total) : null,
    total: visible ? asNumber(row.total) : null,
    items: visible ? parsePricedItems(row.priced_items) : [],
    approvalChoice: choice === "order_parts" || choice === "book_install" ? choice : null,
    createdAt: row.created_at,
    sentAt: row.sent_at,
    approvedAt: row.approved_at,
    declinedAt: row.declined_at,
    paidAt: row.paid_at,
  };
}

/**
 * Loads customer-owned parts quotes with the service client. Ownership is
 * pinned to the verified portal actor's customer and shop, never to anything
 * the caller supplied.
 */
export async function listPortalPartsQuotes(args: {
  admin: SupabaseClient<DB>;
  shopId: string;
  customerId: string;
  id?: string;
}): Promise<{ rows: QuoteRow[]; quotes: PortalPartsQuote[] }> {
  let query = args.admin
    .from("portal_parts_quote_requests")
    .select(PORTAL_PARTS_QUOTE_COLUMNS)
    .eq("shop_id", args.shopId)
    .eq("customer_id", args.customerId)
    .order("created_at", { ascending: false })
    .limit(args.id ? 1 : 100);
  if (args.id) query = query.eq("id", args.id);

  const { data, error } = await query.returns<QuoteRow[]>();
  if (error) throw new Error(error.message);
  const rows = data ?? [];

  const vehicleIds = [
    ...new Set(rows.map((row) => row.vehicle_id).filter((id): id is string => Boolean(id))),
  ];
  const vehicles = new Map<string, VehicleRow>();
  if (vehicleIds.length) {
    const { data: vehicleRows, error: vehicleError } = await args.admin
      .from("vehicles")
      .select("id,year,make,model,license_plate")
      .eq("shop_id", args.shopId)
      .eq("customer_id", args.customerId)
      .in("id", vehicleIds)
      .returns<VehicleRow[]>();
    if (vehicleError) throw new Error(vehicleError.message);
    for (const vehicle of vehicleRows ?? []) vehicles.set(vehicle.id, vehicle);
  }

  return {
    rows,
    quotes: rows.map((row) =>
      toPortalPartsQuote(row, row.vehicle_id ? vehicles.get(row.vehicle_id) : null),
    ),
  };
}
