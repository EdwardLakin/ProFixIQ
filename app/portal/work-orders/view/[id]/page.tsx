import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";

import type { Database } from "@shared/types/types/supabase";
import {
  requireAuthedUser,
  requirePortalCustomer,
  requireWorkOrderOwnedByCustomer,
} from "@/features/portal/server/portalAuth";

import PortalInvoicePayButton from "@/features/stripe/components/PortalInvoicePayButton";

import WorkOrderViewer, {
  type WorkOrderViewerLine,
  type WorkOrderViewerPart,
} from "@/features/work-orders/components/WorkOrderViewer";

export const dynamic = "force-dynamic";

type DB = Database;

type WorkOrderRow = DB["public"]["Tables"]["work_orders"]["Row"];
type WorkOrderLineRow = DB["public"]["Tables"]["work_order_lines"]["Row"];
type VehicleRow = DB["public"]["Tables"]["vehicles"]["Row"];
type CustomerRow = DB["public"]["Tables"]["customers"]["Row"];
type ShopRow = DB["public"]["Tables"]["shops"]["Row"];
type PartRow = DB["public"]["Tables"]["parts"]["Row"];
type AllocationRow = DB["public"]["Tables"]["work_order_part_allocations"]["Row"];

type WorkOrderLite = Pick<
  WorkOrderRow,
  | "id"
  | "custom_id"
  | "status"
  | "created_at"
  | "updated_at"
  | "invoice_total"
  | "labor_total"
  | "parts_total"
  | "shop_id"
  | "customer_id"
  | "vehicle_id"
  | "invoice_pdf_url"
>;

type VehicleLite = Pick<
  VehicleRow,
  | "year"
  | "make"
  | "model"
  | "vin"
  | "license_plate"
  | "unit_number"
  | "mileage"
  | "color"
  | "engine_hours"
>;

type CustomerLite = Pick<
  CustomerRow,
  | "name"
  | "business_name"
  | "phone"
  | "phone_number"
  | "email"
  | "street"
  | "city"
  | "province"
  | "postal_code"
>;

type ShopLite = Pick<
  ShopRow,
  | "business_name"
  | "shop_name"
  | "name"
  | "phone_number"
  | "email"
  | "street"
  | "city"
  | "province"
  | "postal_code"
  | "country"
>;

type PartLookupRow = Pick<PartRow, "id" | "name" | "sku" | "part_number" | "unit">;

function normalizeCurrencyFromCountry(country: unknown): "CAD" | "USD" {
  const c = String(country ?? "").trim().toUpperCase();
  return c === "CA" ? "CAD" : "USD";
}

function safeNumber(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function dollarsToCents(n: number | null): number {
  if (n == null || !Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n * 100));
}

function pickCustomerPhone(c?: Pick<CustomerLite, "phone" | "phone_number"> | null): string | null {
  const p1 = (c?.phone_number ?? "").trim();
  const p2 = (c?.phone ?? "").trim();
  const out = p1 || p2;
  return out.length ? out : null;
}

function pickShopName(s?: Pick<ShopLite, "business_name" | "shop_name" | "name"> | null): string | null {
  const a = (s?.business_name ?? "").trim();
  const b = (s?.shop_name ?? "").trim();
  const c = (s?.name ?? "").trim();
  const out = a || b || c;
  return out.length ? out : null;
}

