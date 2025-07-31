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
      const isAddon = session.metadata?.is_addon === 'true';
      const shopId = session.metadata?.shop_id;

      console.log('✅ Checkout completed');
      console.log('Metadata:', session.metadata);

      // If this is an add-on purchase, increment shop.user_limit directly
      if (isAddon && shopId) {
        const { data: shop, error: fetchError } = await supabase
          .from('shops')
          .select('user_limit')
          .eq('id', shopId)
          .single();

        if (fetchError || !shop) {
          console.error('❌ Failed to fetch shop:', fetchError?.message);
        } else {
          const newLimit = (shop.user_limit ?? 0) + 5;
          const { error: updateError } = await supabase
            .from('shops')
            .update({ user_limit: newLimit })
            .eq('id', shopId);

          if (updateError) {
            console.error('❌ Failed to update user_limit:', updateError.message);
          } else {
            console.log(`✅ user_limit updated to ${newLimit}`);
          }
        }
      }

      // Update the profile to mark Stripe complete
      if (userId) {
        const { error } = await supabase
          .from('profiles')
          .update({ stripe_checkout_complete: true })
          .eq('id', userId);

        if (error) {
          console.error('❌ Supabase profile update error:', error.message);
        } else {
          console.log('✅ Supabase profile marked complete');
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error('❌ Webhook handler error:', err.message);
    return NextResponse.json({ error: 'Webhook handler failure' }, { status: 500 });
  }
}