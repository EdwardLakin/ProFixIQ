// lib/supabase/serverClient.ts
import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/types/supabase';

export function createServerClient() {
  return createServerComponentClient<Database>({ cookies });
}