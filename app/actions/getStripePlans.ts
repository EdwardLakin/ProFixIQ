'use server';

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-04-10' as Stripe.LatestApiVersion,
});

export async function getStripePlans() {
  const prices = await stripe.prices.list({
    expand: ['data.product'],
    active: true,
    limit: 100,
  });

  const plans = prices.data
    .filter((price) => price.type === 'recurring')
    .map((price) => {
      const productName =
        typeof price.product === 'object' && 'name' in price.product
          ? price.product.name
          : 'Unnamed Product';

      const features =
        typeof price.product === 'object' &&
        'metadata' in price.product &&
        price.product.metadata?.features
          ? price.product.metadata.features.split('|')
          : [];

      return {
        id: price.id,
        nickname: price.nickname || '',
        amount: (price.unit_amount || 0) / 100,
        interval: price.recurring?.interval || 'month',
        productName,
        features,
      };
    });

  return plans;
}