import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

export const PASSWORD_ACTIVATION_RETRY_MESSAGE =
  "Your password was updated, but account activation could not be completed. Retry activation or contact your shop administrator.";

export async function activatePasswordProfile(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<{ ok: true } | { ok: false; userMessage: string; detail: string }> {
  const { error } = await supabase
    .from("profiles")
    .update({
      must_change_password: false,
      updated_at: new Date().toISOString(),
    } as Database["public"]["Tables"]["profiles"]["Update"])
    .eq("id", userId);

  if (error) {
    return {
      ok: false,
      userMessage: PASSWORD_ACTIVATION_RETRY_MESSAGE,
      detail: error.message,
    };
  }
  return { ok: true };
}
