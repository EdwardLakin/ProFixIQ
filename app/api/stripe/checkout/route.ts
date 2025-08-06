import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { PRICE_IDS } from '@lib/stripe/constants';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-04-10' as Stripe.LatestApiVersion,
});

interface CheckoutRequest {
  planKey: keyof typeof PRICE_IDS;
  interval?: 'monthly' | 'yearly';
  isAddon?: boolean;
  shopId?: string;
}

export async function POST(req: Request) {
  let body: CheckoutRequest;

  try {
    body = await req.json();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid JSON';
    console.error('❌ Failed to parse request body:', message);
    return NextResponse.json({ error: 'Invalid request format' }, { status: 400 });
  }

  const {
    planKey,
    interval = 'monthly',
    isAddon = false,
    shopId,
  } = body;

  if (!planKey || !interval) {
    console.error('❌ Missing required fields:', { planKey, interval });
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const priceId = PRICE_IDS[planKey]?.[interval];
  if (!priceId) {
    console.error('❌ Invalid price ID:', { planKey, interval });
    return NextResponse.json({ error: 'Invalid price ID' }, { status: 400 });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_creation: 'always',
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      metadata: {
        plan_key: planKey,
        interval,
        is_addon: isAddon ? 'true' : 'false',
        ...(shopId && { shop_id: shopId }),
      },
      success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/sign-up?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/subscribe`,
    });

    console.log('✅ Stripe Checkout session created:', session.id);

    return NextResponse.json({ url: session.url });
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : typeof err === 'object' && err !== null && 'toString' in err
        ? (err as { toString(): string }).toString()
        : 'Unknown error';

    console.error('❌ Stripe session creation failed:', message, err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}