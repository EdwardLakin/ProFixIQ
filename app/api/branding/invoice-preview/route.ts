export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireBrandShopReadAccess } from "@/features/branding/server/brand";
import { getActiveBrandForRender } from "@/features/branding/server/getActiveBrandForRender";
import type { InvoiceSnapshot } from "@/features/invoices/server/getInvoiceSnapshot";
import { renderPremiumInvoicePdf } from "@/features/invoices/server/renderPremiumInvoicePdf";

export async function GET() {
  const auth = await requireBrandShopReadAccess(null);
  if (!auth.ok)
    return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { data: shop, error } = await auth.supabase
    .from("shops")
    .select(
      "business_name,shop_name,name,country,phone_number,email,street,city,province,postal_code,labor_rate,supplies_percent,shop_supplies_enabled,shop_supplies_type,shop_supplies_percent,shop_supplies_flat_amount,shop_supplies_cap_amount,tax_rate,logo_url,invoice_terms,invoice_footer",
    )
    .eq("id", auth.shopId)
    .single();
  if (error || !shop)
    return NextResponse.json(
      { error: error?.message ?? "Shop not found" },
      { status: 404 },
    );

  const brand = await getActiveBrandForRender(auth.shopId);
  const snapshot: InvoiceSnapshot = {
    workOrder: {
      id: "00000000-0000-0000-0000-000000000001",
      shop_id: auth.shopId,
      customer_id: null,
      vehicle_id: null,
      customer_name: "Sample Customer",
      custom_id: "WO-PREVIEW",
      status: "ready_to_invoice",
      labor_total: 210,
      parts_total: 184.5,
      invoice_total: 414.23,
      shop_supplies_enabled_override: null,
      shop_supplies_amount_override: null,
      created_at: new Date().toISOString(),
    },
    invoice: null,
    shop,
    customer: {
      name: "Jordan Taylor",
      first_name: "Jordan",
      last_name: "Taylor",
      phone: null,
      phone_number: "(555) 014-2020",
      email: "jordan@example.com",
      business_name: null,
      street: "125 Customer Way",
      city: shop.city,
      province: shop.province,
      postal_code: shop.postal_code,
    },
    vehicle: {
      year: 2023,
      make: "Ford",
      model: "F-150",
      vin: "1FTFW1E80PFA12345",
      license_plate: "SHOP-01",
      unit_number: "TRK-12",
      mileage: "48210",
      color: "Blue",
      engine_hours: null,
    },
    lines: [
      {
        id: "preview-line",
        line_no: 1,
        description: "Scheduled maintenance service",
        complaint: "Customer requested scheduled maintenance.",
        cause: "Service interval reached.",
        correction:
          "Completed inspection, oil service, and filter replacement.",
        labor_time: 1.5,
        price_estimate: null,
        intake_json: null,
        resolvedLaborHours: 1.5,
        resolvedLaborRate: 140,
        resolvedLaborTotal: 210,
        resolvedPartsTotal: 184.5,
        resolvedLineTotal: 394.5,
      },
    ],
    parts: [
      {
        id: "preview-part-1",
        lineId: "preview-line",
        name: "Premium oil filter",
        qty: 1,
        unitPrice: 42.5,
        totalPrice: 42.5,
        partNumber: "OF-2023",
      },
      {
        id: "preview-part-2",
        lineId: "preview-line",
        name: "Synthetic engine oil",
        qty: 6,
        unitPrice: 23.67,
        totalPrice: 142.02,
        partNumber: "5W30",
      },
    ],
    currency: String(shop.country).toUpperCase() === "CA" ? "CAD" : "USD",
    laborCost: 210,
    partsCost: 184.52,
    shopSuppliesTotal: 0,
    subtotal: 394.52,
    discountTotal: 0,
    taxTotal: 19.73,
    taxRate: 5,
    total: 414.25,
  };

  const bytes = await renderPremiumInvoicePdf({
    snapshot,
    brand,
    document: {
      status: "draft",
      draft: true,
      outstandingTotal: snapshot.total,
    },
  });
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": "inline; filename=Invoice_Design_Preview.pdf",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
