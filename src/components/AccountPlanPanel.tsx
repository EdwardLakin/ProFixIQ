'use client';

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Database } from '@/types/supabase';

export default function AccountPlanPanel() {
  const [plan, setPlan] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const fetchUserPlan = async () => {
      const supabase = createBrowserClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        setEmail(user.email);

        const { data, error } = await supabase
          .from('user_plans')
          .select('plan')
          .eq('user_id', user.id)
          .single();

        if (!error && data?.plan) {
          setPlan(data.plan);
        }
      }
    };

    fetchUserPlan();
  }, []);

  return (
    <div className="bg-surface text-accent p-6 rounded-md shadow-card mb-8">
      <h2 className="text-lg font-semibold">Account & Plan</h2>
      <div className="text-sm text-muted mt-2">
        Logged in as: {email || 'Loading...'}
      </div>
      <div className="mt-2">
        <span className="font-medium">Current Plan: </span>
        <span className="font-semibold">{plan || 'Loading...'}</span>
      </div>
      <button
        className="mt-4 px-4 py-2 rounded bg-accent text-white hover:bg-accent/90 transition"
        onClick={() => (window.location.href = '/account')}
      >
        Manage Account
      </button>
    </div>
  );
}