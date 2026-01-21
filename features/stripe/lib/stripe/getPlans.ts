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
  lookupKey: string;
};

const DISPLAY_ORDER: PlanKey[] = ["starter10", "pro50", "unlimited"];

export async function getStripePlans(): Promise<StripePlan[]> {
  const lookupKeys = DISPLAY_ORDER.map((k) => PLAN_LOOKUP_KEYS[k]);

  const prices = await stripe.prices.list({
    lookup_keys: lookupKeys,
    active: true,
    expand: ["data.product"],
    limit: 20,
  });

  return DISPLAY_ORDER.map((key) => {
    const lookupKey = PLAN_LOOKUP_KEYS[key];
    const price = prices.data.find(
      (p) => p.lookup_key === lookupKey && p.type === "recurring",
    );

    if (!price?.id) {
      throw new Error(`Stripe price not found for ${key} (${lookupKey})`);
    }

    return {
      key,
      lookupKey,
      priceId: price.id,
      amount: PLAN_PRICING[key],
      userLimit: PLAN_LIMITS[key],
    };
  });
}