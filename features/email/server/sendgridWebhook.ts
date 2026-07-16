import { createVerify } from "node:crypto";

export type SendGridEvent = {
  email?: unknown;
  event?: unknown;
  timestamp?: unknown;
  sg_event_id?: unknown;
  sg_message_id?: unknown;
  email_log_id?: unknown;
  reason?: unknown;
  response?: unknown;
  status?: unknown;
  attempt?: unknown;
  type?: unknown;
};

const MAX_WEBHOOK_BYTES = 1_000_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cleanString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function verifySendGridWebhookSignature(input: {
  rawBody: string;
  timestamp: string;
  signature: string;
  publicKey: string;
}): boolean {
  if (Buffer.byteLength(input.rawBody, "utf8") > MAX_WEBHOOK_BYTES) return false;

  try {
    const trimmedKey = input.publicKey.trim();
    const publicKey = trimmedKey.includes("BEGIN PUBLIC KEY")
      ? trimmedKey
      : `-----BEGIN PUBLIC KEY-----\n${trimmedKey.match(/.{1,64}/g)?.join("\n") ?? trimmedKey}\n-----END PUBLIC KEY-----`;
    const verifier = createVerify("sha256");
    verifier.update(input.timestamp + input.rawBody, "utf8");
    verifier.end();
    return verifier.verify(publicKey, input.signature, "base64");
  } catch {
    return false;
  }
}

export function parseSendGridEvents(rawBody: string): SendGridEvent[] {
  if (Buffer.byteLength(rawBody, "utf8") > MAX_WEBHOOK_BYTES) {
    throw new Error("Webhook payload is too large");
  }

  const parsed = JSON.parse(rawBody) as unknown;
  if (!Array.isArray(parsed)) throw new Error("Webhook payload must be an array");
  return parsed.filter(
    (event): event is SendGridEvent => typeof event === "object" && event !== null,
  );
}

export function normalizeSendGridEvent(event: SendGridEvent) {
  const eventType = cleanString(event.event)?.toLowerCase() ?? "unknown";
  const timestamp = Number(event.timestamp);
  const eventAt = Number.isFinite(timestamp) && timestamp > 0
    ? new Date(timestamp * 1000).toISOString()
    : new Date().toISOString();

  return {
    eventType,
    eventAt,
    providerEventId: cleanString(event.sg_event_id),
    providerMessageId: cleanString(event.sg_message_id),
    emailLogId: UUID_RE.test(cleanString(event.email_log_id) ?? "")
      ? cleanString(event.email_log_id)
      : null,
    email: cleanString(event.email)?.toLowerCase() ?? null,
    errorText:
      cleanString(event.reason) ??
      cleanString(event.response) ??
      cleanString(event.status),
    safePayload: {
      reason: cleanString(event.reason),
      response: cleanString(event.response),
      status: cleanString(event.status),
      attempt: typeof event.attempt === "number" ? event.attempt : null,
      type: cleanString(event.type),
    },
  };
}

export function shouldSuppressEmail(eventType: string): boolean {
  return eventType === "bounce" || eventType === "spamreport" || eventType === "unsubscribe";
}

export function sanitizeEmailMetadata(
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  const blocked = /(password|secret|token|magic|link|url|authorization|cookie)/i;

  const sanitizeValue = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(sanitizeValue);
    if (typeof value !== "object" || value === null) return value;
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !blocked.test(key))
        .map(([key, child]) => [key, sanitizeValue(child)]),
    );
  };

  return sanitizeValue(metadata) as Record<string, unknown>;
}
