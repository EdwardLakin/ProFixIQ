import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { resolveWorkOrderLinePricing } from "@/features/work-orders/lib/pricing/resolveWorkOrderLinePricing";
import {
  calculateShopSupplies,
  resolveShopSuppliesOverride,
  resolveShopSuppliesSettings,
} from "@/features/work-orders/lib/shopSupplies";
import { calculateInvoiceTotals } from "@/features/invoices/lib/invoiceTotals";
import { resolveApprovedPartInvoiceQuantity } from "@/features/invoices/lib/approvedInvoiceParts";
import { shouldUsePersistedInvoiceTotals } from "@/features/invoices/lib/invoiceSnapshotState";
import { filterInvoicePartAllocations } from "@/features/invoices/lib/filterInvoicePartAllocations";
import type { InvoiceDocumentConfiguration } from "@/features/invoices/lib/invoiceDocumentTheme";

type DB = Database;

type WorkOrderRow = DB["public"]["Tables"]["work_orders"]["Row"];
type InvoiceRow = DB["public"]["Tables"]["invoices"]["Row"];
type ShopRow = DB["public"]["Tables"]["shops"]["Row"];
type CustomerRow = DB["public"]["Tables"]["customers"]["Row"];
type VehicleRow = DB["public"]["Tables"]["vehicles"]["Row"];
type WorkOrderLineRow = DB["public"]["Tables"]["work_order_lines"]["Row"];
type AllocationRow =
  DB["public"]["Tables"]["work_order_part_allocations"]["Row"];
type PartRow = DB["public"]["Tables"]["parts"]["Row"];
type WorkOrderQuoteLineRow =
  DB["public"]["Tables"]["work_order_quote_lines"]["Row"];
type WorkOrderPartRow = DB["public"]["Tables"]["work_order_parts"]["Row"];
type PartRequestItemRow = DB["public"]["Tables"]["part_request_items"]["Row"];
type PartRequestRow = DB["public"]["Tables"]["part_requests"]["Row"];

export type InvoiceSnapshotPart = {
  id: string;
  pricingSourceId?: string;
  lineId?: string;
  name: string;
  qty: number;
  unitPrice: number;
  totalPrice: number;
  sku?: string;
  partNumber?: string;
  unit?: string;
  vendor?: string;
  source?:
    | "work_order_part_allocation"
    | "work_order_part"
    | "quote_line_part_request";
};

export type InvoiceSnapshotLine = Pick<
  WorkOrderLineRow,
  | "id"
  | "line_no"
  | "description"
  | "complaint"
  | "cause"
  | "correction"
  | "labor_time"
  | "price_estimate"
  | "intake_json"
> & {
  resolvedLaborHours: number;
  resolvedLaborRate: number;
  resolvedLaborTotal: number;
  resolvedPartsTotal: number;
  resolvedLineTotal: number;
};

export type InvoiceSnapshot = {
  workOrder: Pick<
    WorkOrderRow,
    | "id"
    | "shop_id"
    | "customer_id"
    | "vehicle_id"
    | "customer_name"
    | "custom_id"
    | "status"
    | "labor_total"
    | "parts_total"
    | "invoice_total"
    | "shop_supplies_enabled_override"
    | "shop_supplies_amount_override"
    | "created_at"
  >;
  invoice: Pick<
    InvoiceRow,
    | "id"
    | "invoice_number"
    | "status"
    | "currency"
    | "subtotal"
    | "parts_cost"
    | "labor_cost"
    | "shop_supplies_total"
    | "discount_total"
    | "tax_total"
    | "total"
    | "issued_at"
    | "created_at"
    | "notes"
  > | null;
  shop:
    | (Pick<
        ShopRow,
        | "business_name"
        | "shop_name"
        | "name"
        | "country"
        | "phone_number"
        | "email"
        | "street"
        | "city"
        | "province"
        | "postal_code"
        | "labor_rate"
        | "supplies_percent"
        | "shop_supplies_enabled"
        | "shop_supplies_type"
        | "shop_supplies_percent"
        | "shop_supplies_flat_amount"
        | "shop_supplies_cap_amount"
        | "tax_rate"
      > &
        Partial<Pick<ShopRow, "logo_url" | "invoice_terms" | "invoice_footer">>)
    | null;
  customer: Pick<
    CustomerRow,
    | "name"
    | "first_name"
    | "last_name"
    | "phone"
    | "phone_number"
    | "email"
    | "business_name"
    | "street"
    | "city"
    | "province"
    | "postal_code"
  > | null;
  vehicle: Pick<
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
  > | null;
  lines: InvoiceSnapshotLine[];
  parts: InvoiceSnapshotPart[];
  currency: "CAD" | "USD";
  laborCost: number | null;
  partsCost: number | null;
  shopSuppliesTotal: number | null;
  subtotal: number | null;
  discountTotal: number | null;
  taxTotal: number | null;
  taxRate?: number | null;
  total: number | null;
  /** Immutable resolved renderer configuration. Present on issued invoice versions. */
  documentConfiguration?: InvoiceDocumentConfiguration;
};

function safeNumberOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function safeNumber(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function positiveOrNull(v: unknown): number | null {
  const n = safeNumberOrNull(v);
  return n != null && n > 0 ? n : null;
}

type InvoicePricingOverrideRow = {
  line_labor_totals: unknown;
  part_unit_prices: unknown;
  shop_supplies_amount: number | null;
};

type PricingOverrideQuery = {
  eq(column: string, value: string): PricingOverrideQuery;
  maybeSingle<T>(): Promise<{
    data: T | null;
    error: { message: string } | null;
  }>;
};

type PricingOverrideClient = {
  from(table: string): {
    select(columns: string): PricingOverrideQuery;
  };
};

function moneyOverrideMap(value: unknown): Map<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return new Map();
  return new Map(
    Object.entries(value as Record<string, unknown>).flatMap(([id, amount]) => {
      const parsed = safeNumberOrNull(amount);
      return id && parsed != null && parsed >= 0 ? [[id, parsed] as const] : [];
    }),
  );
}

function normalizeInvoiceCurrency(v: unknown): "CAD" | "USD" | null {
  const c = String(v ?? "")
    .trim()
    .toUpperCase();
  if (c === "CAD") return "CAD";
  if (c === "USD") return "USD";
  return null;
}

