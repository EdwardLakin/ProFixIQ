import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@shared/types/types/supabase";

type DB = Database;

export type AuthenticatedStaffProfile = Pick<
  DB["public"]["Tables"]["profiles"]["Row"],
  | "id"
  | "role"
  | "shop_id"
  | "completed_onboarding"
  | "must_change_password"
  | "email"
  | "full_name"
>;

type ProfileClient = SupabaseClient<Database>;

type CanonicalProfileOptions = {
  linkedProfileClient?: () => ProfileClient;
  signal?: AbortSignal;
};

const PROFILE_SELECT =
  "id, role, shop_id, completed_onboarding, must_change_password, email, full_name";

/**
 * Resolve the canonical profiles.id row for a verified Supabase auth subject.
 * Imported staff can retain a different canonical profile id and link their
 * auth identity through profiles.user_id, so both identity shapes are checked
 * in a deterministic order.
 */
export async function resolveCanonicalStaffProfile(
  supabase: ProfileClient,
  authUserId: string,
  options: CanonicalProfileOptions = {},
): Promise<{
  profile: AuthenticatedStaffProfile | null;
  error: string | null;
}> {
  const byIdQuery = supabase
    .from("profiles")
    .select(PROFILE_SELECT)
    .eq("id", authUserId);
  if (options.signal) byIdQuery.abortSignal(options.signal);
  const byId = await byIdQuery.maybeSingle<AuthenticatedStaffProfile>();

  if (byId.error) {
    return { profile: null, error: byId.error.message };
  }
  if (byId.data) {
    return { profile: byId.data, error: null };
  }

  const linkedClient = options.linkedProfileClient?.() ?? supabase;
  const byAuthUserQuery = linkedClient
    .from("profiles")
    .select(PROFILE_SELECT)
    .eq("user_id", authUserId);
  if (options.signal) byAuthUserQuery.abortSignal(options.signal);
  const byAuthUser =
    await byAuthUserQuery.maybeSingle<AuthenticatedStaffProfile>();

  return {
    profile: byAuthUser.data ?? null,
    error: byAuthUser.error?.message ?? null,
  };
}
