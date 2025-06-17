// lib/queries.ts

import { createBrowserClient } from '@supabase/ssr';
import { Database } from '@/types/supabase';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

// Fallback browser client (safe)
export const supabase = createBrowserClient<Database>();

// Optional wrapper to get user session in client components
export const getCurrentUser = async () => {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  if (error) console.error('Session error:', error);
  return session?.user ?? null;
};