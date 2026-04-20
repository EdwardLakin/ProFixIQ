export const runtime = "nodejs";

import { handleStripeWebhook } from "@/features/stripe/api/stripe/webhook/route";

// Backward-compatible alias for legacy endpoint configuration.
// Canonical endpoint is /api/stripe/webhook.
export async function POST(req: Request) {
  return handleStripeWebhook(req);
}
