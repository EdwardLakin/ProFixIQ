// lib/supabaseClient.ts
'use client';

import { createPagesBrowserClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/types/supabase';

export const supabase = createPagesBrowserClient<Database>();

export default supabase;