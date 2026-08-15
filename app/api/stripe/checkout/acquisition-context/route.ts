export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { handleStripeAcquisitionContext } from "@/features/stripe/api/stripe/checkout/acquisition-context/route";

export async function GET(req: Request) {
  return handleStripeAcquisitionContext(req);
}
