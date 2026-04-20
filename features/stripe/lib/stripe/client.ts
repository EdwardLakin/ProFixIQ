import Stripe from "stripe";

export const STRIPE_API_VERSION = "2024-04-10";

export function createStripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey, {
    apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion,
  });
}
