import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { normalizeSendGridEvent } from "../features/email/server/sendgridWebhook";

async function source(path: string): Promise<string> {
  return readFile(path, "utf8");
}

describe("P0-007 financial outbox delivery", () => {
  it("atomically leases outbox rows and keeps the delivery ledger private", async () => {
    const migration = await source(
      "supabase/migrations/20260725181500_harden_p0_007_financial_outbox_delivery.sql",
    );

    expect(migration).toContain("for update skip locked");
    expect(migration).toContain("unique (outbox_id, recipient_kind)");
    expect(migration).toContain("unique (delivery_key)");
    expect(migration).toContain("force row level security");
    expect(migration).toContain("from public, anon, authenticated, service_role");
    expect(migration).toContain("to service_role");
  });

  it("distinguishes safe pre-send reclaim from ambiguous post-send recovery", async () => {
    const migration = await source(
      "supabase/migrations/20260725181500_harden_p0_007_financial_outbox_delivery.sql",
    );

    expect(migration).toContain("when delivery.status = 'claimed' then 'pending'");
    expect(migration).toContain("else 'ambiguous'");
    expect(migration).toContain("delivery.status in ('claimed', 'sending', 'ambiguous')");
    expect(migration).toContain("provider acknowledgement missing after delivery lease expired");
  });

  it("uses only database claim/complete RPCs for outbox lifecycle changes", async () => {
    const worker = await source("features/invoices/server/processFinancialOutbox.ts");

    expect(worker).toContain('"claim_financial_outbox_batch"');
    expect(worker).toContain('"claim_financial_outbox_delivery"');
    expect(worker).toContain('"begin_financial_outbox_delivery"');
    expect(worker).toContain('"accept_financial_outbox_delivery"');
    expect(worker).toContain('"complete_financial_outbox_claim"');
    expect(worker).not.toContain('.from("financial_domain_outbox")');
    expect(worker).not.toContain("delivered_at: new Date");
  });

  it("does not automatically retry an ambiguous SendGrid request", async () => {
    const worker = await source("features/invoices/server/processFinancialOutbox.ts");

    expect(worker).toContain('claim.delivery_status === "ambiguous"');
    expect(worker).toContain('"mark_financial_outbox_delivery_ambiguous"');
    expect(worker).toContain("SendGrid has no Mail Send idempotency key");
  });

  it("correlates provider events with a non-PII deterministic delivery key", async () => {
    const sender = await source("features/email/server/sendFinancialEventEmail.ts");
    const validKey = "fin_a7000000000040008000000000000002_staff";
    const normalized = normalizeSendGridEvent({
      event: "processed",
      timestamp: 1770000000,
      sg_event_id: "event-p0-007",
      sg_message_id: "message-p0-007",
      financial_delivery_key: validKey,
    });
    const invalid = normalizeSendGridEvent({
      event: "processed",
      financial_delivery_key: "customer@example.com",
    });

    expect(sender).toContain("financial_delivery_key: input.deliveryKey");
    expect(sender).toContain("financial_outbox_id: input.outboxId");
    expect(sender).not.toContain("dedupe_key: String");
    expect(sender).not.toContain("shop_id: input.shopId");
    expect(normalized.financialDeliveryKey).toBe(validKey);
    expect(normalized.safePayload.financial_delivery_key).toBe(validKey);
    expect(invalid.financialDeliveryKey).toBeNull();
    expect(invalid.safePayload.financial_delivery_key).toBeNull();
  });

  it("ships runtime coverage for worker overlap and both crash boundaries", async () => {
    const runtime = await source("tests/security/p0-007-financial-outbox.runtime.sql");

    expect(runtime).toContain("overlapping workers claimed the same row");
    expect(runtime).toContain("crash-after-send delivery was retried");
    expect(runtime).toContain("safe pre-send reclaim did not occur");
    expect(runtime).toContain("completed customer delivery was duplicated");
    expect(runtime).toContain("pending staff delivery was not claimable");
  });
});
