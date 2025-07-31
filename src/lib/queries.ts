// src/lib/queries.ts

import supabase from './supabaseClient';
import type { Database } from '@/types/supabase';

// Optional wrapper to get user session in client component
export const getCurrentUser = async () => {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) console.error('Session error:', error);
  return session?.user ?? null;
};