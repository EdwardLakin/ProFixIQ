'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/types/supabase';

export default function AuthCallbackPage() {
  const router = useRouter();
  const supabase = createClientComponentClient<Database>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkProfile = async () => {
      setLoading(true);

      let {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      // Retry with getSession() if getUser() failed
      if (!user || userError) {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        user = session?.user ?? null;

        if (!user) {
          console.error('User session not found.');
          router.push('/auth');
          return;
        }
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role, full_name, phone, shop_id')
        .eq('id', user.id)
        .single();

      if (profileError || !profile) {
        console.error('Profile error:', profileError?.message);
        router.push('/onboarding');
        return;
      }

      const { role, full_name, phone, shop_id } = profile;

      // Incomplete profile → send to onboarding
      if (!role || !full_name || !phone || !shop_id) {
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
      <div className="flex flex-col items-center">
        <p className="text-orange-400 text-lg mb-2">Signing you in...</p>
        <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    </div>
  );
}