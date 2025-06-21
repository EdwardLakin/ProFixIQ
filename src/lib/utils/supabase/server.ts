import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Creates a Supabase server client using cookies for auth/session persistence
export function createClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
    {
      cookies: {
        get(name: string) {
          return cookies().get(name)?.value;
        },
      },
    }
  );
}