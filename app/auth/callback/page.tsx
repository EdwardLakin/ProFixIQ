'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/types/supabase';

export default function AuthCallbackPage() {
  const router = useRouter();
  const supabase = createClientComponentClient<Database>();

  useEffect(() => {
    const checkProfile = async () => {
      const {
        data: { user },
        error: sessionError,
      } = await supabase.auth.getUser();

      if (sessionError || !user) {
        console.error('Session error:', sessionError?.message);
        router.push('/auth');
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role, full_name, phone')
        .eq('id', user.id)
        .single();

      if (profileError) {
        console.error('Profile error:', profileError.message);
        router.push('/onboarding');
        return;
      }

      const { role, full_name, phone } = profile;

      // Incomplete profile → send to onboarding
      if (!role || !full_name || !phone) {
        router.push('/onboarding');
        return;
      }

      // Redirect based on role
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

    checkProfile();
  }, [router, supabase]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-white font-blackops">
      <p className="text-orange-400">Signing you in...</p>
    </div>
  );
}