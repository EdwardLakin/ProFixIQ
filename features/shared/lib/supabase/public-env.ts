type SupabasePublicEnvContext = "browser" | "server" | "middleware" | "unknown";

type SupabasePublicEnv = {
  supabaseUrl: string;
  supabaseAnonKey: string;
};

function normalizeSupabaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function logSupabasePublicEnvDiagnostics(
  context: SupabasePublicEnvContext,
  event: "missing" | "present",
): void {
  console.info("[supabase/public-env]", {
    context,
    event,
    hasNextPublicSupabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    hasNextPublicSupabaseAnonKey: Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    ),
    // These are intentionally diagnostics only. Do not read these fallbacks for
    // app clients because this project standardizes on NEXT_PUBLIC_* keys.
    hasLegacySupabaseUrl: Boolean(process.env.SUPABASE_URL),
    hasLegacySupabaseAnonKey: Boolean(process.env.SUPABASE_ANON_KEY),
  });
}

export function readSupabasePublicEnv(
  context: SupabasePublicEnvContext = "unknown",
): SupabasePublicEnv {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const rawAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabaseUrl = rawUrl ? normalizeSupabaseUrl(rawUrl) : "";
  const supabaseAnonKey = rawAnonKey?.trim() ?? "";

  if (!supabaseUrl || !supabaseAnonKey) {
    logSupabasePublicEnvDiagnostics(context, "missing");
    if (!supabaseUrl) throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_URL");
    throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  logSupabasePublicEnvDiagnostics(context, "present");
  return { supabaseUrl, supabaseAnonKey };
}

export function hasSupabasePublicEnv(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim(),
  );
}
