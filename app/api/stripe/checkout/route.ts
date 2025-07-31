import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { PRICE_IDS } from '@lib/stripe/constants';
import type { Database } from '@/types/supabase';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-04-10' as any,
});

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  const {
    email,
    planKey,
    interval = 'monthly',
    isAddon = false,
    shopId,
  }: {
    email: string;
    planKey: keyof typeof PRICE_IDS;
    interval?: 'monthly' | 'yearly';
    isAddon?: boolean;
    shopId?: string;
  } = await req.json();

  if (!email || !planKey || !interval) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const priceId = PRICE_IDS[planKey]?.[interval];
  if (!priceId) {
    return NextResponse.json({ error: 'Invalid price ID' }, { status: 400 });
  }

  const { data: user } = await supabase
    .from('users')
    .select('id')
    .eq('email', email)
    .single();

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer_email: email,
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
      ...(user?.id && { supabaseUserId: user.id }),
    },
    success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/onboarding?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/subscribe`,
  });

  return NextResponse.json({ url: session.url });
}