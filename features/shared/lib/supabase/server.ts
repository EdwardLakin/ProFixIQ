// Server-side Supabase helpers
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import type { NextApiRequest, NextApiResponse } from 'next';
import { serialize } from 'cookie';
import type { Database } from '@shared/types/types/supabase';

/**
 * For App Router server components / route handlers (uses next/headers cookies())
 */
export function createServerSupabaseRSC() {
  // import inline to avoid "headers not available" errors in non-RSC files
  const { cookies } = require('next/headers');
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies }
  );
}

/**
 * For Pages API routes (req/res) – keeps the session via Set-Cookie headers.
 */
export function createServerSupabaseApi(req: NextApiRequest, res: NextApiResponse) {
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => req.cookies[name],
        set: (name: string, value: string, options: any) => {
          res.setHeader(
            'Set-Cookie',
            serialize(name, value, { path: '/', httpOnly: true, ...options })
          );
        },
        remove: (name: string, options: any) => {
          res.setHeader(
            'Set-Cookie',
            serialize(name, '', { path: '/', httpOnly: true, maxAge: 0, ...options })
          );
        },
      },
    }
  );
}

/**
 * Admin client (server-only tasks, webhooks, cron). NEVER ship this to the browser.
 */
export function createAdminSupabase() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}