// app/api/stripe/checkout/route.ts
import { NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-04-10' as any,
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { priceId } = body;

    if (!priceId) {
      return NextResponse.json({ error: 'Missing priceId' }, { status: 400 });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `https://ominous-halibut-r4x7gg57grgjc55qr-3000.app.github.dev//onboarding?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `https://ominous-halibut-r4x7gg57grgjc55qr-3000.app.github.dev//subscribe`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('❌ Stripe Checkout Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}