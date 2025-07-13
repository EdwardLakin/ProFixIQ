'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function PlanSelectionPage() {
  const router = useRouter();
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handlePlanSelect = async (plan: string) => {
    setSelectedPlan(plan);
    setLoading(true);

    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;

    if (!userId) {
      alert('User not signed in.');
      return;
    }

    const { error } = await supabase.from('profiles').update({ plan }).eq('id', userId);

    if (error) {
      alert('Failed to save plan.');
      return;
    }

    if (plan === 'pro' || plan === 'pro_plus') {
      router.push('/onboarding/shop');
    } else {
      router.push('/dashboard');
    }
  };

  const plans = [
    {
      name: 'Free',
      key: 'free',
      price: '$0/month',
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
      price: '$9/month',
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
      price: '$49/month',
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
      price: '$99/month',
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
      {/* Home button */}
      <Link
        href="/"
        className="absolute top-4 right-4 bg-orange-500 hover:bg-orange-600 text-white py-1 px-3 rounded text-sm"
      >
        Home
      </Link>

      <h1 className="text-4xl font-blackops text-orange-500 mb-10">Choose Your Plan</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-8 w-full max-w-7xl">
        {plans.map((plan) => (
          <button
            key={plan.key}
            onClick={() => plan.key !== 'free' && handlePlanSelect(plan.key)}
            disabled={loading || plan.key === 'free'}
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