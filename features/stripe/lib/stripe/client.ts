import Stripe from "stripe";

/**
 * Keep the SDK request version aligned with the live webhook endpoints while
 * the repository completes its Stripe SDK upgrade. Do not introduce route-local
 * Stripe versions.
 */
export const STRIPE_API_VERSION = "2025-04-30.basil";

export function createStripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey, {
    apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion,
  });
}
