'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function withAuthAndPlan(
  Component: React.FC,
  allowedPlans: string[] = ['Pro', 'Elite']
) {
  return function ProtectedPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [unauthorized, setUnauthorized] = useState(false);

    useEffect(() => {
      const checkAuth = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.push('/sign-in');
          return;
        }

        const { data: profile, error } = await supabase
          .from('profiles')
          .select('plan')
          .eq('id', user.id)
          .single();

        if (error || !allowedPlans.includes(profile?.plan)) {
          setUnauthorized(true);
        }

        setLoading(false);
      };

      checkAuth();
    }, [router]);

    if (loading) return <div className="text-white p-6">Loading...</div>;
    if (unauthorized)
      return (
        <div className="text-red-500 p-6 text-xl">
          Access Denied: Upgrade your plan to continue.
        </div>
      );

    return <Component />;
  };
}