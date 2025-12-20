// src/features/shared/lib/supabase/server.ts
import "server-only";

import { cookies } from "next/headers";
import {
  createServerComponentClient,
  createRouteHandlerClient,
  createPagesServerClient,
} from "@supabase/auth-helpers-nextjs";
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
export function createServerSupabaseApi(req: NextApiRequest, res: NextApiResponse) {
  return createPagesServerClient<Database>({ req, res });
}