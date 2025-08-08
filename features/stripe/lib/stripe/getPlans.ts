import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-04-10" as Stripe.LatestApiVersion,
});

export async function getPlans() {
  try {
    console.log("📦 Fetching active Stripe plans...");

    const prices = await stripe.prices.list({
      active: true,
      expand: ["data.product"],
    });

    const plans = prices.data
      .filter((price) => price.recurring)
      .map((price) => {
        const product = price.product as Stripe.Product;

        return {
          id: price.id,
          productName: product?.name || "Unnamed Product",
          price: (price.unit_amount ?? 0) / 100,
          interval: price.recurring?.interval,
        };
      });

    console.log(`✅ Retrieved ${plans.length} plans`);
    return plans;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("❌ Error fetching Stripe plans:", message);
    throw new Error(`Failed to fetch plans: ${message}`);
  }
}
