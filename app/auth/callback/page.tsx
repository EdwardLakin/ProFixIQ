'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/types/supabase';

export default function AuthCallback() {
  const supabase = createClientComponentClient<Database>();
  const router = useRouter();

  useEffect(() => {
    const handleAuth = async () => {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.user) {
        console.error('Error getting session:', sessionError?.message);
        router.push('/sign-in');
        return;
      }

      const { user } = session;

      // Check if profile exists
      const { data: profile, error: fetchError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') {
        console.error('Error fetching profile:', fetchError.message);
        return;
      }

      if (!profile) {
        // First-time login: create basic profile row
        const { error: insertError } = await supabase.from('profiles').insert({
          id: user.id,
          email: user.email,
          full_name: user.user_metadata?.full_name || '',
          role: null,
          phone: null,
          plan: 'free',
          shop_id: null,
          shop_name: null,
          business_name: null,
        });

        if (insertError) {
          console.error('Insert profile error:', insertError.message);
          return;
        }

        router.push('/onboarding/profile');
        return;
      }

      // If profile exists but is incomplete, redirect to onboarding
      if (!profile.role || !profile.shop_name) {
        router.push('/onboarding/profile');
        return;
      }

      // Profile complete — go to app
      router.push('/app');
    };

    handleAuth();
  }, [supabase, router]);

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center font-blackops text-orange-500 text-xl">
      Signing you in...
    </div>
  );
}