export default async function PortalWorkOrderViewerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: workOrderId } = await params;

  const cookieStore = cookies();
  const supabase = createServerComponentClient<DB>({ cookies: () => cookieStore });

  try {
    const { id: userId } = await requireAuthedUser(supabase);
    const customer = await requirePortalCustomer(supabase, userId);
    await requireWorkOrderOwnedByCustomer(supabase, workOrderId, customer.id);

    const { data: wo, error: woErr } = await supabase
      .from("work_orders")
      .select(
        "id, custom_id, status, created_at, updated_at, invoice_total, labor_total, parts_total, shop_id, customer_id, vehicle_id, invoice_pdf_url",
      )
      .eq("id", workOrderId)
      .eq("customer_id", customer.id)
      .maybeSingle<WorkOrderLite>();

    if (woErr) throw woErr;
    if (!wo) redirect("/portal");

    // Shop (currency + footer + pay button needs shopId)
    let shop: ShopLite | null = null;
    if (wo.shop_id) {
      const { data: s } = await supabase
        .from("shops")
        .select("business_name, shop_name, name, phone_number, email, street, city, province, postal_code, country")
        .eq("id", wo.shop_id)
        .maybeSingle<ShopLite>();
      shop = s ?? null;
    }

    const currency = normalizeCurrencyFromCountry(shop?.country);
    const stripeCurrency: "usd" | "cad" = currency === "CAD" ? "cad" : "usd";

    // Customer
    let customerRow: CustomerLite | null = null;
    if (wo.customer_id) {
      const { data: c } = await supabase
        .from("customers")
        .select("name, business_name, phone, phone_number, email, street, city, province, postal_code")
        .eq("id", wo.customer_id)
        .maybeSingle<CustomerLite>();
      customerRow = c ?? null;
    }

    // Vehicle
    let vehicle: VehicleLite | null = null;
    if (wo.vehicle_id) {
      const { data: v } = await supabase
        .from("vehicles")
        .select("year, make, model, vin, license_plate, unit_number, mileage, color, engine_hours")
        .eq("id", wo.vehicle_id)
        .maybeSingle<VehicleLite>();
      vehicle = v ?? null;
    }

    // Lines
    const { data: wol } = await supabase
      .from("work_order_lines")
      .select("id, line_no, description, complaint, cause, correction, labor_time")
      .eq("work_order_id", workOrderId)
      .order("line_no", { ascending: true });

    const lines = (Array.isArray(wol) ? wol : []) as WorkOrderViewerLine[];

    // Allocations (truth for parts)
    const { data: allocRaw } = await supabase
      .from("work_order_part_allocations")
      .select("id, work_order_line_id, part_id, qty, unit_cost")
      .eq("work_order_id", workOrderId);

    const allocations = (Array.isArray(allocRaw) ? allocRaw : []) as Array<
      Pick<AllocationRow, "id" | "work_order_line_id" | "part_id" | "qty" | "unit_cost">
    >;

    const partIds = Array.from(
      new Set(
        allocations
          .map((a) => a.part_id)
          .filter((id): id is string => typeof id === "string" && id.trim().length > 0),
      ),
    );

    const partsMap = new Map<string, PartLookupRow>();

    if (partIds.length > 0) {
      const { data: partRows } = await supabase
        .from("parts")
        .select("id, name, sku, part_number, unit")
        .in("id", partIds)
        .returns<PartLookupRow[]>();

      for (const p of Array.isArray(partRows) ? partRows : []) partsMap.set(p.id, p);
    }

    const parts: WorkOrderViewerPart[] = allocations.map((a) => {
      const meta = typeof a.part_id === "string" ? partsMap.get(a.part_id) : undefined;

      const qty = Math.max(0, safeNumber(a.qty)) || 1;
      const unitCost = Math.max(0, safeNumber(a.unit_cost));
      const totalCost = qty * unitCost;

      const baseName = (meta?.name ?? "Part").trim() || "Part";
      const partNumber = (meta?.part_number ?? "").trim() || undefined;
      const sku = (meta?.sku ?? "").trim() || undefined;
      const unit = (meta?.unit ?? "").trim() || undefined;

      const pretty =
        partNumber && partNumber.length ? `${baseName} (${partNumber})` : baseName;

      const lineId =
        typeof a.work_order_line_id === "string" && a.work_order_line_id.trim().length > 0
          ? a.work_order_line_id.trim()
          : undefined;

      return {
        id: String(a.id),
        lineId,
        name: pretty,
        qty,
        unitCost,
        totalCost,
        sku,
        partNumber,
        unit,
      };
    });

    const woInvoiceTotal =
      (typeof wo.invoice_total === "number" && Number.isFinite(wo.invoice_total))
        ? wo.invoice_total
        : safeNumber(wo.invoice_total);

    const payAmountCents = dollarsToCents(woInvoiceTotal > 0 ? woInvoiceTotal : null);

    return (
      <WorkOrderViewer
        kind="portal"
        workOrder={wo}
        currency={currency}
        vehicle={vehicle ?? undefined}
        customer={
          customerRow
            ? {
                ...customerRow,
                phone: pickCustomerPhone(customerRow) ?? customerRow.phone ?? null,
              }
            : undefined
        }
        shop={
          shop
            ? {
                name: pickShopName(shop),
                phone_number: shop.phone_number ?? null,
                email: shop.email ?? null,
                street: shop.street ?? null,
                city: shop.city ?? null,
                province: shop.province ?? null,
                postal_code: shop.postal_code ?? null,
              }
            : undefined
        }
        lines={lines}
        parts={parts}
        backHref="/portal/history"
        title="Work order"
        subtitle="Read-only view (customer portal)."
        invoicePdfUrl={wo.invoice_pdf_url ?? null}
        showPay={Boolean(wo.shop_id)}
        paySlot={
          wo.shop_id ? (
            <PortalInvoicePayButton
              shopId={wo.shop_id}
              workOrderId={wo.id}
              amountCents={payAmountCents}
              currency={stripeCurrency}
              disabled={payAmountCents < 50}
            />
          ) : null
        }
      />
    );
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[portal work order viewer] failed:", e);
    redirect("/portal");
  }
}
