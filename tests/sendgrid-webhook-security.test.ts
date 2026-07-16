import { generateKeyPairSync, createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  normalizeSendGridEvent,
  parseSendGridEvents,
  sanitizeEmailMetadata,
  shouldSuppressEmail,
  verifySendGridWebhookSignature,
} from "@/features/email/server/sendgridWebhook";

describe("SendGrid webhook security", () => {
  it("accepts authentic payloads and rejects tampering", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ec", {
      namedCurve: "prime256v1",
    });
    const rawBody = JSON.stringify([{ event: "delivered", sg_event_id: "event-1" }]);
    const timestamp = "1770000000";
    const signer = createSign("sha256");
    signer.update(timestamp + rawBody, "utf8");
    signer.end();
    const signature = signer.sign(privateKey, "base64");
    const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
    const publicKeyBase64 = publicKeyPem
      .replace("-----BEGIN PUBLIC KEY-----", "")
      .replace("-----END PUBLIC KEY-----", "")
      .replaceAll(/\s/g, "");

    expect(verifySendGridWebhookSignature({ rawBody, timestamp, signature, publicKey: publicKeyPem })).toBe(true);
    expect(verifySendGridWebhookSignature({ rawBody, timestamp, signature, publicKey: publicKeyBase64 })).toBe(true);
    expect(verifySendGridWebhookSignature({ rawBody: `${rawBody} `, timestamp, signature, publicKey: publicKeyPem })).toBe(false);
  });

  it("normalizes provider events without retaining recipient data in payload", () => {
    const [raw] = parseSendGridEvents(JSON.stringify([{
      email: "CUSTOMER@EXAMPLE.COM",
      event: "bounce",
      timestamp: 1770000000,
      sg_event_id: "event-1",
      sg_message_id: "message-1",
      email_log_id: "log-1",
      reason: "Mailbox unavailable",
    }]));
    const event = normalizeSendGridEvent(raw);

    expect(event.email).toBe("customer@example.com");
    expect(event.eventType).toBe("bounce");
    expect(event.safePayload).not.toHaveProperty("email");
    expect(shouldSuppressEmail(event.eventType)).toBe(true);
    expect(shouldSuppressEmail("deferred")).toBe(false);
  });

  it("removes secrets and links from log metadata", () => {
    expect(sanitizeEmailMetadata({
      kind: "portal_invite",
      portal_link: "https://example.com/token",
      resetToken: "secret",
      nested: { magicUrl: "https://example.com/secret", safe: "value" },
      work_order_id: "wo-1",
    })).toEqual({
      kind: "portal_invite",
      nested: { safe: "value" },
      work_order_id: "wo-1",
    });
  });

  it("correlates sends without exposing shop or customer data", () => {
    const sender = readFileSync(
      "features/email/server/sendDynamicTemplateEmail.ts",
      "utf8",
    );
    expect(sender).toContain('status: "accepted"');
    expect(sender).toContain("email_log_id: logRow.id");
    expect(sender).not.toContain("customArgs: {\n        shop_id");
    expect(sender).toContain('.from("email_suppressions")');
  });

  it("ships idempotent event storage and legacy metadata cleanup", () => {
    const migration = readFileSync(
      "supabase/migrations/20260716120000_sendgrid_delivery_events.sql",
      "utf8",
    );
    expect(migration).toContain("unique (provider, provider_event_id)");
    expect(migration).toContain("process_sendgrid_delivery_event");
    expect(migration).toContain("on conflict (provider, provider_event_id) do nothing");
    expect(migration).toContain("- 'portal_link'");
    expect(migration).toContain("revoke all on table public.email_suppressions from anon, authenticated");
  });
});
