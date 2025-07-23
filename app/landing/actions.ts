'use server';

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-04-10' as any,
});

export async function fetchPlans() {
  try {
    const prices = await stripe.prices.list({
      active: true,
      expand: ['data.product'],
      limit: 100,
    });

    return prices.data
      .filter((price) => price.unit_amount && price.nickname)
      .map((price) => ({
        id: price.id,
        nickname: price.nickname!,
        unit_amount: price.unit_amount!,
        interval: price.recurring?.interval || 'month',
      }));
  } catch (err) {
    console.error('❌ Error loading Stripe prices:', err);
    return [];
  }
}