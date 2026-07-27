// /app/portal/work-orders/view/[id]/page.tsx (FULL FILE REPLACEMENT)

import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";

import type { Database } from "@shared/types/types/supabase";
import {
  requireAuthedUser,
  requirePortalCustomer,
  requireWorkOrderOwnedByCustomer,
} from "@/features/portal/server/portalAuth";

import PortalInvoicePayButton from "@/features/stripe/components/PortalInvoicePayButton";
import {
  calculateShopSupplies,
  resolveShopSuppliesOverride,
  resolveShopSuppliesSettings,
} from "@/features/work-orders/lib/shopSupplies";

import WorkOrderViewer, {
  type WorkOrderViewerLine,
  type WorkOrderViewerPart,
} from "@/features/work-orders/components/WorkOrderViewer";

export const dynamic = "force-dynamic";

type DB = Database;

type WorkOrderRow = DB["public"]["Tables"]["work_orders"]["Row"];
type VehicleRow = DB["public"]["Tables"]["vehicles"]["Row"];
type CustomerRow = DB["public"]["Tables"]["customers"]["Row"];
type ShopRow = DB["public"]["Tables"]["shops"]["Row"];
type PartRow = DB["public"]["Tables"]["parts"]["Row"];
type AllocationRow = DB["public"]["Tables"]["work_order_part_allocations"]["Row"];
type QuoteLineRow = DB["public"]["Tables"]["work_order_quote_lines"]["Row"];

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
  | "intake_status"
  | "intake_submitted_at"
  | "shop_supplies_enabled_override"
  | "shop_supplies_amount_override"
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
  | "labor_rate"
  | "shop_supplies_enabled"
  | "shop_supplies_type"
  | "shop_supplies_percent"
  | "shop_supplies_flat_amount"
  | "shop_supplies_cap_amount"
  | "supplies_percent"
>;
type QuoteLineLite = Pick<
  QuoteLineRow,
  | "labor_hours"
  | "est_labor_hours"
  | "labor_total"
  | "parts_total"
  | "subtotal"
  | "grand_total"
  | "status"
  | "stage"
  | "sent_to_customer_at"
  | "approved_at"
  | "declined_at"
  | "work_order_line_id"
  | "metadata"
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

function nullableNumber(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function quoteMetadata(line: Pick<QuoteLineLite, "metadata">): Record<string, unknown> {
  if (!line.metadata || typeof line.metadata !== "object" || Array.isArray(line.metadata)) {
    return {};
  }
  return line.metadata as Record<string, unknown>;
}

function quoteLaborHours(line: Pick<QuoteLineLite, "labor_hours" | "est_labor_hours">): number {
  return nullableNumber(line.labor_hours) ?? nullableNumber(line.est_labor_hours) ?? 0;
}

function quoteLaborRate(line: Pick<QuoteLineLite, "metadata">, shopLaborRate: number): number {
  return nullableNumber(quoteMetadata(line).labor_rate) ?? shopLaborRate;
}

function quoteLaborTotal(line: Pick<QuoteLineLite, "labor_total" | "labor_hours" | "est_labor_hours" | "metadata">, shopLaborRate: number): number {
  return nullableNumber(line.labor_total) ?? quoteLaborHours(line) * quoteLaborRate(line, shopLaborRate);
}

function quotePartsTotal(line: Pick<QuoteLineLite, "parts_total">): number {
  return nullableNumber(line.parts_total) ?? 0;
}

function quoteGrandTotal(line: Pick<QuoteLineLite, "grand_total" | "subtotal" | "labor_total" | "labor_hours" | "est_labor_hours" | "metadata" | "parts_total">, shopLaborRate: number): number {
  return nullableNumber(line.grand_total) ?? nullableNumber(line.subtotal) ?? quoteLaborTotal(line, shopLaborRate) + quotePartsTotal(line);
}

function isCustomerVisibleQuoteLine(line: QuoteLineLite): boolean {
  const status = String(line.status ?? "").trim().toLowerCase();
  const stage = String(line.stage ?? "").trim().toLowerCase();
  if (line.declined_at || status === "declined" || stage === "customer_declined") return false;
  if (status === "pending_parts" || stage === "advisor_pending") return false;
  return Boolean(line.sent_to_customer_at || line.approved_at || line.work_order_line_id || ["sent", "approved", "converted"].includes(status));
}

function dollarsToCents(n: number | null): number {
  if (n == null || !Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n * 100));
}

