// features/shared/lib/supabase/server.ts
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import type { NextApiRequest, NextApiResponse } from "next";
import { serialize } from "cookie";
import type { Database } from "@shared/types/types/supabase";

/**
 * App Router server components / route handlers (uses next/headers cookies()).
 */
export async function createServerSupabaseRSC() {
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies(); // <-- NOTICE the await

  // Type for object-form options to cookieStore.set({ ... })
  type SetObject = Parameters<typeof cookieStore.set>[0];

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => cookieStore.get(name)?.value,
        set: (name: string, value: string, options?: Omit<SetObject, "name" | "value">) => {
          cookieStore.set({ name, value, ...(options ?? {}) });
        },
        remove: (name: string, options?: Omit<SetObject, "name" | "value">) => {
          cookieStore.set({ name, value: "", maxAge: 0, ...(options ?? {}) });
        },
      },
    },
  );
}

/**
 * Pages API routes (req/res) — session persisted via Set-Cookie.
 */
export function createServerSupabaseApi(req: NextApiRequest, res: NextApiResponse) {
  // Use cookie adapter shape expected by @supabase/ssr
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => {
          const v = req.cookies[name];
          return Array.isArray(v) ? v[0] : v;
        },
        set: (name: string, value: string, options?: Parameters<typeof serialize>[2]) => {
          res.setHeader(
            "Set-Cookie",
            serialize(name, value, {
              path: "/",
              httpOnly: true,
              sameSite: "lax",
              secure: process.env.NODE_ENV === "production",
              ...(options ?? {}),
            }),
          );
        },
        remove: (name: string, options?: Parameters<typeof serialize>[2]) => {
          res.setHeader(
            "Set-Cookie",
            serialize(name, "", {
              path: "/",
              httpOnly: true,
              sameSite: "lax",
              secure: process.env.NODE_ENV === "production",
              maxAge: 0,
              ...(options ?? {}),
            }),
          );
        },
      },
    },
  );
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