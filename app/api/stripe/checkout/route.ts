// app/api/stripe/checkout/route.ts

import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { PRICE_IDS } from '@lib/stripe/constants';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-04-10' as Stripe.LatestApiVersion,
});

export async function POST(req: Request) {
  const body = await req.json();
  const {
    planKey,
    interval = 'monthly',
    isAddon = false,
    shopId,
  }: {
    planKey: keyof typeof PRICE_IDS;
    interval?: 'monthly' | 'yearly';
    isAddon?: boolean;
    shopId?: string;
  } = body;

  if (!planKey || !interval) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const priceId = PRICE_IDS[planKey]?.[interval];
  if (!priceId) {
    return NextResponse.json({ error: 'Invalid price ID' }, { status: 400 });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_creation: 'always', // ⚠️ Collect email & create customer
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

    return NextResponse.json({ url: session.url });
  } catch (err: unknown) {
    console.error('❌ Stripe session error:', err);
    return NextResponse.json({ error: 'Stripe session creation failed' }, { status: 500 });
  }
}