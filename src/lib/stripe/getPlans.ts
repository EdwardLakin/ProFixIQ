import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-04-10' as any,
});

export async function getPlans() {
  const prices = await stripe.prices.list({
    active: true,
    expand: ['data.product'],
  });

  return prices.data
    .filter((price) => price.recurring)
    .map((price) => ({
      id: price.id,
      productName: (price.product as Stripe.Product).name,
      price: (price.unit_amount ?? 0) / 100,
      interval: price.recurring?.interval,
    }));
}