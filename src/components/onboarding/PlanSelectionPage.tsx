'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/types/supabase';
import { PRICE_IDS } from '@lib/stripe/constants';

export default function PlanSelectionPage() {
  const supabase = createClientComponentClient<Database>();
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isYearly, setIsYearly] = useState(false);
  const router = useRouter();

  const saveSelectedPlan = async (plan: 'free' | 'diy' | 'pro' | 'pro_plus') => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('profiles').update({ plan }).eq('id', user.id);
  };

  const handleCheckout = async (plan: string) => {
    setSelectedPlan(plan);
    setLoading(true);

    await saveSelectedPlan(plan as 'free' | 'diy' | 'pro' | 'pro_plus');

    const priceId = isYearly
      ? PRICE_IDS[plan as keyof typeof PRICE_IDS]?.yearly
      : PRICE_IDS[plan as keyof typeof PRICE_IDS]?.monthly;

    if (!priceId) {
      alert('Invalid plan selected');
      setLoading(false);
      return;
    }

    const res = await fetch('/api/stripe/checkout', {
      method: 'POST',
      body: JSON.stringify({
        planKey: plan,
        interval: isYearly ? 'yearly' : 'monthly',
        email: (await supabase.auth.getUser()).data.user?.email,
      }),
    });

    const { url } = await res.json();

    if (url) {
      window.location.href = url;
    } else {
      alert('Failed to redirect to checkout');
    }

    setLoading(false);
  };

  const plans = [
    {
      name: 'Free',
      key: 'free',
      price: '$0',
      description: 'Get started with AI diagnosis tools',
      features: [
        'Limited AI diagnosis (5/month)',
        'No inspections or work orders',
        'Photo-to-quote disabled',
        '1 vehicle stored',
        'No shop or team features',
      ],
    },
    {
      name: 'DIY',
      key: 'diy',
      price: isYearly ? '$90/year' : '$9/month',
      description: 'For home users and DIYers',
      features: [
        'Basic AI diagnosis',
        'Limited inspections',
        'Photo upload & tagging',
        '1 saved vehicle',
        'Email support only',
      ],
    },
    {
      name: 'Pro',
      key: 'pro',
      price: isYearly ? '$490/year' : '$49/month',
      description: 'Best for solo professionals',
      features: [
        'All DIY features',
        'Unlimited inspections',
        'Work order creation',
        'Voice-controlled inspections',
        '1 user license',
        'Quote builder and PDF export',
      ],
    },
    {
      name: 'Pro+',
      key: 'pro_plus',
      price: isYearly ? '$990/year' : '$99/month',
      description: 'Full access for shops & teams',
      features: [
        'All Pro features',
        'Up to 5 users included',
        'Admin, manager, mechanic roles',
        'Shop setup and job board',
        'Deferred work tracking',
        'Priority support',
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 relative">
      <Link
        href="/"
        className="absolute top-4 right-4 bg-orange-500 hover:bg-orange-600 text-white py-1 px-3 rounded text-sm"
      >
        Home
      </Link>

      <h1 className="text-4xl font-blackops text-orange-500 mb-4">Choose Your Plan</h1>

      <div className="flex items-center gap-4 mb-8">
        <span className="text-sm text-gray-300">Billing:</span>
        <button
          onClick={() => setIsYearly(false)}
          className={`px-4 py-1 rounded ${
            !isYearly ? 'bg-orange-500 text-white' : 'bg-neutral-700 text-gray-300'
          }`}
        >
          Monthly
        </button>
        <button
          onClick={() => setIsYearly(true)}
          className={`px-4 py-1 rounded ${
            isYearly ? 'bg-orange-500 text-white' : 'bg-neutral-700 text-gray-300'
          }`}
        >
          Yearly
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-8 w-full max-w-7xl">
        {plans.map((plan) => (
          <button
            key={plan.key}
            onClick={async () => {
              if (plan.key === 'free') {
                await saveSelectedPlan('free');
                router.push('/onboarding/profile');
              } else {
                handleCheckout(plan.key);
              }
            }}
            disabled={loading}
            className={`border border-orange-500 p-8 rounded-2xl bg-neutral-900 hover:bg-neutral-800 transition-all shadow-xl text-left h-full flex flex-col justify-between ${
              selectedPlan === plan.key ? 'ring-4 ring-orange-500' : ''
            }`}
          >
            <div>
              <h2 className="text-3xl font-blackops text-orange-400 mb-1">{plan.name}</h2>
              <p className="text-sm text-gray-400 mb-4">{plan.description}</p>
              <p className="text-2xl font-bold text-orange-500 mb-6">{plan.price}</p>

              <ul className="text-sm space-y-2 text-gray-300">
                {plan.features.map((feature, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-orange-400">✓</span> {feature}
                  </li>
                ))}
              </ul>
            </div>

            {plan.key === 'free' && (
              <div className="text-xs text-center text-gray-400 mt-4 italic">
                Upgrade in settings to unlock more features
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}