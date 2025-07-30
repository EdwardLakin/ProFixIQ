'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/types/supabase';

export default function ConfirmPage() {
  const router = useRouter();
  const supabase = createClientComponentClient<Database>();

  useEffect(() => {
    const checkSessionAndRedirect = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();

      switch (profile?.role) {
        case 'owner':
          router.push('/dashboard/owner');
          break;
        case 'admin':
          router.push('/dashboard/admin');
          break;
        case 'advisor':
          router.push('/dashboard/advisor');
          break;
        case 'manager':
          router.push('/dashboard/manager');
          break;
        case 'parts':
          router.push('/dashboard/parts');
          break;
        case 'mechanic':
        case 'tech':
          router.push('/dashboard/tech');
          break;
        default:
          router.push('/dashboard');
          break;
      }
    };

    checkSessionAndRedirect();
  }, [router, supabase]);

  return (
    <div className="p-10 text-white text-center">
      <h1 className="text-2xl font-bold mb-4">Confirming your account...</h1>
      <p>You’ll be redirected based on your role.</p>
    </div>
  );
}