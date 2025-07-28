'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/types/supabase';

export default function AuthCallbackPage() {
  const router = useRouter();
  const supabase = createClientComponentClient<Database>();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const handleCallback = async () => {
      setLoading(true);

      // Get the 'code' from the query string
      const authCode = searchParams.get('code');
      if (!authCode) {
        console.error('Missing auth code in URL.');
        router.push('/auth');
        return;
      }

      // Exchange the code for a session
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(authCode);
      if (exchangeError) {
        console.error('Session exchange failed:', exchangeError.message);
        router.push('/auth');
        return;
      }

      // Fetch the user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        console.error('User fetch failed:', userError?.message);
        router.push('/auth');
        return;
      }

      // Check for existing profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role, full_name, phone, shop_id')
        .eq('id', user.id)
        .single();

      if (profileError || !profile) {
        router.push('/onboarding');
        return;
      }

      const { role, full_name, phone, shop_id } = profile;

      // Incomplete → Onboarding
      if (!role || !full_name || !phone || !shop_id) {
        router.push('/onboarding');
        return;
      }

      // Redirect to dashboard by role
      switch (role) {
        case 'owner':
          router.push('/dashboard/owner');
          break;
        case 'admin':
          router.push('/dashboard/admin');
          break;
        case 'manager':
          router.push('/dashboard/manager');
          break;
        case 'advisor':
          router.push('/dashboard/advisor');
          break;
        case 'mechanic':
          router.push('/dashboard/tech');
          break;
        default:
          router.push('/');
      }
    };

    handleCallback();
  }, [router, supabase, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-white font-blackops">
      <div className="flex flex-col items-center">
        <p className="text-orange-400 text-lg mb-2">Signing you in...</p>
        <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    </div>
  );
}