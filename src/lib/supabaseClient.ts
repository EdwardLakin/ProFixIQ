import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@custom-types/supabase';

export const supabase = createBrowserClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default supabase;