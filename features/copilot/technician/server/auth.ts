import "server-only";

import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { getTechnicianCopilotCapabilities } from "./capability";

const TECHNICIAN_COPILOT_TESTER_EMAIL = "edwardlakin35@gmail.com";

type CopilotEntitlementRpcClient = {
  rpc: (
    name: "technician_copilot_has_paid_access",
    args: { p_shop_id: string; p_profile_id: string },
  ) => PromiseLike<{ data: boolean | null; error: { message?: string } | null }>;
};

export class TechnicianCopilotAccessError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export async function requireTechnicianCopilotAccess() {
  const supabase = await createServerSupabaseRoute();
  const auth = await supabase.auth.getUser();
  const user = auth.data.user;
  if (auth.error || !user) {
    throw new TechnicianCopilotAccessError(
      401,
      "unauthorized",
      "Authentication required.",
    );
  }

  let profileResult = await supabase
    .from("profiles")
    .select("id,user_id,shop_id,role,full_name")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profileResult.data && !profileResult.error) {
    profileResult = await supabase
      .from("profiles")
      .select("id,user_id,shop_id,role,full_name")
      .eq("id", user.id)
      .maybeSingle();
  }
  if (profileResult.error) {
    throw new TechnicianCopilotAccessError(
      500,
      "profile_lookup_failed",
      profileResult.error.message,
    );
  }

  const profile = profileResult.data;
  if (!profile?.id || !profile.shop_id) {
    throw new TechnicianCopilotAccessError(
      403,
      "technician_profile_required",
      "Technician profile required.",
    );
  }
  const role = String(profile.role ?? "").toLowerCase();
  if (role !== "mechanic" && role !== "technician" && role !== "tech") {
    throw new TechnicianCopilotAccessError(
      403,
      "technician_role_required",
      "Technician role required.",
    );
  }

  // current_shop_id() resolves from the authenticated profile directly. This
  // compatibility RPC is still useful as an explicit ownership assertion: it
  // rejects a profile/shop mismatch before CoPilot capability or assigned-work
  // reads begin, without relying on its transaction-local setting afterward.
  const { error: shopContextError } = await supabase.rpc(
    "set_current_shop_id",
    { p_shop_id: profile.shop_id },
  );
  if (shopContextError) {
    throw new TechnicianCopilotAccessError(
      500,
      "shop_security_context_failed",
      "Shop security context could not be initialized.",
    );
  }

  const capabilities = await getTechnicianCopilotCapabilities(
    supabase,
    profile.shop_id,
    profile.id,
  );

  const testerOverride =
    String(user.email ?? "").trim().toLowerCase() ===
    TECHNICIAN_COPILOT_TESTER_EMAIL;
  if (!testerOverride) {
    const entitlementClient = supabase as unknown as CopilotEntitlementRpcClient;
    const entitlement = await entitlementClient.rpc(
      "technician_copilot_has_paid_access",
      {
        p_shop_id: profile.shop_id,
        p_profile_id: profile.id,
      },
    );
    if (entitlement.error) {
      throw new TechnicianCopilotAccessError(
        500,
        "technician_copilot_entitlement_lookup_failed",
        "Technician CoPilot subscription could not be verified.",
      );
    }
    if (entitlement.data !== true) {
      throw new TechnicianCopilotAccessError(
        402,
        "technician_copilot_subscription_required",
        "Technician CoPilot requires an active paid technician license.",
      );
    }
  }
  if (!capabilities.text) {
    throw new TechnicianCopilotAccessError(
      404,
      "technician_copilot_disabled",
      "Technician CoPilot is not enabled.",
    );
  }

  return {
    supabase,
    user,
    authUserId: user.id,
    profileId: profile.id,
    shopId: profile.shop_id,
    role,
    technicianName: profile.full_name?.trim() || null,
    capabilities,
  };
}
