import "server-only";

import { readSupabasePublicEnv } from "./public-env";

export function readSupabaseServerEnv() {
  return readSupabasePublicEnv("server");
}

export function readSupabaseServiceRoleKey(): string {
  const value = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  if (!value) {
    console.info("[supabase/server-env]", {
      event: "missing_service_role",
      hasSupabaseServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    });
    throw new Error("Missing env: SUPABASE_SERVICE_ROLE_KEY");
  }

  console.info("[supabase/server-env]", {
    event: "present_service_role",
    hasSupabaseServiceRoleKey: true,
  });
  return value;
}
