import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveCanonicalStaffProfile } from "@/features/shared/lib/authenticated-profile";
import type { Database } from "@shared/types/types/supabase";

type ProfileActivationRow = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  "id" | "must_change_password"
>;

type PasswordActivationClients = {
  authUserId: string;
  sessionClient: SupabaseClient<Database>;
  adminClient: SupabaseClient<Database>;
};

export type PasswordActivationServerResult =
  | { ok: true; profileUpdated: boolean }
  | { ok: false; detail: string };

/**
 * Clear the first-login password requirement on the exact canonical profile
 * linked to a server-verified auth subject. The service client is kept
 * separate from the cookie-backed session client and the returned row is
 * required so an RLS-style zero-row update can never be reported as success.
 */
export async function clearCanonicalPasswordRequirement({
  authUserId,
  sessionClient,
  adminClient,
}: PasswordActivationClients): Promise<PasswordActivationServerResult> {
  const { profile, error: profileError } =
    await resolveCanonicalStaffProfile(sessionClient, authUserId, {
      linkedProfileClient: () => adminClient,
    });

  if (profileError) {
    return { ok: false, detail: profileError };
  }

  // Portal-only and pre-profile accounts have no staff password flag to clear.
  if (!profile) {
    return { ok: true, profileUpdated: false };
  }

  const { data: updatedProfile, error: updateError } = await adminClient
    .from("profiles")
    .update({
      must_change_password: false,
      updated_at: new Date().toISOString(),
    } as Database["public"]["Tables"]["profiles"]["Update"])
    .eq("id", profile.id)
    .select("id, must_change_password")
    .maybeSingle<ProfileActivationRow>();

  if (updateError) {
    return { ok: false, detail: updateError.message };
  }

  if (
    !updatedProfile ||
    updatedProfile.id !== profile.id ||
    updatedProfile.must_change_password !== false
  ) {
    return {
      ok: false,
      detail: "Canonical profile password activation was not persisted.",
    };
  }

  return { ok: true, profileUpdated: true };
}
