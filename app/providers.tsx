'use client';

import { SessionContextProvider } from '@supabase/auth-helpers-react';
import { useState } from 'react';
import supabase from '@lib/supabaseClient';

export default function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => supabase);

  return (
    <SessionContextProvider supabaseClient={client}>
      {children}
    </SessionContextProvider>
  );
}