function normalizeCurrencyFromCountry(country: unknown): "CAD" | "USD" {
  const c = String(country ?? "")
    .trim()
    .toUpperCase();
  return c === "CA" ? "CAD" : "USD";
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

const BILLABLE_PART_REQUEST_ITEM_STATUSES = new Set([
  "quoted",
  "approved",
  "reserved",
  "picking",
  "picked",
  "ordered",
  "partially_received",
  "received",
  "fulfilled",
  "consumed",
]);

const NON_BILLABLE_QUOTE_LINE_STATUSES = new Set([
  "declined",
  "deferred",
  "rejected",
  "cancelled",
  "canceled",
]);

function itemUnitPrice(
  item: Pick<PartRequestItemRow, "quoted_price" | "unit_price">,
): number {
  // unit_cost is the shop's private acquisition cost. A missing customer sell
  // price must remain visible as a pricing error instead of underbilling at cost.
  return (
    safeNumberOrNull(item.quoted_price) ??
    safeNumberOrNull(item.unit_price) ??
    0
  );
}

function itemQuantity(
  item: Pick<PartRequestItemRow, "qty" | "qty_requested" | "qty_approved">,
): number {
  const qty = safeNumber(item.qty);
  const requested = safeNumber(item.qty_requested);
  const approved = safeNumber(item.qty_approved);
  const resolved = qty > 0 ? qty : requested > 0 ? requested : approved;
  return resolved > 0 ? resolved : 1;
}

function quoteLineIsInvoiceFallbackEligible(
  quote:
    | Pick<WorkOrderQuoteLineRow, "status" | "work_order_line_id">
    | undefined,
  lineId: string,
): boolean {
  if (!quote?.work_order_line_id || quote.work_order_line_id !== lineId)
    return false;
  const status = String(quote.status ?? "")
    .trim()
    .toLowerCase();
  return !NON_BILLABLE_QUOTE_LINE_STATUSES.has(status);
}

function partRequestItemIsInvoiceFallbackEligible(
  item: Pick<
    PartRequestItemRow,
    | "shop_id"
    | "work_order_id"
    | "work_order_line_id"
    | "quote_line_id"
    | "request_id"
    | "status"
    | "approved"
    | "qty"
    | "qty_requested"
    | "qty_approved"
  >,
  args: {
    shopId: string;
    workOrderId: string;
    workOrderLineId: string;
    requestQuoteLineIdByRequestId: Map<string, string>;
    quoteLineById: Map<
      string,
      Pick<WorkOrderQuoteLineRow, "status" | "work_order_line_id">
    >;
  },
): boolean {
  if (item.shop_id !== args.shopId) return false;
  if (item.work_order_id !== args.workOrderId) return false;
  if (item.work_order_line_id !== args.workOrderLineId) return false;

  const status = String(item.status ?? "")
    .trim()
    .toLowerCase();
  const statusIsBillable = BILLABLE_PART_REQUEST_ITEM_STATUSES.has(status);
  if (!statusIsBillable && item.approved !== true) return false;
  if (itemQuantity(item) <= 0) return false;

  const quoteLineId =
    (isNonEmptyString(item.quote_line_id) ? item.quote_line_id.trim() : "") ||
    args.requestQuoteLineIdByRequestId.get(item.request_id) ||
    "";
  if (!quoteLineId) return false;

  return quoteLineIsInvoiceFallbackEligible(
    args.quoteLineById.get(quoteLineId),
    args.workOrderLineId,
  );
}

export async function getInvoiceSnapshotForWorkOrder(args: {
  supabase: SupabaseClient<DB>;
  workOrderId: string;
}): Promise<InvoiceSnapshot> {
  const { supabase, workOrderId } = args;

  const { data: workOrder, error: woErr } = await supabase
    .from("work_orders")
    .select(
      "id, shop_id, customer_id, vehicle_id, customer_name, custom_id, status, labor_total, parts_total, invoice_total, shop_supplies_enabled_override, shop_supplies_amount_override, created_at",
    )
    .eq("id", workOrderId)
    .maybeSingle<
      Pick<
        WorkOrderRow,
        | "id"
        | "shop_id"
        | "customer_id"
        | "vehicle_id"
        | "customer_name"
        | "custom_id"
        | "status"
        | "labor_total"
        | "parts_total"
        | "invoice_total"
        | "shop_supplies_enabled_override"
        | "shop_supplies_amount_override"
        | "created_at"
      >
    >();

  if (woErr || !workOrder) {
    throw new Error(woErr?.message || "Work order not found.");
  }

  const { data: invoice } = await supabase
    .from("invoices")
    .select(
      "id, invoice_number, status, currency, subtotal, parts_cost, labor_cost, shop_supplies_total, discount_total, tax_total, total, issued_at, created_at, notes",
    )
    .eq("work_order_id", workOrderId)
    .order("issued_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<
      Pick<
        InvoiceRow,
        | "id"
        | "invoice_number"
        | "status"
        | "currency"
        | "subtotal"
        | "parts_cost"
        | "labor_cost"
        | "shop_supplies_total"
        | "discount_total"
        | "tax_total"
        | "total"
        | "issued_at"
        | "created_at"
        | "notes"
      >
    >();

  // Match the work-order page exactly for labor pricing. That page reads
  // labor_rate in a dedicated query, so unrelated shop settings cannot turn
  // one labor hour into one dollar on the billing card.
  const { data: workOrderShopRate, error: workOrderShopRateError } =
    await supabase
      .from("shops")
      .select("labor_rate")
      .eq("id", workOrder.shop_id)
      .maybeSingle<Pick<ShopRow, "labor_rate">>();

  if (workOrderShopRateError) {
    throw new Error(
      `Shop labor rate is unavailable: ${workOrderShopRateError.message}`,
    );
  }

  const shopResult = await supabase
    .from("shops")
    .select(
      "business_name, shop_name, name, country, phone_number, email, street, city, province, postal_code, labor_rate, supplies_percent, shop_supplies_enabled, shop_supplies_type, shop_supplies_percent, shop_supplies_flat_amount, shop_supplies_cap_amount, tax_rate, logo_url, invoice_terms, invoice_footer",
    )
    .eq("id", workOrder.shop_id)
    .maybeSingle<
      Pick<
        ShopRow,
        | "business_name"
        | "shop_name"
        | "name"
        | "country"
        | "phone_number"
        | "email"
        | "street"
        | "city"
        | "province"
        | "postal_code"
        | "labor_rate"
        | "supplies_percent"
        | "shop_supplies_enabled"
        | "shop_supplies_type"
        | "shop_supplies_percent"
        | "shop_supplies_flat_amount"
        | "shop_supplies_cap_amount"
        | "tax_rate"
        | "logo_url"
        | "invoice_terms"
        | "invoice_footer"
      >
    >();

  // Keep the core labor/tax lookup usable when a deployment has not refreshed
  // every optional shop-supplies column yet. PostgREST rejects the entire
  // select when even one selected column is unavailable, which previously
  // turned a configured $140 rate into a null shop row and then a $1 fallback.
  const shopFallbackResult =
    shopResult.error || !shopResult.data
      ? await supabase
          .from("shops")
          .select(
            "business_name, shop_name, name, country, phone_number, email, street, city, province, postal_code, labor_rate, supplies_percent, tax_rate, logo_url, invoice_terms, invoice_footer",
          )
          .eq("id", workOrder.shop_id)
          .maybeSingle<
            Pick<
              ShopRow,
              | "business_name"
              | "shop_name"
              | "name"
              | "country"
              | "phone_number"
              | "email"
              | "street"
              | "city"
              | "province"
              | "postal_code"
              | "labor_rate"
              | "supplies_percent"
              | "tax_rate"
              | "logo_url"
              | "invoice_terms"
              | "invoice_footer"
            >
          >()
      : null;

  if (shopFallbackResult?.error) {
    throw new Error(
      `Shop pricing configuration is unavailable: ${shopFallbackResult.error.message}`,
    );
  }

  const shopCore = shopResult.data ?? shopFallbackResult?.data ?? null;
  if (!shopCore) {
    throw new Error("Shop labor and tax configuration could not be loaded.");
  }
  const shop = shopCore
    ? ({
        shop_supplies_enabled: null,
        shop_supplies_type: null,
        shop_supplies_percent: null,
        shop_supplies_flat_amount: null,
        shop_supplies_cap_amount: null,
        ...shopCore,
        labor_rate: workOrderShopRate?.labor_rate ?? shopCore.labor_rate,
      } as InvoiceSnapshot["shop"])
    : null;

  const { data: customer } = workOrder.customer_id
    ? await supabase
        .from("customers")
        .select(
          "name, first_name, last_name, phone, phone_number, email, business_name, street, city, province, postal_code",
        )
        .eq("id", workOrder.customer_id)
        .maybeSingle<
          Pick<
            CustomerRow,
            | "name"
            | "first_name"
            | "last_name"
            | "phone"
            | "phone_number"
            | "email"
            | "business_name"
   ßMz¶‰žËkºwµçuÌ(€€ø ¤ì(€™½È€¡½¹ÍÐ¥Ñ•´½˜™…±±‰…­I•ÅÕ•ÍÑ%Ñ•µÌ¤ì(€€€¥˜€ …¥Ñ•´¹Ý½É­}½É‘•É}±¥¹•}¥¤½¹Ñ¥¹Õ”ì(€€€‰å1¥¹•…±±‰…­I•ÅÕ•ÍÑ%Ñ•µÌ¹Í•Ð¡¥Ñ•´¹Ý½É­}½É‘•É}±¥¹•}¥°l(€€€€€€¸¸¸¡‰å1¥¹•…±±‰…­I•ÅÕ•ÍÑ%Ñ•µÌ¹•Ð¡¥Ñ•´¹Ý½É­}½É‘•É}±¥¹•}¥¤€üümt¤°(€€€€€¥Ñ•´°(€€€t¤ì(€ô((€½¹ÍÐÁ…ÉÑ%‘Ì€ôÉÉ…ä¹™É½´ (€€€¹•ÜM•Ð (€€€€€l(€€€€€€€€¸¸¹…±±½Ì¹µ…À ¡„¤€ôø„¹Á…ÉÑ}¥¤°(€€€€€€€€¸¸¹ÍÑ…•‘A…ÉÑÌ¹µ…À ¡Á…ÉÐ¤€ôøÁ…ÉÐ¹Á…ÉÑ}¥¤°(€€€€€€€€¸¸¹™…±±‰…­I•ÅÕ•ÍÑ%Ñ•µÌ¹µ…À ¡¥Ñ•´¤€ôø¥Ñ•´¹Á…ÉÑ}¥¤°(€€€€€t(€€€€€€€€¹™¥±Ñ•È¡¥Í9½¹µÁÑåMÑÉ¥¹œ¤(€€€€€€€€¹µ…À ¡¥¤€ôø¥¹ÑÉ¥´ ¤¤°(€€€€¤°(€€¤ì((€½¹ÍÐÁ…ÉÑÍ5…À€ô¹•Ü5…Àð(€€€ÍÑÉ¥¹œ°(€€€A¥¬ð(€€€€€A…ÉÑI½Ü°(€€€€€€‰¥ˆð€‰¹…µ”ˆð€‰Í­Ôˆð€‰Á…ÉÑ}¹Õµ‰•Èˆð€‰Õ¹¥Ðˆð€‰ÁÉ¥”ˆð€‰‘•™…Õ±Ñ}ÁÉ¥”ˆ(€€€€ø(€€ø ¤ì((€¥˜€¡Á…ÉÑ%‘Ì¹±•¹Ñ €ø€À¤ì(€€€½¹ÍÐì‘…Ñ„èÁ…ÉÑI½ÝÌ°•ÉÉ½ÈèÁ…ÉÑI½ÝÍÉÉ½Èô€ô…Ý…¥ÐÍÕÁ…‰…Í”(€€€€€€¹™É½´ ‰Á…ÉÑÌˆ¤(€€€€€€¹Í•±•Ð ‰¥°¹…µ”°Í­Ô°Á…ÉÑ}¹Õµ‰•È°Õ¹¥Ð°ÁÉ¥”°‘•™…Õ±Ñ}ÁÉ¥”ˆ¤(€€€€€€¹•Ä ‰Í¡½Á}¥ˆ°Ý½É­=É‘•È¹Í¡½Á}¥¤(€€€€€€¹¥¸ ‰¥ˆ°Á…ÉÑ%‘Ì¤(€€€€€€¹É•ÑÕÉ¹Ìð(€€€€€€€ÉÉ…äð(€€€€€€€€€A¥¬ð(€€€€€€€€€€€A…ÉÑI½Ü°(€€€€€€€€€€€ð€‰¥ˆ(€€€€€€€€€€€ð€‰¹…µ”ˆ(€€€€€€€€€€€ð€‰Í­Ôˆ(€€€€€€€€€€€ð€‰Á…ÉÑ}¹Õµ‰•Èˆ(€€€€€€€€€€€ð€‰Õ¹¥Ðˆ(€€€€€€€€€€€ð€‰ÁÉ¥”ˆ(€€€€€€€€€€€ð€‰‘•™…Õ±Ñ}ÁÉ¥”ˆ(€€€€€€€€€€ø(€€€€€€€€ø(€€€€€€ø ¤ì((€€€¥˜€¡Á…ÉÑI½ÝÍÉÉ½È¤ì(€€€€€Ñ¡É½Ü¹•ÜÉÉ½È (€€€€€€€A…ÉÑÌ…Ñ…±½œÁÉ¥¥¹œ¥ÌÕ¹…Ù…¥±…‰±”è€‘íÁ…ÉÑI½ÝÍÉÉ½È¹µ•ÍÍ…•õ€°(€€€€€€¤ì(€€€ô((€€€™½È€¡½¹ÍÐÀ½˜ÉÉ…ä¹¥ÍÉÉ…ä¡Á…ÉÑI½ÝÌ¤€üÁ…ÉÑI½ÝÌ€èmt¤ì(€€€€€¥˜€¡¥Í9½¹µÁÑåMÑÉ¥¹œ¡À¹¥¤¤Á…ÉÑÍ5…À¹Í•Ð¡À¹¥°À¤ì(€€€ô(€ô((€½¹ÍÐÉ•ÅÕ•ÍÑ%Ñ•µ	å%€ô¹•Ü5…À¡É•ÅÕ•ÍÑ%Ñ•µÌ¹µ…À ¡¥Ñ•´¤€ôøm¥Ñ•´¹¥°¥Ñ•µt¤¤ì(€½¹ÍÐ…±±½…Ñ¥½¹A…ÉÑ	å%€ô¹•Ü5…ÀñÍÑÉ¥¹œ°%¹Ù½¥•M¹…ÁÍ¡½ÑA…ÉÐø ¤ì(€™½È€¡½¹ÍÐ„½˜…±±½Ì¤ì(€€€½¹ÍÐÀ€ô¥Í9½¹µÁÑåMÑÉ¥¹œ¡„¹Á…ÉÑ}¥¤€üÁ…ÉÑÍ5…À¹•Ð¡„¹Á…ÉÑ}¥¤€èÕ¹‘•™¥¹•ì(€€€½¹ÍÐÉ•ÅÕ•ÍÑ%Ñ•´€ô¥Í9½¹µÁÑåMÑÉ¥¹œ¡„¹Í½ÕÉ•}É•ÅÕ•ÍÑ}¥Ñ•µ}¥¤(€€€€€€üÉ•ÅÕ•ÍÑ%Ñ•µ	å%¹•Ð¡„¹Í½ÕÉ•}É•ÅÕ•ÍÑ}¥Ñ•µ}¥¤(€€€€€€èÕ¹‘•™¥¹•ì(€€€½¹ÍÐÅÑåI…Ü€ôÍ…™•9Õµ‰•È¡„¹ÅÑä¤ì(€€€½¹ÍÐÅÑä€ôÅÑåI…Ü€ø€À€üÅÑåI…Ü€è€Äì(€€€€¼¼±±½…Ñ¥½¸½ÍÐ¥Ì…¸¥¹Ñ•É¹…°Ù…±Õ…Ñ¥½¸…¹µÕÍÐ¹•Ù•È‰•½µ”„ÕÍÑ½µ•È(€€€€¼¼¡…É”¸AÉ•™•ÈÑ¡”É•ÅÕ•ÍÐÌÕÍÑ½µ•ÈÅÕ½Ñ”°Ñ¡•¸Ñ¡”…Ñ…±½œÍ•±°ÁÉ¥”¸(€€€½¹ÍÐÕ¹¥ÑAÉ¥”€ô(€€€€€€¡É•ÅÕ•ÍÑ%Ñ•´€ü¥Ñ•µU¹¥ÑAÉ¥”¡É•ÅÕ•ÍÑ%Ñ•´¤€è€À¤ñð(€€€€€Í…™•9Õµ‰•È¡Àü¹ÁÉ¥”¤ñð(€€€€€Í…™•9Õµ‰•È¡Àü¹‘•™…Õ±Ñ}ÁÉ¥”¤ì(€€€½¹ÍÐÑ½Ñ…±AÉ¥”€ô5…Ñ ¹µ…à À°ÅÑä€¨Õ¹¥ÑAÉ¥”¤ì(€€€½¹ÍÐ±¥‘I…Ü€ô„¹Ý½É­}½É‘•É}±¥¹•}¥ì(€€€½¹ÍÐ±¥¹•%€ô¥Í9½¹µÁÑåMÑÉ¥¹œ¡±¥‘I…Ü¤€ü±¥‘I…Ü¹ÑÉ¥´ ¤€èÕ¹‘•™¥¹•ì((€€€…±±½…Ñ¥½¹A…ÉÑ	å%¹Í•Ð¡MÑÉ¥¹œ¡„¹¥¤°ì(€€€€€¥èMÑÉ¥¹œ¡„¹¥¤°(€€€€€ÁÉ¥¥¹M½ÕÉ•%èÉ•ÅÕ•ÍÑ%Ñ•´ü¹¥°(€€€€€±¥¹•%°(€€€€€¹…µ”è€¡Àü¹¹…µ”€üü€‰A…ÉÐˆ¤¹ÑÉ¥´ ¤ñð€‰A…ÉÐˆ°(€€€€€ÅÑä°(€€€€€Õ¹¥ÑAÉ¥”°(€€€€€Ñ½Ñ…±AÉ¥”°(€€€€€Í­Ôè€¡Àü¹Í­Ô€üü€ˆˆ¤¹ÑÉ¥´ ¤ñðÕ¹‘•™¥¹•°(€€€€€Á…ÉÑ9Õµ‰•Èè€¡Àü¹Á…ÉÑ}¹Õµ‰•È€üü€ˆˆ¤¹ÑÉ¥´ ¤ñðÕ¹‘•™¥¹•°(€€€€€Õ¹¥Ðè€¡Àü¹Õ¹¥Ð€üü€ˆˆ¤¹ÑÉ¥´ ¤ñðÕ¹‘•™¥¹•°(€€€€€Í½ÕÉ”è€‰Ý½É­}½É‘•É}Á…ÉÑ}…±±½…Ñ¥½¸ˆ°(€€€ô¤ì(€ô((€½¹ÍÐÍÑ…•‘%¹Ù½¥•A…ÉÑÌè%¹Ù½¥•M¹…ÁÍ¡½ÑA…ÉÑmt€ôÍÑ…•‘A…ÉÑÌ¹™±…Ñ5…À (€€€€¡Á…ÉÐ¤€ôøì(€€€€€½¹ÍÐÀ€ô¥Í9½¹µÁÑåMÑÉ¥¹œ¡Á…ÉÐ¹Á…ÉÑ}¥¤(€€€€€€€€üÁ…ÉÑÍ5…À¹•Ð¡Á…ÉÐ¹Á…ÉÑ}¥¤(€€€€€€€€èÕ¹‘•™¥¹•ì(€€€€€½¹ÍÐÁ…ÉÑI•½É€ôÁ…ÉÐ…ÌI•½ÉñÍÑÉ¥¹œ°Õ¹­¹½Ý¸øì(€€€€€¥˜€¡Á…ÉÑI•½É¹¥Í}…Ñ¥Ù”€ôôô™…±Í”¤É•ÑÕÉ¸mtì(€€€€€€¼¼ÁÁÉ½Ù…°™É••é•ÌÑ¡”ÕÍÑ½µ•Èµ™…¥¹œÅÕ…¹Ñ¥Ñä½¸Ý½É­}½É‘•É}Á…ÉÑÌ¸(€€€€€€¼¼½¹ÍÕµÁÑ¥½¸¥Ì…¸¥¹Ù•¹Ñ½Éä•Ù•¹Ð…¹µÕÍÐ¹½Ð¡…¹”¥¹Ù½¥”ÅÕ…¹Ñ¥Ñä¸(€€€€€½¹ÍÐÅÑä€ôÉ•Í½±Ù•ÁÁÉ½Ù•‘A…ÉÑ%¹Ù½¥•EÕ…¹Ñ¥Ñä¡ì(€€€€€€€ÅÕ…¹Ñ¥ÑåI•ÅÕ•ÍÑ•èÁ…ÉÑI•½É¹ÅÕ…¹Ñ¥Ñå}É•ÅÕ•ÍÑ•°(€€€€€€€ÅÕ…¹Ñ¥ÑäèÁ…ÉÐ¹ÅÕ…¹Ñ¥Ñä°(€€€€€€€ÅÕ…¹Ñ¥ÑåI•ÑÕÉ¹•èÁ…ÉÑI•½É¹ÅÕ…¹Ñ¥Ñå}É•ÑÕÉ¹•°(€€€€€€€ÅÕ…¹Ñ¥Ñå…¹•±±•èÁ…ÉÑI•½É¹ÅÕ…¹Ñ¥Ñå}…¹•±±•°(€€€€€ô¤ì(€€€€€¥˜€¡ÅÑä€ðô€À¤É•ÑÕÉ¸mtì(€€€€€½¹ÍÐÑ½Ñ…±I…Ü€ôÍ…™•9Õµ‰•È¡Á…ÉÐ¹Ñ½Ñ…±}ÁÉ¥”¤ì(€€€€€½¹ÍÐÕ¹¥ÑAÉ¥”€ô(€€€€€€€Í…™•9Õµ‰•È¡Á…ÉÑI•½É¹Õ¹¥Ñ}Í•±±}ÁÉ¥•}Í¹…ÁÍ¡½Ð¤ñð(€€€€€€€Í…™•9Õµ‰•È¡Á…ÉÐ¹Õ¹¥Ñ}ÁÉ¥”¤ñð(€€€€€€€Í…™•9Õµ‰•È¡Àü¹ÁÉ¥”¤ñð(€€€€€€€Í…™•9Õµ‰•È¡Àü¹‘•™…Õ±Ñ}ÁÉ¥”¤ì(€€€€€½¹ÍÐÑ½Ñ…±AÉ¥”€ô(€€€€€€€Õ¹¥ÑAÉ¥”€ø€À€ü5…Ñ ¹µ…à À°ÅÑä€¨Õ¹¥ÑAÉ¥”¤€èÑ½Ñ…±I…Üì(€€€€€½¹ÍÐ±¥¹•%€ô¥Í9½¹µÁÑåMÑÉ¥¹œ¡Á…ÉÐ¹Ý½É­}½É‘•É}±¥¹•}¥¤(€€€€€€€€üÁ…ÉÐ¹Ý½É­}½É‘•É}±¥¹•}¥¹ÑÉ¥´ ¤(€€€€€€€€èÕ¹‘•™¥¹•ì((€€€€€É•ÑÕÉ¸l(€€€€€€€ì(€€€€€€€€€¥èMÑÉ¥¹œ¡Á…ÉÐ¹¥¤°(€€€€€€€€€±¥¹•%°(€€€€€€€€€¹…µ”è(€€€€€€€€€€€€ (€€€€€€€€€€€€€MÑÉ¥¹œ¡Á…ÉÑI•½É¹‘•ÍÉ¥ÁÑ¥½¹}Í¹…ÁÍ¡½Ð€üü€ˆˆ¤¹ÑÉ¥´ ¤ñð(€€€€€€€€€€€€€€¡Àü¹¹…µ”€üü€‰A…ÉÐˆ¤(€€€€€€€€€€€€¤¹ÑÉ¥´ ¤ñð€‰A…ÉÐˆ°(€€€€€€€€€ÅÑä°(€€€€€€€€€Õ¹¥ÑAÉ¥”°(€€€€€€€€€Ñ½Ñ…±AÉ¥”°(€€€€€€€€€Í­Ôè€¡Àü¹Í­Ô€üü€ˆˆ¤¹ÑÉ¥´ ¤ñðÕ¹‘•™¥¹•°(€€€€€€€€€Á…ÉÑ9Õµ‰•Èè(€€€€€€€€€€€€ (€€€€€€€€€€€€€MÑÉ¥¹œ¡Á…ÉÑI•½É¹Á…ÉÑ}¹Õµ‰•É}Í¹…ÁÍ¡½Ð€üü€ˆˆ¤¹ÑÉ¥´ ¤ñð(€€€€€€€€€€€€€€¡Àü¹Á…ÉÑ}¹Õµ‰•È€üü€ˆˆ¤(€€€€€€€€€€€€¤¹ÑÉ¥´ ¤ñðÕ¹‘•™¥¹•°(€€€€€€€€€Õ¹¥Ðè€¡Àü¹Õ¹¥Ð€üü€ˆˆ¤¹ÑÉ¥´ ¤ñðÕ¹‘•™¥¹•°(€€€€€€€€€Í½ÕÉ”è€‰Ý½É­}½É‘•É}Á…ÉÐˆ°(€€€€€€€ô°(€€€€€tì(€€€ô°(€€¤ì((€½¹ÍÐÉ•ÅÕ•ÍÑ%Ñ•µ%¹Ù½¥•A…ÉÑÌè%¹Ù½¥•M¹…ÁÍ¡½ÑA…ÉÑmt€ô(€€€™…±±‰…­I•ÅÕ•ÍÑ%Ñ•µÌ¹µ…À ¡¥Ñ•´¤€ôøì(€€€€€½¹ÍÐÀ€ô¥Í9½¹µÁÑåMÑÉ¥¹œ¡¥Ñ•´¹Á…ÉÑ}¥¤(€€€€€€€€üÁ…ÉÑÍ5…À¹•Ð¡¥Ñ•´¹Á…ÉÑ}¥¤(€€€€€€€€èÕ¹‘•™¥¹•ì(€€€€€½¹ÍÐÅÑä€ô¥Ñ•µEÕ…¹Ñ¥Ñä¡¥Ñ•´¤ì(€€€€€½¹ÍÐÕ¹¥ÑAÉ¥”€ô¥Ñ•µU¹¥ÑAÉ¥”¡¥Ñ•´¤ì(€€€€€½¹ÍÐ±¥¹•%€ô¥Í9½¹µÁÑåMÑÉ¥¹œ¡¥Ñ•´¹Ý½É­}½É‘•É}±¥¹•}¥¤(€€€€€€€€ü¥Ñ•´¹Ý½É­}½É‘•É}±¥¹•}¥¹ÑÉ¥´ ¤(€€€€€€€€èÕ¹‘•™¥¹•ì(€€€€€½¹ÍÐ¹…µ”€ô(€€€€€€€€¡¥Ñ•´¹‘•ÍÉ¥ÁÑ¥½¸€üü€ˆˆ¤¹ÑÉ¥´ ¤ñð€¡Àü¹¹…µ”€üü€ˆˆ¤¹ÑÉ¥´ ¤ñð€‰A…ÉÐˆì((€€€€€É•ÑÕÉ¸ì(€€€€€€€¥èMÑÉ¥¹œ¡¥Ñ•´¹¥¤°(€€€€€€€±¥¹•%°(€€€€€€€¹…µ”°(€€€€€€€ÅÑä°(€€€€€€€Õ¹¥ÑAÉ¥”°(€€€€€€€Ñ½Ñ…±AÉ¥”è5…Ñ ¹µ…à À°ÅÑä€¨Õ¹¥ÑAÉ¥”¤°(€€€€€€€Í­Ôè€¡Àü¹Í­Ô€üü€ˆˆ¤¹ÑÉ¥´ ¤ñðÕ¹‘•™¥¹•°(€€€€€€€Á…ÉÑ9Õµ‰•Èè€¡Àü¹Á…ÉÑ}¹Õµ‰•È€üü€ˆˆ¤¹ÑÉ¥´ ¤ñðÕ¹‘•™¥¹•°(€€€€€€€Õ¹¥Ðè€¡Àü¹Õ¹¥Ð€üü€ˆˆ¤¹ÑÉ¥´ ¤ñðÕ¹‘•™¥¹•°(€€€€€€€Ù•¹‘½Èè€¡¥Ñ•´¹Ù•¹‘½È€üü€ˆˆ¤¹ÑÉ¥´ ¤ñðÕ¹‘•™¥¹•°(€€€€€€€Í½ÕÉ”è€‰ÅÕ½Ñ•}±¥¹•}Á…ÉÑ}É•ÅÕ•ÍÐˆ°(€€€€€ôì(€€€ô¤ì((€½¹ÍÐÍÑ…•‘A…ÉÑÍ	å1¥¹•½É¥ÍÁ±…ä€ô¹•Ü5…ÀñÍÑÉ¥¹œ°%¹Ù½¥•M¹…ÁÍ¡½ÑA…ÉÑmtø ¤ì(€™½È€¡½¹ÍÐÁ…ÉÐ½˜ÍÑ…•‘%¹Ù½¥•A…ÉÑÌ¤ì(€€€¥˜€ …Á…ÉÐ¹±¥¹•%¤½¹Ñ¥¹Õ”ì(€€€ÍÑ…•‘A…ÉÑÍ	å1¥¹•½É¥ÍÁ±…ä¹Í•Ð¡Á…ÉÐ¹±¥¹•%°l(€€€€€€¸¸¸¡ÍÑ…•‘A…ÉÑÍ	å1¥¹•½É¥ÍÁ±…ä¹•Ð¡Á…ÉÐ¹±¥¹•%¤€üümt¤°(€€€€€Á…ÉÐ°(€€€t¤ì(€ô((€½¹ÍÐ™…±±‰…­A…ÉÑÍ	å1¥¹•½É¥ÍÁ±…ä€ô¹•Ü5…Àð(€€€ÍÑÉ¥¹œ°(€€€%¹Ù½¥•M¹…ÁÍ¡½ÑA…ÉÑmt(€€ø ¤ì(€™½È€¡½¹ÍÐÁ…ÉÐ½˜É•ÅÕ•ÍÑ%Ñ•µ%¹Ù½¥•A…ÉÑÌ¤ì(€€€¥˜€ …Á…ÉÐ¹±¥¹•%¤½¹Ñ¥¹Õ”ì(€€€™…±±‰…­A…ÉÑÍ	å1¥¹•½É¥ÍÁ±…ä¹Í•Ð¡Á…ÉÐ¹±¥¹•%°l(€€€€€€¸¸¸¡™…±±‰…­A…ÉÑÍ	å1¥¹•½É¥ÍÁ±…ä¹•Ð¡Á…ÉÐ¹±¥¹•%¤€üümt¤°(€€€€€Á…ÉÐ°(€€€t¤ì(€ô((€½¹ÍÐÁ…ÉÑÌè%¹Ù½¥•M¹…ÁÍ¡½ÑA…ÉÑmt€ômtì(€™½È€¡½¹ÍÐ±¥¹”½˜±¥¹•Ì¤ì(€€€½¹ÍÐ±¥¹•±±½…Ñ¥½¹Ì€ô‰å1¥¹•±±½Œ¹•Ð¡±¥¹”¹¥¤€üümtì(€€€½¹ÍÐ±¥¹•MÑ…•€ôÍÑ…•‘A…ÉÑÍ	å1¥¹•½É¥ÍÁ±…ä¹•Ð¡±¥¹”¹¥¤€üümtì(€€€½¹ÍÐÉ…Ý1¥¹•MÑ…•€ô‰å1¥¹•MÑ…•¹•Ð¡±¥¹”¹¥¤€üümtì(€€€½¹ÍÐ‘¥ÍÁ±…å•‘MÑ…•‘%‘Ì€ô¹•ÜM•Ð¡±¥¹•MÑ…•¹µ…À ¡Á…ÉÐ¤€ôøÁ…ÉÐ¹¥¤¤ì(€€€½¹ÍÐÕ¹‰…­•‘±±½…Ñ¥½¹Ì€ô™¥±Ñ•É%¹Ù½¥•A…ÉÑ±±½…Ñ¥½¹Ì¡ì(€€€€€…±±½…Ñ¥½¹Ìè±¥¹•±±½…Ñ¥½¹Ì°(€€€€€ÍÑ…•‘A…ÉÑÌèÉ…Ý1¥¹•MÑ…•…ÌÉÉ…äð(€€€€€€€€¡ÑåÁ•½˜É…Ý1¥¹•MÑ…•¥m¹Õµ‰•Ét€˜ì(€€€€€€€€€Í½ÕÉ•}Á…ÉÑÍ}É•ÅÕ•ÍÑ}¥Ñ•µ}¥üèÍÑÉ¥¹œð¹Õ±°ì(€€€€€€€ô(€€€€€€ø°(€€€€€‘¥ÍÁ±…å•‘MÑ…•‘A…ÉÑ%‘Ìè‘¥ÍÁ±…å•‘MÑ…•‘%‘Ì°(€€€ô¤ì(€€€½¹ÍÐÕ¹‰…­•‘±±½…Ñ¥½¹A…ÉÑÌ€ôÕ¹‰…­•‘±±½…Ñ¥½¹Ì¹™±…Ñ5…À (€€€€€€¡…±±½…Ñ¥½¸¤€ôøì(€€€€€€€½¹ÍÐÁ…ÉÐ€ô…±±½…Ñ¥½¹A…ÉÑ	å%¹•Ð¡MÑÉ¥¹œ¡…±±½…Ñ¥½¸¹¥¤¤ì(€€€€€€€É•ÑÕÉ¸Á…ÉÐ€ümÁ…ÉÑt€èmtì(€€€€€ô°(€€€€¤ì((€€€¥˜€¡±¥¹•MÑ…•¹±•¹Ñ €ø€À¤ì(€€€€€Á…ÉÑÌ¹ÁÕÍ  ¸¸¹±¥¹•MÑ…•¤ì(€€€€€Á…ÉÑÌ¹ÁÕÍ  ¸¸¹Õ¹‰…­•‘±±½…Ñ¥½¹A…ÉÑÌ¤ì(€€€€€½¹Ñ¥¹Õ”ì(€€€ô((€€€¥˜€¡Õ¹‰…­•‘±±½…Ñ¥½¹A…ÉÑÌ¹±•¹Ñ €ø€À¤ì(€€€€€Á…ÉÑÌ¹ÁÕÍ  ¸¸¹Õ¹‰…­•‘±±½…Ñ¥½¹A…ÉÑÌ¤ì(€€€€€½¹Ñ¥¹Õ”ì(€€€ô((€€€Á…ÉÑÌ¹ÁÕÍ  ¸¸¸¡™…±±‰…­A…ÉÑÍ	å1¥¹•½É¥ÍÁ±…ä¹•Ð¡±¥¹”¹¥¤€üümt¤¤ì(€ô((€½¹ÍÐ½Ù•ÉÉ¥‘•±¥•¹Ð€ôÍÕÁ…‰…Í”…ÌÕ¹­¹½Ý¸…ÌAÉ¥¥¹=Ù•ÉÉ¥‘•±¥•¹Ðì(€½¹ÍÐì‘…Ñ„èÁÉ¥¥¹=Ù•ÉÉ¥‘”°•ÉÉ½ÈèÁÉ¥¥¹=Ù•ÉÉ¥‘•ÉÉ½Èô€ô(€€€…Ý…¥Ð½Ù•ÉÉ¥‘•±¥•¹Ð(€€€€€€¹™É½´ ‰¥¹Ù½¥•}ÁÉ¥¥¹}½Ù•ÉÉ¥‘•Ìˆ¤(€€€€€€¹Í•±•Ð ‰±¥¹•}±…‰½É}Ñ½Ñ…±Ì±Á…ÉÑ}Õ¹¥Ñ}ÁÉ¥•Ì±Í¡½Á}ÍÕÁÁ±¥•Í}…µ½Õ¹Ðˆ¤(€€€€€€¹•Ä ‰Í¡½Á}¥ˆ°Ý½É­=É‘•È¹Í¡½Á}¥¤(€€€€€€¹•Ä ‰Ý½É­}½É‘•É}¥ˆ°Ý½É­=É‘•É%¤(€€€€€€¹µ…å‰•M¥¹±”ñ%¹Ù½¥•AÉ¥¥¹=Ù•ÉÉ¥‘•I½Üø ¤ì(€¥˜€ (€€€ÁÉ¥¥¹=Ù•ÉÉ¥‘•ÉÉ½È€˜˜(€€€€„½Í¡•µ„…¡•ñ‘½•Ì¹½Ð•á¥ÍÐ½¤¹Ñ•ÍÐ¡ÁÉ¥¥¹=Ù•ÉÉ¥‘•ÉÉ½È¹µ•ÍÍ…”¤(€€¤ì(€€€Ñ¡É½Ü¹•ÜÉÉ½È (€€€€€%¹Ù½¥”ÁÉ¥¥¹œ½Ù•ÉÉ¥‘•Ì…É”Õ¹…Ù…¥±…‰±”è€‘íÁÉ¥¥¹=Ù•ÉÉ¥‘•ÉÉ½È¹µ•ÍÍ…•õ€°(€€€€¤ì(€ô(€½¹ÍÐ±¥¹•1…‰½É=Ù•ÉÉ¥‘•Ì€ôµ½¹•å=Ù•ÉÉ¥‘•5…À (€€€ÁÉ¥¥¹=Ù•ÉÉ¥‘”ü¹±¥¹•}±…‰½É}Ñ½Ñ…±Ì°(€€¤ì(€½¹ÍÐÁ…ÉÑAÉ¥•=Ù•ÉÉ¥‘•Ì€ôµ½¹•å=Ù•ÉÉ¥‘•5…À (€€€ÁÉ¥¥¹=Ù•ÉÉ¥‘”ü¹Á…ÉÑ}Õ¹¥Ñ}ÁÉ¥•Ì°(€€¤ì(€™½È€¡½¹ÍÐÁ…ÉÐ½˜Á…ÉÑÌ¤ì(€€€½¹ÍÐ½Ù•ÉÉ¥‘”€ô(€€€€€Á…ÉÑAÉ¥•=Ù•ÉÉ¥‘•Ì¹•Ð¡Á…ÉÐ¹ÁÉ¥¥¹M½ÕÉ•%€üü€ˆˆ¤€üü(€€€€€Á…ÉÑAÉ¥•=Ù•ÉÉ¥‘•Ì¹•Ð¡Á…ÉÐ¹¥¤ì(€€€¥˜€¡½Ù•ÉÉ¥‘”€ôô¹Õ±°¤½¹Ñ¥¹Õ”ì(€€€Á…ÉÐ¹Õ¹¥ÑAÉ¥”€ô½Ù•ÉÉ¥‘”ì(€€€Á…ÉÐ¹Ñ½Ñ…±AÉ¥”€ô5…Ñ ¹µ…à À°Í…™•9Õµ‰•È¡Á…ÉÐ¹ÅÑä¤€¨½Ù•ÉÉ¥‘”¤ì(€ô((€½¹ÍÐÕ¹ÁÉ¥•‘A…ÉÐ€ôÁ…ÉÑÌ¹™¥¹ (€€€€¡Á…ÉÐ¤€ôøÍ…™•9Õµ‰•È¡Á…ÉÐ¹ÅÑä¤€ø€À€˜˜Í…™•9Õµ‰•È¡Á…ÉÐ¹Õ¹¥ÑAÉ¥”¤€ðô€À°(€€¤ì(€¥˜€¡Õ¹ÁÉ¥•‘A…ÉÐ¤ì(€€€Ñ¡É½Ü¹•ÜÉÉ½È (€€€€€ÕÍÑ½µ•ÈÍ•±°ÁÉ¥”¥Ìµ¥ÍÍ¥¹œ™½È€‘íÕ¹ÁÉ¥•‘A…ÉÐ¹¹…µ”ñð€‰…¸…ÑÑ…¡•Á…ÉÐ‰ô¹€°(€€€€¤ì(€ô(€¥˜€ (€€€Á…ÉÑÌ¹±•¹Ñ €ôôô€À€˜˜(€€€€¡…±±½Ì¹±•¹Ñ €ø€Àñð(€€€€€ÍÑ…•‘%¹Ù½¥•A…ÉÑÌ¹±•¹Ñ €ø€Àñð(€€€€€™…±±‰…­I•ÅÕ•ÍÑ%Ñ•µÌ¹±•¹Ñ €ø€À¤(€€¤ì(€€€Ñ¡É½Ü¹•ÜÉÉ½È (€€€€€€‰ÑÑ…¡•Á…ÉÑÌ½Õ±¹½Ð‰”É•Í½±Ù•¥¹Ñ¼¥¹Ù½¥”±¥¹”¥Ñ•µÌ¸ˆ°(€€€€¤ì(€ô((€½¹ÍÐÕÍ•A•ÉÍ¥ÍÑ•‘%¹Ù½¥•Q½Ñ…±Ì€ôÍ¡½Õ±‘UÍ•A•ÉÍ¥ÍÑ•‘%¹Ù½¥•Q½Ñ…±Ì¡ì(€€€Ý½É­=É‘•ÉMÑ…ÑÕÌèÝ½É­=É‘•È¹ÍÑ…ÑÕÌ°(€€€¥¹Ù½¥•MÑ…ÑÕÌè¥¹Ù½¥”ü¹ÍÑ…ÑÕÌ°(€ô¤ì((€½¹ÍÐÕÉÉ•¹ä€ô(€€€€¡ÕÍ•A•ÉÍ¥ÍÑ•‘%¹Ù½¥•Q½Ñ…±Ì(€€€€€€ü¹½Éµ…±¥é•%¹Ù½¥•ÕÉÉ•¹ä¡¥¹Ù½¥”ü¹ÕÉÉ•¹ä¤(€€€€€€è¹Õ±°¤€üü¹½Éµ…±¥é•ÕÉÉ•¹åÉ½µ½Õ¹ÑÉä¡Í¡½Àü¹½Õ¹ÑÉä¤ì((€½¹ÍÐ¥¹ÙMÕ‰Ñ½Ñ…°€ôÕÍ•A•ÉÍ¥ÍÑ•‘%¹Ù½¥•Q½Ñ…±Ì(€€€€üÍ…™•9Õµ‰•É=É9Õ±°¡¥¹Ù½¥”ü¹ÍÕ‰Ñ½Ñ…°¤(€€€€è¹Õ±°ì(€½¹ÍÐ¥¹Ù1…‰½È€ôÕÍ•A•ÉÍ¥ÍÑ•‘%¹Ù½¥•Q½Ñ…±Ì(€€€€üÍ…™•9Õµ‰•É=É9Õ±°¡¥¹Ù½¥”ü¹±…‰½É}½ÍÐ¤(€€€€è¹Õ±°ì(€½¹ÍÐ¥¹ÙA…ÉÑÌ€ôÕÍ•A•ÉÍ¥ÍÑ•‘%¹Ù½¥•Q½Ñ…±Ì(€€€€üÍ…™•9Õµ‰•É=É9Õ±°¡¥¹Ù½¥”ü¹Á…ÉÑÍ}½ÍÐ¤(€€€€è¹Õ±°ì(€½¹ÍÐ¥¹ÙMÕÁÁ±¥•Ì€ôÕÍ•A•ÉÍ¥ÍÑ•‘%¹Ù½¥•Q½Ñ…±Ì(€€€€üÍ…™•9Õµ‰•É=É9Õ±°¡¥¹Ù½¥”ü¹Í¡½Á}ÍÕÁÁ±¥•Í}Ñ½Ñ…°¤(€€€€è¹Õ±°ì(€½¹ÍÐ¥¹ÙQ½Ñ…°€ôÕÍ•A•ÉÍ¥ÍÑ•‘%¹Ù½¥•Q½Ñ…±Ì(€€€€üÍ…™•9Õµ‰•É=É9Õ±°¡¥¹Ù½¥”ü¹Ñ½Ñ…°¤(€€€€è¹Õ±°ì(€½¹ÍÐ¥¹Ù¥Í½Õ¹Ð€ôÕÍ•A•ÉÍ¥ÍÑ•‘%¹Ù½¥•Q½Ñ…±Ì(€€€€üÍ…™•9Õµ‰•È¡¥¹Ù½¥”ü¹‘¥Í½Õ¹Ñ}Ñ½Ñ…°¤(€€€€è€Àì(€½¹ÍÐ¥¹ÙQ…à€ôÕÍ•A•ÉÍ¥ÍÑ•‘%¹Ù½¥•Q½Ñ…±Ì€üÍ…™•9Õµ‰•È¡¥¹Ù½¥”ü¹Ñ…á}Ñ½Ñ…°¤€è€Àì((€½¹ÍÐÝ½1…‰½È€ôÁ½Í¥Ñ¥Ù•=É9Õ±°¡Ý½É­=É‘•È¹±…‰½É}Ñ½Ñ…°¤ì(€½¹ÍÐÝ½A…ÉÑÌ€ôÁ½Í¥Ñ¥Ù•=É9Õ±°¡Ý½É­=É‘•È¹Á…ÉÑÍ}Ñ½Ñ…°¤ì(€½¹ÍÐÝ½%¹Ù½¥•Q½Ñ…°€ôÁ½Í¥Ñ¥Ù•=É9Õ±°¡Ý½É­=É‘•È¹¥¹Ù½¥•}Ñ½Ñ…°¤ì((€½¹ÍÐ‰å1¥¹•EÕ½Ñ”€ô¹•Ü5…ÀñÍÑÉ¥¹œ°€¡ÑåÁ•½˜…Ñ¥Ù•EÕ½Ñ•Ì¥m¹Õµ‰•Étø ¤ì(€™½È€¡½¹ÍÐÄ½˜…Ñ¥Ù•EÕ½Ñ•Ì¤ì(€€€¥˜€ …Ä¹Ý½É­}½É‘•É}±¥¹•}¥¤½¹Ñ¥¹Õ”ì(€€€‰å1¥¹•EÕ½Ñ”¹Í•Ð¡Ä¹Ý½É­}½É‘•É}±¥¹•}¥°Ä¤ì(€ô((€±•ÐÉ•Í½±Ù•‘1…‰½È€ô€Àì(€±•ÐÉ•Í½±Ù•‘A…ÉÑÌ€ô€Àì(€½¹ÍÐÁÉ¥•‘1¥¹•Ìè%¹Ù½¥•M¹…ÁÍ¡½Ñ1¥¹•mt€ômtì(€™½È€¡½¹ÍÐ±¥¹”½˜±¥¹•Ì¤ì(€€€½¹ÍÐ±¥¹•A…ÉÑÌ€ôÁ…ÉÑÌ¹™¥±Ñ•È ¡Á…ÉÐ¤€ôøÁ…ÉÐ¹±¥¹•%€ôôô±¥¹”¹¥¤ì(€€€½¹ÍÐÍÑ…•‘AÉ¥¥¹A…ÉÑÌ€ô±¥¹•A…ÉÑÌ¹µ…À ¡Á…ÉÐ¤€ôø€¡ì(€€€€€ÅÕ…¹Ñ¥ÑäèÁ…ÉÐ¹ÅÑä°(€€€€€Õ¹¥Ñ}ÁÉ¥”èÁ…ÉÐ¹Õ¹¥ÑAÉ¥”°(€€€€€Ñ½Ñ…±}ÁÉ¥”èÁ…ÉÐ¹Ñ½Ñ…±AÉ¥”°(€€€ô¤¤ì((€€€½¹ÍÐÉ•Í½±Ù•€ôÉ•Í½±Ù•]½É­=É‘•É1¥¹•AÉ¥¥¹œ¡ì(€€€€€±¥¹”°(€€€€€ÅÕ½Ñ”è‰å1¥¹•EÕ½Ñ”¹•Ð¡±¥¹”¹¥¤€üü¹Õ±°°(€€€€€Í¡½Á1…‰½ÉI…Ñ”èÍ…™•9Õµ‰•É=É9Õ±°¡Í¡½Àü¹±…‰½É}É…Ñ”¤°(€€€€€ÍÑ…•‘A…ÉÑÌèÍÑ…•‘AÉ¥¥¹A…ÉÑÌ°(€€€€€…±±½…Ñ•‘A…ÉÑÌèmt°(€€€ô¤ì(€€€½¹ÍÐÉ•Í½±Ù•‘1¥¹•A…ÉÑÌ€ô(€€€€€±¥¹•A…ÉÑÌ¹±•¹Ñ €ø€À(€€€€€€€€ü±¥¹•A…ÉÑÌ¹É•‘Õ” ¡ÍÕ´°Á…ÉÐ¤€ôøÍÕ´€¬Í…™•9Õµ‰•È¡Á…ÉÐ¹Ñ½Ñ…±AÉ¥”¤°€À¤(€€€€€€€€èÉ•Í½±Ù•¹Á…ÉÑÍQ½Ñ…°ì(€€€½¹ÍÐÉ•Í½±Ù•‘1¥¹•1…‰½È€ô(€€€€€±¥¹•1…‰½É=Ù•ÉÉ¥‘•Ì¹•Ð¡±¥¹”¹¥¤€üüÉ•Í½±Ù•¹±…‰½ÉQ½Ñ…°ì(€€€É•Í½±Ù•‘1…‰½È€¬ôÉ•Í½±Ù•‘1¥¹•1…‰½Èì(€€€É•Í½±Ù•‘A…ÉÑÌ€¬ôÉ•Í½±Ù•‘1¥¹•A…ÉÑÌì(€€€ÁÉ¥•‘1¥¹•Ì¹ÁÕÍ ¡ì(€€€€€€¸¸¹±¥¹”°(€€€€€É•Í½±Ù•‘1…‰½É!½ÕÉÌèÉ•Í½±Ù•¹±…‰½É!½ÕÉÌ°(€€€€€É•Í½±Ù•‘1…‰½ÉI…Ñ”èÉ•Í½±Ù•¹±…‰½ÉI…Ñ”°(€€€€€É•Í½±Ù•‘1…‰½ÉQ½Ñ…°èÉ•Í½±Ù•‘1¥¹•1…‰½È°(€€€€€É•Í½±Ù•‘A…ÉÑÍQ½Ñ…°èÉ•Í½±Ù•‘1¥¹•A…ÉÑÌ°(€€€€€É•Í½±Ù•‘1¥¹•Q½Ñ…°èÉ•Í½±Ù•‘1¥¹•1…‰½È€¬É•Í½±Ù•‘1¥¹•A…ÉÑÌ°(€€€ô¤ì(€ô((€½¹ÍÐÕ¹É•Í½±Ù•‘1…‰½É1¥¹”€ôÁÉ¥•‘1¥¹•Ì¹™¥¹ (€€€€¡±¥¹”¤€ôø±¥¹”¹É•Í½±Ù•‘1…‰½É!½ÕÉÌ€ø€À€˜˜±¥¹”¹É•Í½±Ù•‘1…‰½ÉQ½Ñ…°€ðô€À°(€€¤ì(€¥˜€ …ÕÍ•A•ÉÍ¥ÍÑ•‘%¹Ù½¥•Q½Ñ…±Ì€˜˜Õ¹É•Í½±Ù•‘1…‰½É1¥¹”¤ì(€€€Ñ¡É½Ü¹•ÜÉÉ½È (€€€€€1…‰½ÈÉ…Ñ”¥Ìµ¥ÍÍ¥¹œ™½È€‘íÕ¹É•Í½±Ù•‘1…‰½É1¥¹”¹‘•ÍÉ¥ÁÑ¥½¸ñð±¥¹”€‘íÕ¹É•Í½±Ù•‘1…‰½É1¥¹”¹±¥¹•}¹¼€üü€ˆ‰õ€¹ÑÉ¥´ ¥ô¹€°(€€€€¤ì(€ô((€€¼¼á¥ÍÑ¥¹œ±¥¹”¥Ñ•µÌ…É”…ÕÑ¡½É¥Ñ…Ñ¥Ù”¸Ý½É­}½É‘•ÉÌ¹±…‰½É}Ñ½Ñ…°¡…Ì±•…ä(€€¼¼É½ÝÌÝ¡•É”€Ä¸ÀÉ•ÁÉ•Í•¹ÑÌ±…‰½È¡½ÕÉÌ°¹½Ð€Ä¸ÀÀ°Í¼½¹±äÕÍ”Ñ¡…ÐÉ½±±ÕÀ(€€¼¼Ý¡•¸Ñ¡•É”…É”¹¼¥Ñ•µ¥é•±¥¹•ÌÑ¼ÁÉ¥”¸(€½¹ÍÐ±…‰½É½ÍÐ€ô(€€€¥¹Ù1…‰½È€üü(€€€€¡É•Í½±Ù•‘1…‰½È€ø€À(€€€€€€üÉ•Í½±Ù•‘1…‰½È(€€€€€€èÁÉ¥•‘1¥¹•Ì¹±•¹Ñ €ôôô€À(€€€€€€€€üÝ½1…‰½È(€€€€€€€€è¹Õ±°¤€üü(€€€¹Õ±°ì(€½¹ÍÐÁ…ÉÑÍ½ÍÐ€ô(€€€¥¹ÙA…ÉÑÌ€üü€¡É•Í½±Ù•‘A…ÉÑÌ€ø€À€üÉ•Í½±Ù•‘A…ÉÑÌ€èÝ½A…ÉÑÌ¤€üü¹Õ±°ì((€½¹ÍÐ‰…Í•MÕ‰Ñ½Ñ…°€ô€¡±…‰½É½ÍÐ€üü€À¤€¬€¡Á…ÉÑÍ½ÍÐ€üü€À¤ì(€½¹ÍÐÍ¡½ÁMÕÁÁ±¥•Ì€ô…±Õ±…Ñ•M¡½ÁMÕÁÁ±¥•Ì¡ì(€€€‰…Í•µ½Õ¹Ðè‰…Í•MÕ‰Ñ½Ñ…°°(€€€Í•ÑÑ¥¹ÌèÉ•Í½±Ù•M¡½ÁMÕÁÁ±¥•ÍM•ÑÑ¥¹Ì (€€€€€Í¡½À…ÌA…É…µ•Ñ•ÉÌñÑåÁ•½˜É•Í½±Ù•M¡½ÁMÕÁÁ±¥•ÍM•ÑÑ¥¹ÌùlÁt°(€€€€¤°(€€€½Ù•ÉÉ¥‘”èÉ•Í½±Ù•M¡½ÁMÕÁÁ±¥•Í=Ù•ÉÉ¥‘” (€€€€€Ý½É­=É‘•È…ÌA…É…µ•Ñ•ÉÌñÑåÁ•½˜É•Í½±Ù•M¡½ÁMÕÁÁ±¥•Í=Ù•ÉÉ¥‘”ùlÁt°(€€€€¤°(€ô¤ì(€½¹ÍÐÁ•ÉÍ¥ÍÑ•‘MÕÁÁ±¥•Ì€ô(€€€ÕÍ•A•ÉÍ¥ÍÑ•‘%¹Ù½¥•Q½Ñ…±Ì€˜˜¥¹ÙMÕ‰Ñ½Ñ…°€„ô¹Õ±°(€€€€€€ü€¡¥¹ÙMÕÁÁ±¥•Ì€üü(€€€€€€€5…Ñ ¹µ…à À°¥¹ÙMÕ‰Ñ½Ñ…°€´€¡±…‰½É½ÍÐ€üü€À¤€´€¡Á…ÉÑÍ½ÍÐ€üü€À¤¤¤(€€€€€€è¹Õ±°ì(€½¹ÍÐÍ¡½ÁMÕÁÁ±¥•ÍQ½Ñ…°€ôÕÍ•A•ÉÍ¥ÍÑ•‘%¹Ù½¥•Q½Ñ…±Ì(€€€€üÁ•ÉÍ¥ÍÑ•‘MÕÁÁ±¥•Ì€˜˜Á•ÉÍ¥ÍÑ•‘MÕÁÁ±¥•Ì€ø€À(€€€€€€üÁ•ÉÍ¥ÍÑ•‘MÕÁÁ±¥•Ì(€€€€€€è¹Õ±°(€€€€èÁÉ¥¥¹=Ù•ÉÉ¥‘”ü¹Í¡½Á}ÍÕÁÁ±¥•Í}…µ½Õ¹Ð€„ô¹Õ±°(€€€€€€ü5…Ñ ¹µ…à À°Í…™•9Õµ‰•È¡ÁÉ¥¥¹=Ù•ÉÉ¥‘”¹Í¡½Á}ÍÕÁÁ±¥•Í}…µ½Õ¹Ð¤¤(€€€€€€èÍ¡½ÁMÕÁÁ±¥•Ì¹…µ½Õ¹Ð€ø€À(€€€€€€€€üÍ¡½ÁMÕÁÁ±¥•Ì¹…µ½Õ¹Ð(€€€€€€€€è¹Õ±°ì(€½¹ÍÐ½¹™¥ÕÉ•‘Q…áI…Ñ”€ô5…Ñ ¹µ…à À°Í…™•9Õµ‰•È¡Í¡½Àü¹Ñ…á}É…Ñ”¤¤ì(€½¹ÍÐ…±Õ±…Ñ•€ô…±Õ±…Ñ•%¹Ù½¥•Q½Ñ…±Ì¡ì(€€€±…‰½É½ÍÐè±…‰½É½ÍÐ€üü€À°(€€€Á…ÉÑÍ½ÍÐèÁ…ÉÑÍ½ÍÐ€üü€À°(€€€Í¡½ÁMÕÁÁ±¥•ÍQ½Ñ…°°(€€€‘¥Í½Õ¹ÑQ½Ñ…°è¥¹Ù¥Í½Õ¹Ð°(€€€Ñ…áI…Ñ•A•É•¹Ðè½¹™¥ÕÉ•‘Q…áI…Ñ”°(€ô¤ì(€½¹ÍÐÍÕ‰Ñ½Ñ…°€ôÕÍ•A•ÉÍ¥ÍÑ•‘%¹Ù½¥•Q½Ñ…±Ì(€€€€ü€¡¥¹ÙMÕ‰Ñ½Ñ…°€üü…±Õ±…Ñ•¹ÍÕ‰Ñ½Ñ…°¤(€€€€è…±Õ±…Ñ•¹ÍÕ‰Ñ½Ñ…°€ø€À(€€€€€€ü…±Õ±…Ñ•¹ÍÕ‰Ñ½Ñ…°(€€€€€€è¹Õ±°ì(€½¹ÍÐÑ…áQ½Ñ…°€ôÕÍ•A•ÉÍ¥ÍÑ•‘%¹Ù½¥•Q½Ñ…±Ì€ü¥¹ÙQ…à€è…±Õ±…Ñ•¹Ñ…áQ½Ñ…°ì(€½¹ÍÐÁ•ÉÍ¥ÍÑ•‘Q…á…‰±•	…Í”€ô5…Ñ ¹µ…à ¡ÍÕ‰Ñ½Ñ…°€üü€À¤€´¥¹Ù¥Í½Õ¹Ð°€À¤ì(€½¹ÍÐÑ…áI…Ñ”€ô(€€€ÕÍ•A•ÉÍ¥ÍÑ•‘%¹Ù½¥•Q½Ñ…±Ì€˜˜Á•ÉÍ¥ÍÑ•‘Q…á…‰±•	…Í”€ø€À(€€€€€€ü€¡Ñ…áQ½Ñ…°€¼Á•ÉÍ¥ÍÑ•‘Q…á…‰±•	…Í”¤€¨€ÄÀÀ(€€€€€€è½¹™¥ÕÉ•‘Q…áI…Ñ”ì(€½¹ÍÐ‘•É¥Ù•‘%¹Ù½¥•Q½Ñ…°€ô…±Õ±…Ñ•%¹Ù½¥•Q½Ñ…±Ì¡ì(€€€±…‰½É½ÍÐè±…‰½É½ÍÐ€üü€À°(€€€Á…ÉÑÍ½ÍÐèÁ…ÉÑÍ½ÍÐ€üü€À°(€€€Í¡½ÁMÕÁÁ±¥•ÍQ½Ñ…°°(€€€‘¥Í½Õ¹ÑQ½Ñ…°è¥¹Ù¥Í½Õ¹Ð°(€€€Ñ…áI…Ñ•A•É•¹ÐèÑ…áI…Ñ”°(€ô¤¹Ñ½Ñ…°ì(€½¹ÍÐÑ½Ñ…°€ôÕÍ•A•ÉÍ¥ÍÑ•‘%¹Ù½¥•Q½Ñ…±Ì(€€€€ü€¡¥¹ÙQ½Ñ…°€üü‘•É¥Ù•‘%¹Ù½¥•Q½Ñ…°¤(€€€€è‘•É¥Ù•‘%¹Ù½¥•Q½Ñ…°€ø€À(€€€€€€ü‘•É¥Ù•‘%¹Ù½¥•Q½Ñ…°(€€€€€€èÝ½%¹Ù½¥•Q½Ñ…°ì((€É•ÑÕÉ¸ì(€€€Ý½É­=É‘•È°(€€€¥¹Ù½¥”è¥¹Ù½¥”€üü¹Õ±°°(€€€Í¡½ÀèÍ¡½À€üü¹Õ±°°(€€€ÕÍÑ½µ•ÈèÕÍÑ½µ•È€üü¹Õ±°°(€€€Ù•¡¥±”èÙ•¡¥±”€üü¹Õ±°°(€€€±¥¹•ÌèÁÉ¥•‘1¥¹•Ì°(€€€Á…ÉÑÌ°(€€€ÕÉÉ•¹ä°(€€€±…‰½É½ÍÐ°(€€€Á…ÉÑÍ½ÍÐ°(€€€Í¡½ÁMÕÁÁ±¥•ÍQ½Ñ…°°(€€€ÍÕ‰Ñ½Ñ…°°(€€€‘¥Í½Õ¹ÑQ½Ñ…°è¥¹Ù¥Í½Õ¹Ð€ø€À€ü¥¹Ù¥Í½Õ¹Ð€è¹Õ±°°(€€€Ñ…áQ½Ñ…°èÑ…áQ½Ñ…°€ø€À€üÑ…áQ½Ñ…°€è¹Õ±°°(€€€Ñ…áI…Ñ”èÑ…áI…Ñ”€ø€À€üÑ…áI…Ñ”€è¹Õ±°°(€€€Ñ½Ñ…°°(€ôì)ô