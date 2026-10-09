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

// Formats with Intl directly (no pre-rounding) so the amount matches how the
// customer portal renders the same total, including half-cent totals.
export function formatUsd(value: string | number | null | undefined): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) return "";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

export function quoteReadyContent(input: {
  quoteUrl: string;
  totalLabel: string;
  vehicleLabel?: string | null;
  shopName?: string | null;
  brandLogoUrl?: string | null;
  brandPrimaryColor?: string | null;
  year?: number;
}) {
  const shopName = input.shopName?.trim() || "ProFixIQ";
  const vehicle = input.vehicleLabel?.trim() || "";
  const primary = safeColor(input.brandPrimaryColor, "#2f7d67");
  const year = input.year ?? new Date().getFullYear();
  const totalSuffix = input.totalLabel ? ` – ${input.totalLabel}` : "";
  const subject = (
    vehicle
      ? `Your estimate for your ${vehicle} is ready${totalSuffix}`
      : `Your estimate from ${shopName} is ready${totalSuffix}`
  ).replace(/[\r\n]+/g, " ");
  const preheader = `Review and approve the recommended work${totalSuffix}.`;
  const safeShop = escapeHtml(shopName);
  const safeVehicle = escapeHtml(vehicle);
  const safeUrl = escapeHtml(input.quoteUrl);
  const safeTotal = escapeHtml(input.totalLabel);
  const logoUrl = input.brandLogoUrl?.trim() ?? "";
  const logo = /^https:\/\//i.test(logoUrl) ? escapeHtml(logoUrl) : "";

  const text = [
    `${shopName} – your estimate is ready`,
    "",
    vehicle
      ? `Review and approve the recommended work for your ${vehicle}.`
      : "Review and approve the recommended work.",
    ...(input.totalLabel ? [`Estimate total: ${input.totalLabel}`] : []),
    "",
    `Review your quote: ${input.quoteUrl}`,
    "",
    `Sent by ${shopName} with ProFixIQ. © ${year}`,
  ].join("\n");

  // Light card on a light page with explicit colors everywhere: nothing here
  // depends on gradients or on a client's dark-mode inversion heuristics.
  const logoBlock = logo
    ? `<img src="${logo}" alt="${safeShop}" width="72" height="72" style="display:block;border:0;width:72px;height:72px;object-fit:contain">`
    : `<div style="font-size:18px;font-weight:700;color:#0f172a">${safeShop}</div>`;
  const vehicleBlock = safeVehicle
    ? ` for your <strong style="color:#0f172a">${safeVehicle}</strong>`
    : "";
  const totalBlock = safeTotal
    ? `<tr><td style="padding:22px 28px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f8fafc" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:12px"><tr><td align="center" style="padding:18px"><div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#64748b">Estimate total</div><div style="margin-top:6px;font-size:32px;font-weight:700;color:#0f172a">${safeTotal}</div></td></tr></table></td></tr>`
    : "";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"><title>${escapeHtml(subject)}</title></head><body style="margin:0;padding:0;background-color:#f1f5f9;color:#0f172a;font-family:Arial,Helvetica,sans-serif"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f1f5f9">${escapeHtml(preheader)}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f1f5f9" style="background-color:#f1f5f9"><tr><td align="center" style="padding:28px 12px"><table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width:100%;max-width:560px;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:16px"><tr><td bgcolor="${primary}" style="background-color:${primary};height:6px;line-height:6px;font-size:0;border-radius:16px 16px 0 0">&nbsp;</td></tr><tr><td align="center" style="padding:28px 28px 8px">${logoBlock}</td></tr><tr><td align="center" style="padding:8px 28px 0"><div style="font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:${primary}">Quote ready</div><h1 style="margin:10px 0 0;font-size:26px;line-height:1.25;color:#0f172a">Your estimate is ready</h1><p style="margin:12px 0 0;font-size:15px;line-height:1.6;color:#334155">Review and approve the recommended work${vehicleBlock}.</p></td></tr>${totalBlock}<tr><td align="center" style="padding:26px 28px 8px"><a href="${safeUrl}" style="display:inline-block;padding:14px 32px;border-radius:10px;background-color:${primary};color:#ffffff;font-size:14px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;text-decoration:none">Review quote</a></td></tr><tr><td align="center" style="padding:8px 28px 0"><p style="margin:0;font-size:13px;line-height:1.6;color:#64748b">Approvals, line items, and recommendations are available in your portal.</p></td></tr><tr><td align="center" style="padding:22px 28px 26px"><p style="margin:0;padding-top:18px;border-top:1px solid #e2e8f0;font-size:11px;line-height:1.6;color:#94a3b8">Sent by ${safeShop} with ProFixIQ<br>&copy; ${year} ${safeShop}</p></td></tr></table></td></tr></table></body></html>`;

  return { subject, text, html };
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
  customerPortalInviteId?: string | null;
  customerPortalInviteAttemptId?: string | null;
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
      ...(input.customerPortalInviteId
        ? { customer_portal_invite_id: input.customerPortalInviteId }
        : {}),
      ...(input.customerPortalInviteAttemptId
        ? { customer_portal_invite_attempt_id: input.customerPortalInviteAttemptId }
        : {}),
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
  const totalLabel = formatUsd(input.quoteTotal);
  const content = quoteReadyContent({
    quoteUrl: input.quoteUrl,
    totalLabel,
    vehicleLabel: input.vehicleLabel,
    shopName: input.shopName,
    brandLogoUrl: input.brandLogoUrl,
    brandPrimaryColor: input.brandPrimaryColor,
    year: input.year,
  });
  return sendDynamicTemplateEmail({
    shopId: input.shopId,
    templateKey: "quote_ready",
    to: input.to,
    createdBy: input.createdBy,
    subject: content.subject,
    content,
    fromName: process.env.SENDGRID_FROM_NAME?.trim() || null,
    // Keep the portal link direct instead of a sendgrid.net redirect.
    disableClickTracking: true,
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
      quote_total: totalLabel,
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