function pickCustomerPhone(
  c?: Pick<CustomerLite, "phone" | "phone_number"> | null,
): string | null {
  const p1 = (c?.phone_number ?? "").trim();
  const p2 = (c?.phone ?? "").trim();
  const out = p1 || p2;
  return out.length ? out : null;
}

function pickShopName(
  s?: Pick<ShopLite, "business_name" | "shop_name" | "name"> | null,
): string | null {
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

  const supabase = createServerSupabaseRSC();

  try {
    const { id: userId } = await requireAuthedUser(supabase);
    const portalCustomer = await requirePortalCustomer(supabase, userId);
    await requireWorkOrderOwnedByCustomer(supabase, workOrderId, portalCustomer.id);

    const { data: wo, error: woErr } = await supabase
      .from("work_orders")
      .select(
        "id, custom_id, status, created_at, updated_at, invoice_total, labor_total, parts_total, shop_id, customer_id, vehicle_id, invoice_pdf_url, intake_status, intake_submitted_at, shop_supplies_enabled_override, shop_supplies_amount_override",
      )
      .eq("id", workOrderId)
      .eq("customer_id", portalCustomer.id)
      .maybeSingle<WorkOrderLite>();

    if (woErr) throw woErr;
    if (!wo) redirect("/portal");

    // Shop (currency + footer + pay button needs shopId)
    let shop: ShopLite | null = null;
    if (wo.shop_id) {
      const { data: s, error: sErr } = await supabase
        .from("shops")
        .select(
          "business_name, shop_name, name, phone_number, email, street, city, province, postal_code, country, labor_rate, shop_supplies_enabled, shop_supplies_type, shop_supplies_percent, shop_supplies_flat_amount, shop_supplies_cap_amount, supplies_percent",
        )
        .eq("id", wo.shop_id)
        .maybeSingle<ShopLite>();
      if (sErr) throw sErr;
      shop = s ?? null;
    }

    const currency = normalizeCurrencyFromCountry(shop?.country);
    const stripeCurrency: "usd" | "cad" = currency === "CAD" ? "cad" : "usd";

    // Customer
    let customerRow: CustomerLite | null = null;
    if (wo.customer_id) {
      const { data: c, error: cErr } = await supabase
        .from("customers")
        .select(
          "name, business_name, phone, phone_number, email, street, city, province, postal_code",
        )
        .eq("id", wo.customer_id)
        .maybeSingle<CustomerLite>();
      if (cErr) throw cErr;
      customerRow = c ?? null;
    }

    // Vehicle
    let vehicle: VehicleLite | null = null;
    if (wo.vehicle_id) {
      const { data: v, error: vErr } = await supabase
        .from("vehicles")
        .select(
          "year, make, model, vin, license_plate, unit_number, mileage, color, engine_hours",
        )
        .eq("id", wo.vehicle_id)
        .maybeSingle<VehicleLite>();
      if (vErr) throw vErr;
      vehicle = v ?? null;
    }

    // Lines
    const { data: wol, error: wolErr } = await supabase
      .from("work_order_lines")
      .select("id, line_no, description, complaint, cause, correction, labor_time")
      .eq("work_order_id", workOrderId)
      .order("line_no", { ascending: true });

    if (wolErr) throw wolErr;

    const lines = (Array.isArray(wol) ? wol : []) as WorkOrderViewerLine[];

    const { data: quoteLineRaw, error: quoteLineErr } = await supabase
      .from("work_order_quote_lines")
      .select("labor_hours, est_labor_hours, labor_total, parts_total, subtotal, grand_total, status, stage, sent_to_customer_at, approved_at, declined_at, work_order_line_id, metadata")
      .eq("work_order_id", workOrderId);

    if (quoteLineErr) throw quoteLineErr;

    const quoteLines = ((Array.isArray(quoteLineRaw) ? quoteLineRaw : []) as QuoteLineLite[]).filter(isCustomerVisibleQuoteLine);
    const shopLaborRate = nullableNumber(shop?.labor_rate) ?? 140;
    const quoteLineTotal = quoteLines.reduce((sum, line) => sum + quoteGrandTotal(line, shopLaborRate), 0);
    const quoteLaborPartsBase = quoteLines.reduce((sum, line) => sum + quoteLaborTotal(line, shopLaborRate) + quotePartsTotal(line), 0);
    const quoteSupplies = calculateShopSupplies({
      baseAmount: quoteLaborPartsBase,
      settings: resolveShopSuppliesSettings(shop as Parameters<typeof resolveShopSuppliesSettings>[0]),
      override: resolveShopSuppliesOverride(wo as Parameters<typeof resolveShopSuppliesOverride>[0]),
    });
    const visibleQuoteTotal = quoteLines.length > 0 ? quoteLineTotal + quoteSupplies.amount : null;

    // Allocations (truth for parts)
    const { data: allocRaw, error: allocErr } = await supabase
      .from("work_order_part_allocations")
      .select("id, work_order_line_id, part_id, qty, unit_cost")
      .eq("work_order_id", workOrderId);

    if (allocErr) throw allocErr;

    const allocations = (Array.isArray(allocRaw) ? allocRaw : []) as Array<
      Pick<AllocationRow, "id" | "work_order_line_id" | "part_id" | "qty" | "unit_cost">
    >;

    const partIds = Array.from(
      new Set(
        allocations
          .map((a) => a.part_id)
          .filter(
            (id): id is string => typeof id === "string" && id.trim().length > 0,
          ),
      ),
    );

    const partsMap = new Map<string, PartLookupRow>();

    if (partIds.length > 0) {
      const { data: partRows, error: partErr } = await supabase
        .from("parts")
        .select("id, name, sku, part_number, unit")
        .in("id", partIds)
        .returns<PartLookupRow[]>();

      if (partErr) throw partErr;

      for (const p of Array.isArray(partRows) ? partRows : []) {
        partsMap.set(p.id, p);
      }
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

      const pretty = partNumber ? `${baseName} (${partNumber})` : baseName;

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

    const woInvoiceTotal = safeNumber(wo.invoice_total);
    const displayWorkOrder = visibleQuoteTotal != null && woInvoiceTotal <= 0
      ? { ...wo, invoice_total: visibleQuoteTotal }
      : wo;
    const payAmountCents = dollarsToCents(woInvoiceTotal > 0 ? woInvoiceTotal : null);

    // Intake CTA (portal)
    const intakeStatus = String(wo.intake_status ?? "").toLowerCase();
    const intakeSubmitted = intakeStatus === "submitted";
    const intakeHref = `/portal/work-orders/${wo.id}/intake`;

    const intakeCtaLabel = intakeSubmitted ? "View intake" : "Complete intake";
    const intakeCtaHint = intakeSubmitted
      ? "You’ve already submitted the intake."
      : "Please complete the intake so the technician has the full details.";

    return (
      <div className="mx-auto w-full max-w-[1100px] px-3 py-4 sm:px-6">
        <div className="mb-4 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 backdrop-blur">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-[color:var(--theme-text-primary)]">
                Intake
                <span className="ml-2 text-[11px] font-medium text-[color:var(--theme-text-secondary)]">
                  {intakeSubmitted ? "Submitted" : "Not submitted"}
                </span>
              </div>
              <div className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">{intakeCtaHint}</div>
            </div>

            <Link
              href={intakeHref}
              className="inline-flex items-center justify-center rounded-xl border border-[rgba(184,115,51,0.45)] bg-[rgba(184,115,51,0.12)] px-4 py-2 text-sm font-semibold text-amber-100 hover:bg-[rgba(184,115,51,0.18)]"
            >
              {intakeCtaLabel} →
            </Link>
          </div>
        </div>

        <WorkOrderViewer
          kind="portal"
          workOrder={displayWorkOrder}
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
          backHref="/portal"
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
      </div>
    );
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[portal work order viewer] failed:", e);
    redirect("/portal");
  }
}
