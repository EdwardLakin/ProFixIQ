import type { EmailTemplateKey } from "./templateIds";

function cleanSubject(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 255);
  return cleaned || null;
}

export function resolveEmailSubject(
  templateKey: EmailTemplateKey,
  dynamicTemplateData: Record<string, unknown> = {},
  explicitSubject?: string | null,
): string {
  const shopName =
    cleanSubject(dynamicTemplateData.shop_name) ??
    cleanSubject(dynamicTemplateData.shopName) ??
    "ProFixIQ";
  const fleetName =
    cleanSubject(dynamicTemplateData.fleet_name) ??
    cleanSubject(dynamicTemplateData.fleetName);

  const fallbackByTemplate: Record<EmailTemplateKey, string> = {
    portal_invite:
      dynamicTemplateData.portal_type === "fleet" && fleetName
        ? "Your " + fleetName + " Fleet invitation"
        : "Your " + shopName + " customer portal invitation",
    quote_ready: "Your estimate from " + shopName + " is ready",
    invoice_ready: "Your invoice from " + shopName + " is ready",
    user_invite: "You're invited to join " + shopName + " on ProFixIQ",
  };

  return (
    cleanSubject(explicitSubject) ??
    cleanSubject(fallbackByTemplate[templateKey]) ??
    "A message from ProFixIQ"
  );
}
