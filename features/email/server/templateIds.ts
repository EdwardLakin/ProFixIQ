export type EmailTemplateKey =
  | "portal_invite"
  | "quote_ready"
  | "invoice_ready"
  | "user_invite";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

export function getTemplateId(templateKey: EmailTemplateKey): string {
  switch (templateKey) {
    case "portal_invite":
      return requiredEnv("SENDGRID_PORTAL_INVITE_TEMPLATE_ID");
    case "quote_ready":
      return requiredEnv("SENDGRID_QUOTE_TEMPLATE_ID");
    case "invoice_ready":
      return requiredEnv("SENDGRID_INVOICE_TEMPLATE_ID");
    case "user_invite":
      return requiredEnv("SENDGRID_USER_INVITE_TEMPLATE_ID");
    default: {
      const exhaustive: never = templateKey;
      throw new Error(`Unhandled template key: ${String(exhaustive)}`);
    }
  }
}
