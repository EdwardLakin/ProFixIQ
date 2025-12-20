// features/shared/lib/supabase/server.ts
import "server-only";

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
  const cookieStore = cookies();
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
 * Pages Router API routes (pages/api/*)
 */
export function createServerSupabaseApi(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  return createPagesServerClient<Database>({ req, res });
}

/**
 * Admin client (service-role) for server-only tasks.
 * Never import this into client components.
 */
export function createAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_URL");
  if (!key) throw new Error("Missing env: SUPABASE_SERVICE_ROLE_KEY");

  return createClient<Database>(url, key, {
    auth: { persistSession: false },
  });
}