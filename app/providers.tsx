'use client';

import { SessionContextProvider } from '@supabase/auth-helpers-react';
import  supabase  from '@lib/supabaseClient';

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionContextProvider supabaseClient={supabase}>
      {children}
    </SessionContextProvider>
  );
}