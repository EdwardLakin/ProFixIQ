import type { Json } from "@shared/types/types/supabase";
import { sendDynamicTemplateEmail } from "./sendDynamicTemplateEmail";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeColor(value: string | null | undefined, fallback: string) {
  const candidate = value?.trim() ?? "";
  return /^#[0-9a-f]{6}$/i.test(candidate) ? candidate : fallback;
}

function fleetInviteContent(input: {
  portalLink: string;
  shopName?: string | null;
  fleetName?: string | null;
  fleetRole?: string | null;
  brandPrimaryColor?: string | null;
  brandSecondaryColor?: string | null;
  year?: number;
}) {
  const fleetName = input.fleetName?.trim() || "your fleet";
  const shopName = input.shopName?.trim() || "ProFixIQ";
  const role =
    input.fleetRole === "manager"
      ? "Fleet manager"
      : input.fleetRole === "approver"
        ? "Approver / dispatcher"
        : "Viewer / driver";
  const subject = `Your ${fleetName} Fleet invitation`.replace(/[\r\n]+/g, " ");
  const primary = safeColor(input.brandPrimaryColor, "#c86a32");
  const secondary = safeColor(input.brandSecondaryColor, "#0f172a");
  const safeFleetName = escapeHtml(fleetName);
  const safeShopName = escapeHtml(shopName);
  const safeRole = escapeHtml(role);
  const safePortalLink = escapeHtml(input.portalLink);
  const year = input.year ?? new Date().getFullYear();

  return {
    subject,
    text: [
      "ProFixIQ Fleet",
      "",
      `You have been invited to ${fleetName}.`,
      `Access level: ${role}`,
      "",
      "Activate your secure Fleet account:",
      input.portalLink,
      "",
      "This one-time link expires automatically. If you did not expect this invitation, you can safely ignore it.",
      "",
      `Sent by ${shopName} with ProFixIQ Fleet.`,
    ].join("\n"),
    html: `<!doctype html><html lang="en"><body style="margin:0;background:#020617;color:#e2e8f0;font-family:Arial,sans-serif"><div style="padding:32px 12px"><div style="max-width:560px;margin:0 auto;overflow:hidden;border:1px solid #334155;border-radius:20px;background:#0f172a"><div style="height:6px;background:linear-gradient(90deg,${primary},${secondary})"></div><div style="padding:30px"><div style="font-size:12px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:${primary}">ProFixIQ Fleet</div><h1 style="margin:14px 0 0;color:#fff;font-size:28px;line-height:1.2">Activate your Fleet access</h1><p style="margin:16px 0 0;color:#cbd5e1;font-size:15px;line-height:1.65">You have been invited to <strong style="color:#fff">${safeFleetName}</strong>.</p><div style="margin:22px 0;padding:16px;border:1px solid #334155;border-radius:12px;background:#111c30"><div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#94a3b8">Access level</div><div style="margin-top:6px;color:#fff;font-weight:700">${safeRole}</div></div><p style="margin:24px 0"><a href="${safePortalLink}" style="display:inline-block;padding:14px 20px;border-radius:10px;background:${primary};color:#fff;font-weight:700;text-decoration:none">Activate Fleet account</a></p><p style="margin:20px 0 0;color:#94a3b8;font-size:12px;line-height:1.6">This secure link is single-use and expires automatically. If you did not expect this invitation, you can safely ignore it.</p><div style="margin-top:26px;padding-top:20px;border-top:1px solid #334155;color:#64748b;font-size:11px;line-height:1.6">Sent by ${safeShopName} with ProFixIQ Fleet.<br>&copy; ${year} ProFixIQ</div></div></div></div></body></html>`,
  };
}

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
  const fleetContent =
    input.portalType === "fleet" ? fleetInviteContent(input) : null;
  return sendDynamicTemplateEmail({
    shopId: input.shopId,
    templateKey: "portal_invite",
    to: input.to,
    createdBy: input.createdBy,
    subject: fleetContent?.subject ?? null,
    content: fleetContent,
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
  idempotencyKey?: string | null;
  workOrderId?: string | null;
  estimateRevision?: number | null;
}) {
  return sendDynamicTemplateEmail({
    shopId: input.shopId,
    templateKey: "quote_ready",
    to: input.to,
    createdBy: input.createdBy,
    metadata: {
      kind: "quote_ready",
      ...(input.idempotencyKey
        ? {
            estimate_send_key: input.idempotencyKey,
            work_order_id: input.workOrderId ?? null,
            estimate_revision: input.estimateRevision ?? null,
          }
        : {}),
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
