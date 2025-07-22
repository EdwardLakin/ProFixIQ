import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-04-10' as any,
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const PRICE_IDS = {
  diy: {
    monthly: 'price_1RkIKMITYwJQigUIxJhU8DIQ',
    yearly: 'price_1RkIO6ITYwJQigUIJCE2PsZX',
  },
  pro: {
    monthly: 'price_1RkIL8ITYwJQigUIJ7G1nc4u',
    yearly: 'price_1RkIMyITYwJQigUIFZekjN68',
  },
  pro_plus: {
    monthly: 'price_1RkIIcITYwJQigUITIPXJzpU',
    yearly: 'price_1RkINaITYwJQigUIH6KZAoBm',
  },
};

export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature')!;
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET!;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, sig, endpointSecret);
  } catch (err) {
    console.error('Webhook signature verification failed.', err);
    return NextResponse.json({ error: 'Webhook Error' }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.supabaseUserId;

    if (userId && session.mode === 'subscription' && session.subscription) {
      try {
        const subscription = await stripe.subscriptions.retrieve(
          session.subscription as string
        );

        const planId = subscription.items.data[0]?.price.id ?? '';
        let plan = 'unknown';

        for (const [key, values] of Object.entries(PRICE_IDS)) {
          if (Object.values(values).includes(planId)) {
            plan = key;
            break;
          }
        }

        await supabase.from('profiles').update({ plan }).eq('id', userId);
      } catch (err) {
        console.error('❌ Failed to update plan:', err);
      }
    }
  }

  return NextResponse.json({ received: true });
}