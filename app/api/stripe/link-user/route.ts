export const runtime = "nodejs";

import { handleStripeCheckoutLinkUser } from "@/features/stripe/api/stripe/checkout/link-user/route";

export async function POST(req: Request) {
  return handleStripeCheckoutLinkUser(req);
}
