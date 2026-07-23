import { afterEach, describe, expect, it } from "vitest";
import { handleStripeWebhook } from "../features/stripe/api/stripe/webhook/route";

const originalEnv = {
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

function restoreEnv() {
  process.env.STRIPE_WEBHOOK_SECRET = originalEnv.STRIPE_WEBHOOK_SECRET;
  process.env.STRIPE_SECRET_KEY = originalEnv.STRIPE_SECRET_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = originalEnv.NEXT_PUBLIC_SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = originalEnv.SUPABASE_SERVICE_ROLE_KEY;
}

afterEach(() => {
  restoreEnv();
});

describe("stripe webhook hardening", () => {
  it("fails loudly when webhook secret is missing", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = "";
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";

    const req = new Request("http://localhost/api/stripe/webhook", { method: "POST", body: "{}" });
    const res = await handleStripeWebhook(req);
    const json = (await res.json()) as { error?: string };

    expect(res.status).toBe(500);
    expect(json.error).toBe("Missing Stripe webhook configuration");
  });

  it("fails loudly when stripe signature header is missing", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_123";
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";

    const req = new Request("http://localhost/api/stripe/webhook", { method: "POST", body: "{}" });
    const res = await handleStripeWebhook(req);
    const json = (await res.json()) as { error?: string };

    expect(res.status).toBe(400);
    expect(json.error).toBe("Missing Stripe signature");
  });
});
