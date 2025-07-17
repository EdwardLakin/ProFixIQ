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

      // Check if user exists in profiles table
      const { data: existingProfile, error: fetchError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') {
        console.error('Fetch profile error:', fetchError.message);
        return;
      }

      if (!existingProfile) {
        // First-time user — insert into profiles
        const { error: insertError } = await supabase.from('profiles').insert({
          id: user.id,
          email: user.email,
          full_name: user.user_metadata?.full_name || user.email,
        });

        if (insertError) {
          console.error('Insert profile error:', insertError.message);
          return;
        }

        // Redirect to onboarding if just signed up
        router.push('/onboarding');
      } else {
        // Already exists — go to home or dashboard
        router.push('/');
      }
    };

    handleAuth();
  }, [supabase, router]);

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center font-blackops text-orange-500 text-xl">
      Signing you in...
    </div>
  );
}