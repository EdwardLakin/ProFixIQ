import "server-only";

import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { hasTechnicianCopilotTextCapability } from "./capability";

export class TechnicianCopilotAccessError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export async function requireTechnicianCopilotAccess() {
  const supabase = await createServerSupabaseRoute();
  const auth = await supabase.auth.getUser();
  const user = auth.data.user;
  if (auth.error || !user) throw new TechnicianCopilotAccessError(401, "unauthorized", "Authentication required.");

  let profileResult = await supabase.from("profiles").select("id,user_id,shop_id,role").eq("user_id", user.id).maybeSingle();
  if (!profileResult.data && !profileResult.error) {
    profileResult = await supabase.from("profiles").select("id,user_id,shop_id,role").eq("id", user.id).maybeSingle();
  }
  if (profileResult.error) throw new TechnicianCopilotAccessError(500, "profile_lookup_failed", profileResult.error.message);

  const profile = profileResult.data;
  if (!profile?.id || !profile.shop_id) throw new TechnicianCopilotAccessError(403, "technician_profile_required", "Technician profile required.");
  const role = String(profile.role ?? "").toLowerCase();
  if (role !== "mechanic" && role !== "technician" && role !== "tech") {
    throw new TechnicianCopilotAccessError(403, "technician_role_required", "Technician role required.");
  }

  const enabled = await hasTechnicianCopilotTextCapability(supabase, profile.shop_id, profile.id);
  if (!enabled) throw new TechnicianCopilotAccessError(404, "technician_copilot_disabled", "Technician CoPilot is not enabled.");

  return { supabase, user, authUserId: user.id, profileId: profile.id, shopId: profile.shop_id, role };
}
