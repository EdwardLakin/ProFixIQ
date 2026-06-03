// features/shared/lib/supabase/server.ts
import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import type { NextApiRequest, NextApiResponse } from "next";
import type { Database } from "@shared/types/types/supabase";
import {
  readSupabaseServerEnv,
  readSupabaseServiceRoleKey,
} from "./server-env";

function createCookieBackedServerClient() {
  const cookieStore = cookies() as unknown as {
    getAll: () => { name: string; value: string }[];
    set: (
      name: string,
      value: string,
      options?: Record<string, unknown>,
    ) => void;
  };

  const { supabaseUrl, supabaseAnonKey } = readSupabaseServerEnv();

  return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot set cookies. Middleware/route handlers that
          // can write cookies refresh the session before RSC reads it.
        }
      },
    },
  });
}

/**
 * App Router – Server Components (RSC)
 */
export function createServerSupabaseRSC() {
  return createCookieBackedServerClient();
}

/**
 * App Router – Route Handlers (app/api/*)
 */
export function createServerSupabaseRoute() {
  return createCookieBackedServerClient();
}

/**
 * Pages Router API routes (pages/api/*)
 */
export function createServerSupabaseApi(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const { supabaseUrl, supabaseAnonKey } = readSupabaseServerEnv();

  return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return Object.entries(req.cookies).map(([name, value]) => ({
          name,
          value: value ?? "",
        }));
      },
      setAll(cookiesToSet) {
        const existing = res.getHeader("Set-Cookie");
        const nextCookies = cookiesToSet.map(({ name, value, options }) => {
          const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/"];
          if (options?.maxAge) parts.push(`Max-Age=${options.maxAge}`);
          if (options?.sameSite) parts.push(`SameSite=${options.sameSite}`);
          if (options?.secure) parts.push("Secure");
          if (options?.httpOnly) parts.push("HttpOnly");
          return parts.join("; ");
        });
        const previous = Array.isArray(existing)
          ? existing
          : existing
            ? [String(existing)]
            : [];
        res.setHeader("Set-Cookie", [...previous, ...nextCookies]);
      },
    },
  });
}

/**
 * Admin client (service-role) for server-only tasks.
 * Never import this into client components.
 */
export function createAdminSupabase() {
  const { supabaseUrl } = readSupabaseServerEnv();

  return createClient<Database>(supabaseUrl, readSupabaseServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
