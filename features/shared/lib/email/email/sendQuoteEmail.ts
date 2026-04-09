import { createClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { sendQuoteReadyEmail } from "@/features/email/server";
import { getActiveBrandForRender } from "@/features/branding/server/getActiveBrandForRender";

type DB = Database;
type WorkOrderRow = DB["public"]["Tables"]["work_orders"]["Row"];
type CustomerRow = DB["public"]["Tables"]["customers"]["Row"];
type VehicleRow = DB["public"]["Tables"]["vehicles"]["Row"];
type ShopRow = DB["public"]["Tables"]["shops"]["Row"];

const supabase = createClient<DB>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export type QuoteEmailLine = {
  description: string;
  amount?: number | null;
};

export type QuoteVehicleInfo = {
  year?: string | number | null;
  make?: string | null;
  model?: string | null;
  [key: string]: unknown;
};

export type SendQuoteEmailParams = {
  to: string;
  workOrderId: string;
  quoteTotal?: number | null;
  pdfUrl?: string | null;
  customerName?: string | null;
  shopName?: string | null;
  lines?: QuoteEmailLine[];
  vehicleInfo?: QuoteVehicleInfo | null;
};

function safeStr(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function buildVehicleLabel(vehicleInfo?: QuoteVehicleInfo | null): string {
  if (!vehicleInfo) return "";
  const year =
    vehicleInfo.year != null ? String(vehicleInfo.year).trim() : "";
  const make = safeStr(vehicleInfo.make).trim();
  const model = safeStr(vehicleInfo.model).trim();
  return [year, make, model].filter(Boolean).join(" ");
}

function buildCustomerName(customer: {
  first_name?: string | null;
  last_name?: string | null;
  business_name?: string | null;
} | null): string {
  if (!customer) return "";
  if (customer.business_name) return customer.business_name;
  return `${customer.first_name ?? ""} ${customer.last_name ?? ""}`.trim();
}

export async function sendQuoteEmail(
  params: SendQuoteEmailParams,
): Promise<void> {
  const {
    to,
    workOrderId,
    quoteTotal,
    pdfUrl,
    customerName,
    shopName,
    vehicleInfo,
  } = params;

  const { data: wo, error: woErr } = await supabase
    .from("work_orders")
    .select("id, shop_id, customer_id, vehicle_id, quote_url")
    .eq("id", workOrderId)
    .maybeSingle<
      Pick<
        WorkOrderRow,
        "id" | "shop_id" | "customer_id" | "vehicle_id" | "quote_url"
      >
    >();

  if (woErr || !wo) {
    throw new Error(
      woErr?.message ?? "[sendQuoteEmail] Failed to load work order",
    );
  }

  if (!wo.shop_id) {
    throw new Error("[sendQuoteEmail] Work order is missing shop_id");
  }

  let resolvedShopName = shopName ?? "";
  if (wo.shop_id && !resolvedShopName) {
    const { data: shop } = await supabase
      .from("shops")
      .select("name, shop_name")
      .eq("id", wo.shop_id)
      .maybeSingle<Pick<ShopRow, "name" | "shop_name">>();

    resolvedShopName =
      safeStr(shop?.shop_name).trim() ||
      safeStr(shop?.name).trim() ||
      "";
  }

  let resolvedCustomerName = customerName ?? "";
  let portalUserId: string | null = null;
  let portalCustomerId: string | null = null;

  if (wo.customer_id) {
    const { data: customer, error: custErr } = await supabase
      .from("customers")
      .select("id, user_id, first_name, last_name, business_name")
      .eq("id", wo.customer_id)
      .maybeSingle<
        Pick<
          CustomerRow,
          "id" | "user_id" | "first_name" | "last_name" | "business_name"
        >
      >();

    if (!custErr && customer) {
      portalCustomerId = customer.id;
      portalUserId = customer.user_id ?? null;

      if (!resolvedCustomerName) {
        resolvedCustomerName = buildCustomerName(customer);
      }
    }
  }

  const brand = await getActiveBrandForRender(wo.shop_id);

  let resolvedVehicleInfo = vehicleInfo ?? null;
  if (!resolvedVehicleInfo && wo.vehicle_id) {
    const { data: vehicle } = await supabase
      .from("vehicles")
      .select("year, make, model")
      .eq("id", wo.vehicle_id)
      .maybeSingle<Pick<VehicleRow, "year" | "make" | "model">>();

    if (vehicle) {
      resolvedVehicleInfo = {
        year: vehicle.year ?? null,
        make: vehicle.make ?? null,
        model: vehicle.model ?? null,
      };
    }
  }

  const appUrlEnv =
    process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
  const normalizedAppUrl = appUrlEnv ? appUrlEnv.replace(/\/$/, "") : "";
  const portalQuoteUrl = normalizedAppUrl
    ? `${normalizedAppUrl}/portal/quotes/${workOrderId}`
    : null;

  const quoteUrl = portalQuoteUrl ?? pdfUrl ?? wo.quote_url ?? "";

  await sendQuoteReadyEmail({
    shopId: wo.shop_id,
    to,
    quoteUrl,
    quoteTotal: quoteTotal ?? null,
    vehicleLabel: buildVehicleLabel(resolvedVehicleInfo),
    shopName: resolvedShopName || undefined,
    brandLogoUrl: brand?.logoUrl ?? null,
    brandPrimaryColor: brand?.colors.primary ?? null,
    brandSecondaryColor: brand?.colors.secondary ?? null,
  });

  if (quoteUrl && quoteUrl !== wo.quote_url) {
    const { error: woUpdateErr } = await supabase
      .from("work_orders")
      .update({ quote_url: quoteUrl })
      .eq("id", workOrderId);

    if (woUpdateErr) {
      console.error(
        "[sendQuoteEmail] Failed to update work order quote_url:",
        woUpdateErr,
      );
    }
  }

  if (portalUserId) {
    const { error: notifErr } = await supabase
      .from("portal_notifications")
      .insert({
        user_id: portalUserId,
        customer_id: portalCustomerId,
        work_order_id: workOrderId,
        kind: "quote_ready",
        title: "Quote ready",
        body: `Your quote for Work Order ${workOrderId} at ${
          resolvedShopName || "the shop"
        } is ready to review in your portal.`,
      });

    if (notifErr) {
      console.error(
        "[sendQuoteEmail] Failed to insert portal quote notification:",
        notifErr,
      );
    }
  }

  void resolvedCustomerName;
}
