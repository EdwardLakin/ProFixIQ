import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import { NextRequest, NextResponse } from 'next/server';
import { Database } from '@/types/supabase'; // use your actual DB types or `any` if none

export function createServerSupabaseClient(req: NextRequest, res: NextResponse) {
  return createMiddlewareClient<Database>({ req, res });
}