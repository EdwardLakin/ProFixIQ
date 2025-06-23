import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/types/supabase';
import type { NextRequest, NextResponse } from 'next/server';

export function createSupabaseServerClient(req: NextRequest, res: NextResponse) {
  return createMiddlewareClient<Database>({ req, res });
}