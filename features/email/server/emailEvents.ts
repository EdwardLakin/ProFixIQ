import type { Json } from "@shared/types/types/supabase";
import { sendDynamicTemplateEmail } from "./sendDynamicTemplateEmail";

export async function sendPortalInviteEmail(input: {
  shopId: string;
  to: string;
  portalLink: string;
  shopName?: string | null;
  brandLogoUrl?: string | null;
  brandPrimaryColor?: string | null;
  brandSecondaryColor?: string | null;
  year?: number;
  createdBy?: string | null;
  portalType?: "customer" | "fleet";
  fleetName?: string | null;
  fleetRole?: string | null;
}) {
  return sendDynamicTemplateEmail({
    shopId: input.shopId,
    templateKey: "portal_invite",
    to: input.to,
    createdBy: input.createdBy,
    metadata: {
      kind: "portal_invite",
      portal_type: input.portalType ?? "customer",
    } as Json,
    dynamicTemplateData: {
      portal_link: input.portalLink,
      shop_name: input.shopName ?? "",
      brand_logo_url: input.brandLogoUrl ?? "",
      brand_primary_color: input.brandPrimaryColor ?? "",
      brand_secondary_color: input.brandSecondaryColor ?? "",
      year: input.year ?? new Date().getFullYear(),
      portal_type: input.portalType ?? "customer",
      fleet_name: input.fleetName ?? "",
      fleet_role: input.fleetRole ?? "",
    },
  });
}

export async function sendQuoteReadyEmail(input: {
  shopId: string;
  to: string;
  quoteUrl: string;
  quoteTotal?: string | number | null;
  vehicleLabel?: string | null;
  shopName?: string | null;
  brandLogoUrl?: string | null;
  brandPrimaryColor?: string | null;
  brandSecondaryColor?: string | null;
  year?: number;
  createdBy?: string | null;
}) {
  return sendDynamicTemplateEmail({
    shopId: input.shopId,
    templateKey: "quote_ready",
    to: input.to,
    createdBy: input.createdBy,
    metadata: {
      kind: "quote_ready",
    } as Json,
    dynamicTemplateData: {
      quote_url: input.quoteUrl,
      quote_total: input.quoteTotal ?? "",
      vehicle_label: input.vehicleLabel ?? "",
      shop_name: input.shopName ?? "",
      brand_logo_url: input.brandLogoUrl ?? "",
      brand_primary_color: input.brandPrimaryColor ?? "",
      brand_secondary_color: input.brandSecondaryColor ?? "",
      year: input.year ?? new Date().getFullYear(),
    },
  });
}

export async function sendInvoiceReadyEmail(input: {
  shopId: string;
  to: string;
  portalUrl: string;
  workOrderId: string;
  invoiceTotal?: number | null;
  laborTotal?: number | null;
  partsTotal?: number | null;
  customerName?: string | null;
  shopName?: string | null;
  brandLogoUrl?: string | null;
  brandPrimaryColor?: string | null;
  brandSecondaryColor?: string | null;
  year?: number;
  createdBy?: string | null;
}) {
  return sendDynamicTemplateEmail({
    shopId: input.shopId,
    templateKey: "invoice_ready",
    to: input.to,
    createdBy: input.createdBy,
    metadata: {
      kind: "invoice_ready",
      work_order_id: input.workOrderId,
    } as Json,
    dynamicTemplateData: {
      portalUrl: input.portalUrl,
      portal_url: input.portalUrl,
      workOrderId: input.workOrderId,
      invoiceTotal: input.invoiceTotal ?? "",
      laborTotal: input.laborTotal ?? "",
      partsTotal: input.partsTotal ?? "",
      customerName: input.customerName ?? "",
      shopName: input.shopName ?? "",
      brand_logo_url: input.brandLogoUrl ?? "",
      brand_primary_color: input.brandPrimaryColor ?? "",
      brand_secondary_color: input.brandSecondaryColor ?? "",
      year: input.year ?? new Date().getFullYear(),
    },
  });
}

export async function sendUserInviteEmail(input: {
  shopId: string;
  to: string;
  loginUrl: string;
  username: string;
  tempPassword?: string | null;
  role?: string | null;
  shopName?: string | null;
  inviterName?: string | null;
  fullName?: string | null;
  supportEmail?: string | null;
  resend?: boolean;
  year?: number;
  createdBy?: string | null;
}) {
  return sendDynamicTemplateEmail({
    shopId: input.shopId,
    templateKey: "user_invite",
    to: input.to,
    createdBy: input.createdBy,
    metadata: {
      kind: "user_invite",
      resend: input.resend ?? false,
    } as Json,
    dynamicTemplateData: {
      login_url: input.loginUrl,
      username: input.username,
      temp_password: input.tempPassword ?? null,
      role: input.role ?? "",
      shop_id: input.shopId,
      shop_name: input.shopName ?? "",
      inviter_name: input.inviterName ?? "",
      full_name: input.fullName ?? "",
      brand_name: "ProFixIQ",
      support_email: input.supportEmail ?? "support@profixiq.com",
      resend: input.resend ?? false,
      year: input.year ?? new Date().getFullYear(),
    },
  });
}
