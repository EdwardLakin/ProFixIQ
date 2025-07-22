import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-04-10' as any,
});

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET!;

  let event: Stripe.Event;

  try {
    const body = await req.text();
    const sig = req.headers.get('stripe-signature');

    if (!sig) {
      console.error('❌ Missing Stripe signature');
      return NextResponse.json({ error: 'Missing Stripe signature' }, { status: 400 });
    }

    event = stripe.webhooks.constructEvent(body, sig, endpointSecret);
  } catch (err: any) {
    console.error('❌ Webhook verification failed:', err.message);
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.supabaseUserId;

      console.log('✅ Checkout completed. Metadata user:', userId);

      if (userId) {
        const { error } = await supabase
          .from('profiles')
          .update({ stripe_checkout_complete: true }) // change to whatever flag you use
          .eq('id', userId);

        if (error) {
          console.error('❌ Supabase update error:', error.message);
        } else {
          console.log('✅ Supabase profile updated');
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error('❌ Webhook handler error:', err.message);
    return NextResponse.json({ error: 'Webhook handler failure' }, { status: 500 });
  }
}