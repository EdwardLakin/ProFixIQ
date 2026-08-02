import type Stripe from "stripe";
import {
  ADDITIONAL_SEAT_LOOKUP_KEY,
  ADDITIONAL_USER_MONTHLY_PRICE,
  BASE_MONTHLY_PRICE,
  BASE_PRICE_LOOKUP_KEY,
  UNLIMITED_MONTHLY_PRICE,
  UNLIMITED_PRICE_LOOKUP_KEY,
} from "@/features/stripe/lib/stripe/billing-model";
import type { PlanKey } from "@/features/stripe/lib/stripe/constants";

export type StripePriceContract = {
  basePriceId: string;
  additionalSeatPriceId: string;
  unlimitedPriceId: string;
};

type ExpectedPrice = {
  lookupKey: string;
  amountCents: number;
  role: "base" | "additional_seat" | "unlimited";
};

const EXPECTED_PRICES: readonly ExpectedPrice[] = [
  {
    lookupKey: BASE_PRICE_LOOKUP_KEY,
    amountCents: BASE_MONTHLY_PRICE * 100,
    role: "base",
  },
  {
    lookupKey: ADDITIONAL_SEAT_LOOKUP_KEY,
    amountCents: ADDITIONAL_USER_MONTHLY_PRICE * 100,
    role: "additional_seat",
  },
  {
    lookupKey: UNLIMITED_PRICE_LOOKUP_KEY,
    amountCents: UNLIMITED_MONTHLY_PRICE * 100,
    role: "unlimited",
  },
] as const;

function validatePrice(price: Stripe.Price, expected: ExpectedPrice): void {
  if (!price.active) {
    throw new Error(`Stripe price ${expected.lookupKey} is inactive`);
  }
  if (price.lookup_key !== expected.lookupKey) {
    throw new Error(`Stripe price lookup mismatch for ${expected.lookupKey}`);
  }
  if (price.currency !== "cad" || price.unit_amount !== expected.amountCents) {
    throw new Error(
      `Stripe price amount mismatch for ${expected.lookupKey}; expected CAD ${expected.amountCents}`,
    );
  }
  if (
    price.type !== "recurring" ||
    price.recurring?.interval !== "month" ||
    price.recurring.interval_count !== 1 ||
    price.recurring.usage_type !== "licensed"
  ) {
    throw new Error(`Stripe price recurrence mismatch for ${expected.lookupKey}`);
  }
  if (
    price.metadata?.app !== "profixiq" ||
    price.metadata?.billing_model !== "base_plus_seats_v2" ||
    price.metadata?.price_role !== expected.role
  ) {
    throw new Error(`Stripe price metadata mismatch for ${expected.lookupKey}`);
  }
}

export async function resolveStripePriceContract(
  stripe: Stripe,
): Promise<StripePriceContract> {
  const lookupKeys = EXPECTED_PRICES.map((price) => price.lookupKey);
  const response = await stripe.prices.list({
    active: true,
    lookup_keys: [...lookupKeys],
    limit: 20,
  });

  const byLookup = new Map<string, Stripe.Price[]>();
  for (const price of response.data) {
    const lookupKey = String(price.lookup_key ?? "").trim();
    if (!lookupKey) continue;
    const matches = byLookup.get(lookupKey) ?? [];
    matches.push(price);
    byLookup.set(lookupKey, matches);
  }

  const resolved = new Map<string, Stripe.Price>();
  for (const expected of EXPECTED_PRICES) {
    const matches = byLookup.get(expected.lookupKey) ?? [];
    if (matches.length !== 1) {
      throw new Error(
        `Expected exactly one active Stripe price for ${expected.lookupKey}; found ${matches.length}`,
      );
    }
    const price = matches[0]!;
    validatePrice(price, expected);
    resolved.set(expected.lookupKey, price);
  }

  return {
    basePriceId: resolved.get(BASE_PRICE_LOOKUP_KEY)!.id,
    additionalSeatPriceId: resolved.get(ADDITIONAL_SEAT_LOOKUP_KEY)!.id,
    unlimitedPriceId: resolved.get(UNLIMITED_PRICE_LOOKUP_KEY)!.id,
  };
}

export async function resolveStripePlanPriceId(
  stripe: Stripe,
  planKey: PlanKey,
): Promise<string> {
  const contract = await resolveStripePriceContract(stripe);
  return planKey === "unlimited"
    ? contract.unlimitedPriceId
    : contract.basePriceId;
}
