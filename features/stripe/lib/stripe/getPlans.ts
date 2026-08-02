"use server";

import { createStripeClient } from "./client";
import {
  PLAN_LOOKUP_KEYS,
  PLAN_LIMITS,
  type PlanKey,
} from "./constants";

const stripe = createStripeClient(process.env.STRIPE_SECRET_KEY!);

export type StripePlan = {
  key: PlanKey;
  priceId: string;
  amount: number;
  currency: string;
  userLimit: number;
  lookupKey: string;
};

const DISPLAY_ORDER: PlanKey[] = ["starter", "unlimited"];

export async function getStripePlans(): Promise<StripePlan[]> {
  const lookupKeys = DISPLAY_ORDER.map((key) => PLAN_LOOKUP_KEYS[key]);

  const prices = await stripe.prices.list({
    lookup_keys: lookupKeys,
    active: true,
    expand: ["data.product"],
    limit: 20,
  });

  return DISPLAY_ORDER.map((key) => {
    const lookupKey = PLAN_LOOKUP_KEYS[key];
    const price = prices.data.find(
      (candidate) =>
        candidate.lookup_key === lookupKey && candidate.type === "recurring",
    );

    if (!price?.id || typeof price.unit_amount !== "number") {
      throw new Error(`Stripe price not found for ${key} (${lookupKey})`);
    }

    return {
      key,
      lookupKey,
      priceId: price.id,
      amount: price.unit_amount / 100,
      currency: price.currency.toUpperCase(),
      userLimit: PLAN_LIMITS[key],
    };
  });
}
