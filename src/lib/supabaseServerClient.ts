// src/lib/supabaseServerClient.ts
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/types/supabase';

export function createServerClient() {
  return createClientComponentClient<Database>();
}