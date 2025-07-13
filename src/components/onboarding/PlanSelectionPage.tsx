'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import { loadStripe } from '@stripe/stripe-js';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

const plans = [
  {
    name: 'DIY',
    key: 'diy',
    price: '$9/month',
    description: 'For home users and DIYers',
    priceId: 'price_1RkIKMITYwJQigUIxJhU8DIQ',
    features: ['Basic AI diagnosis', 'Limited inspections', 'Photo upload & tagging', '1 saved vehicle', 'Email support only'],
  },
  {
    name: 'Pro',
    key: 'pro',
    price: '$49/month',
    description: 'Best for solo professionals',
    priceId: 'price_1RkIL8ITYwJQigUIJ7G1nc4u',
    features: ['All DIY features', 'Unlimited inspections', 'Work order creation', 'Voice-controlled inspections', '1 user license', 'Quote builder and PDF export'],
  },
  {
    name: 'Pro+',
    key: 'pro_plus',
    price: '$99/month',
    description: 'Full access for shops & teams',
    priceId: 'price_1RkIIcITYwJQigUITIPXJzpU',
    features: ['All Pro features', 'Up to 5 users included', 'Admin, manager, mechanic roles', 'Shop setup and job board', 'Deferred work tracking', 'Priority support'],
  },
];

export default function PlanSelectionPage() {
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  const handleSubscribe = async (priceId: string) => {
    setLoadingPlan(priceId);

    const res = await fetch('/api/create-checkout-session', {
      method: 'POST',
      body: JSON.stringify({ priceId }),
    });

    const { sessionId } = await res.json();

    const stripe = await stripePromise;
    await stripe?.redirectToCheckout({ sessionId });
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6">
      <h1 className="text-4xl font-blackops text-orange-500 mb-10">Choose Your Plan</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8 w-full max-w-7xl">
        {plans.map((plan) => (
          <div
            key={plan.key}
            className="border border-orange-500 p-8 rounded-2xl bg-neutral-900 hover:bg-neutral-800 transition-all shadow-xl text-left flex flex-col justify-between"
          >
            <div>
              <h2 className="text-3xl font-blackops text-orange-400 mb-1">{plan.name}</h2>
              <p className="text-sm text-gray-400 mb-4">{plan.description}</p>
              <p className="text-2xl font-bold text-orange-500 mb-6">{plan.price}</p>

              <ul className="text-sm space-y-2 text-gray-300 mb-6">
                {plan.features.map((feature, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-orange-400">✓</span> {feature}
                  </li>
                ))}
              </ul>
            </div>

            <button
              onClick={() => handleSubscribe(plan.priceId)}
              disabled={loadingPlan === plan.priceId}
              className="mt-auto bg-orange-500 hover:bg-orange-600 text-black font-bold py-2 px-4 rounded"
            >
              {loadingPlan === plan.priceId ? 'Redirecting...' : 'Subscribe'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}