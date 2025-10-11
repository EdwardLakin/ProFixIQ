// features/shared/lib/supabase/server.ts
import { cookies } from "next/headers";
import {
  createServerComponentClient,
  createRouteHandlerClient,
  createPagesServerClient,
} from "@supabase/auth-helpers-nextjs";
import { createClient } from "@supabase/supabase-js";
import type { NextApiRequest, NextApiResponse } from "next";
import type { Database } from "@shared/types/types/supabase";

/**
 * App Router – Server Components (RSC)
 */
export function createServerSupabaseRSC() {
  const cookieStore = cookies(); // sync in App Router
  return createServerComponentClient<Database>({ cookies: () => cookieStore });
}

/**
 * App Router – Route Handlers (app/api/*)
 */
export function createServerSupabaseRoute() {
  const cookieStore = cookies();
  return createRouteHandlerClient<Database>({ cookies: () => cookieStore });
}

/**
 * Pages API routes (pages/api/*)
 */
export function createServerSupabaseApi(req: NextApiRequest, res: NextApiResponse) {
  return createPagesServerClient<Database>({ req, res });
}

/**
 * Admin client for server-only tasks (cron, webhooks, workers).
 * Never import this into client bundles.
 */
export function createAdminSupabase() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}