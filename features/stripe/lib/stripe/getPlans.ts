// features/stripe/lib/stripe/getPlans.ts
"use server";

import Stripe from "stripe";
import {
  PLAN_LOOKUP_KEYS,
  PLAN_LIMITS,
  PLAN_PRICING,
  type PlanKey,
} from "./constants";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-04-10" as Stripe.LatestApiVersion,
});

export type StripePlan = {
  key: PlanKey;
  priceId: string;
  amount: number;
  userLimit: number;
};

export async function getStripePlans(): Promise<StripePlan[]> {
  const prices = await stripe.prices.list({
    lookup_keys: Object.values(PLAN_LOOKUP_KEYS),
    active: true,
    expand: ["data.product"],
    limit: 10,
  });

  return (Object.keys(PLAN_LOOKUP_KEYS) as PlanKey[]).map((key) => {
    const lookupKey = PLAN_LOOKUP_KEYS[key];
    const price = prices.data.find(
      (p) => p.lookup_key === lookupKey && p.type === "recurring",
    );

    if (!price?.id) {
      throw new Error(`Stripe price not found for ${key}`);
    }

    return {
      key,
      priceId: price.id,
      amount: PLAN_PRICING[key],
      userLimit: PLAN_LIMITS[key],
    };
  });
}