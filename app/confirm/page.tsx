// app/confirm/page.tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import createClient from '@lib/supabaseClient';

export default function ConfirmPage() {
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const checkSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session) {
        router.push('/'); // or /dashboard if you prefer
      } else {
        // Optionally ask them to sign in again
        router.push('/sign-in');
      }
    };

    checkSession();
  }, [router]);

  return (
    <div className="text-center py-20">
      <h1 className="text-2xl font-bold">Confirming your email...</h1>
      <p className="text-sm text-neutral-400">Please wait while we redirect you.</p>
    </div>
  );
}