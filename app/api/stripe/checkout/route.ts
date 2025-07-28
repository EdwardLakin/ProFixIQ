// app/api/stripe/checkout/route.ts
import { NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-04-10' as any,
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { priceId, email } = body;

    if (!priceId || !email) {
      return NextResponse.json({ error: 'Missing priceId or email' }, { status: 400 });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer_email: email,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      metadata: {
        email,
      },
      success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/onboarding?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/subscribe`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('❌ Stripe Checkout Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}