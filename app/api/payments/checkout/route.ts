// app/api/payments/checkout/route.ts

export const runtime = "nodejs";

import { POST as postStripePaymentsCheckout } from "../../stripe/payments/checkout/route";

// Backward-compatible alias for legacy callers.
// Canonical endpoint is /api/stripe/payments/checkout.
export async function POST(req: Request) {
  return postStripePaymentsCheckout(req);
}
