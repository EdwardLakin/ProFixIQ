import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import {
  ADDITIONAL_USER_MONTHLY_PRICE,
  BASE_MONTHLY_PRICE,
  INCLUDED_USERS,
  UNLIMITED_MONTHLY_PRICE,
  UNLIMITED_USER_THRESHOLD,
  calculateMonthlySubscriptionPrice,
  getAdditionalSeatQuantity,
} from "../features/stripe/lib/stripe/billing-model";

const SEAT_RECONCILER =
  "features/stripe/lib/server/subscription-seat-reconciliation.ts";
const CHECKOUT = "app/api/stripe/checkout/route.ts";
const CRON = "app/api/internal/stripe/reconcile-pending-billing/route.ts";

describe("ProFixIQ base plus seats billing contract", () => {
  it("matches the agreed monthly commercial model", () => {
    expect(BASE_MONTHLY_PRICE).toBe(299);
    expect(INCLUDED_USERS).toBe(10);
    expect(ADDITIONAL_USER_MONTHLY_PRICE).toBe(50);
    expect(UNLIMITED_MONTHLY_PRICE).toBe(600);
    expect(UNLIMITED_USER_THRESHOLD).toBe(17);
    expect(getAdditionalSeatQuantity(16)).toBe(6);
    expect(calculateMonthlySubscriptionPrice(16)).toBe(599);
    expect(calculateMonthlySubscriptionPrice(17)).toBe(600);
  });

  it("invoices increases immediately and avoids retroactive credits on decreases", async () => {
    const source = await readFile(SEAT_RECONCILER, "utf8");
    expect(source).toContain('"always_invoice"');
    expect(source).toContain('"none"');
    expect(source).toContain("estimatedMonthlyPrice > currentMonthlyPrice");
    expect(source).toContain("shouldUseUnlimitedPrice(activeUsers)");
    expect(source).toContain("stripe_billing_sync_required: false");
  });

  it("does not expose legacy capped plans to new checkout", async () => {
    const source = await readFile(CHECKOUT, "utf8");
    expect(source).toContain('planKey: z.enum(["starter", "unlimited"])');
    expect(source).not.toContain('"pro", "unlimited"');
    expect(source).not.toContain("STRIPE_FOUNDING_COUPON_ID");
    expect(source).not.toContain("payment_method_types");
  });

  it("reconciles pending seat changes on a protected worker", async () => {
    const source = await readFile(CRON, "utf8");
    expect(source).toContain('eq("stripe_billing_sync_required", true)');
    expect(source).toContain("reconcileShopSubscriptionSeats");
    expect(source).toContain("CRON_SECRET");
  });
});
