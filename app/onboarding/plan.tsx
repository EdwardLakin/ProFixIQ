'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

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

    const { error } = await supabase
      .from('profiles')
      .update({ plan })
      .eq('id', userId);

    if (error) {
      alert('Failed to save plan.');
      return;
    }

    if (plan === 'pro' || plan === 'pro_plus') {
      router.push('/onboarding/shop');
    } else {
      router.push('/dashboard'); // or '/' depending on your flow
    }
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6">
      <h1 className="text-4xl font-blackops text-orange-500 mb-6">Choose Your Plan</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-5xl">
        {[
          { name: 'DIY', key: 'diy', description: 'Basic access to AI diagnostics.' },
          { name: 'Pro', key: 'pro', description: 'Access inspections, quotes, and work orders.' },
          { name: 'Pro+', key: 'pro_plus', description: 'Full automation and shop settings.' },
        ].map((plan) => (
          <button
            key={plan.key}
            onClick={() => handlePlanSelect(plan.key)}
            disabled={loading}
            className={`border border-orange-500 p-6 rounded-lg bg-neutral-900 hover:bg-neutral-800 transition-all shadow-md ${
              selectedPlan === plan.key ? 'ring-2 ring-orange-500' : ''
            }`}
          >
            <h2 className="text-2xl font-blackops text-orange-400 mb-2">{plan.name}</h2>
            <p className="text-neutral-300">{plan.description}</p>
          </button>
        ))}
      </div>
    </div>
  );
}