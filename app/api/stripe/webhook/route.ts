export const runtime = "nodejs";

import { handleStripeWebhook } from "@/features/stripe/api/stripe/webhook/route";

export async function POST(req: Request) {
  return handleStripeWebhook(req);
}
