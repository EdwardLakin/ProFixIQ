// app/api/stripe/link-user/route.ts
import { NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-04-10' as any,
});

export async function POST(req: Request) {
  try {
    const { sessionId, userId } = await req.json();

    if (!sessionId || !userId) {
      return NextResponse.json({ error: 'Missing sessionId or userId' }, { status: 400 });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (!session.customer) {
      return NextResponse.json({ error: 'No customer found' }, { status: 404 });
    }

    await stripe.customers.update(session.customer.toString(), {
      metadata: { supabaseUserId: userId },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('❌ Stripe Link User Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}