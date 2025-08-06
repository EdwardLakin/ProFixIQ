import { NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-04-10' as Stripe.LatestApiVersion,
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { sessionId, userId } = body as {
      sessionId?: string;
      userId?: string;
    };

    console.log('📩 Received request to link user:', { sessionId, userId });

    if (!sessionId || !userId) {
      console.warn('⚠️ Missing sessionId or userId in request body');
      return NextResponse.json({ error: 'Missing sessionId or userId' }, { status: 400 });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (!session || !session.customer) {
      console.error('❌ No Stripe customer found in session:', sessionId);
      return NextResponse.json({ error: 'No customer found in session' }, { status: 404 });
    }

    const updated = await stripe.customers.update(session.customer.toString(), {
      metadata: { supabaseUserId: userId },
    });

    console.log('✅ Successfully linked Stripe customer to userId:', {
      customerId: updated.id,
      userId,
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('❌ Stripe Link User Error:', message);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}