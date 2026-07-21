import "server-only";

import type { ActorCapabilities, CanonicalRole } from "@/features/shared/lib/rbac";
import {
  canonicalizeRole,
  getActorCapabilities,
} from "@/features/shared/lib/rbac";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";

export class ShopAssistantHttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ShopAssistantHttpError";
    this.status = status;
  }
}

export type ShopAssistantActor = {
  userId: string;
  shopId: string;
  role: string | null;
  canonicalRole: CanonicalRole;
  capabilities: ActorCapabilities;
  supabase: ReturnType<typeof createServerSupabaseRoute>;
};

export async function requireShopAssistantActor(
  supabase = createServerSupabaseRoute(),
): Promise<ShopAssistantActor> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new ShopAssistantHttpError(401, "Unauthorized");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, shop_id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile?.shop_id) {
    throw new ShopAssistantHttpError(403, "A shop staff profile is required");
  }

  const canonicalRole = canonicalizeRole(profile.role);
  if (canonicalRole === "mechanic") {
    throw new ShopAssistantHttpError(
      403,
      "Use the technician AI inside a work order for technician guidance",
    );
  }

  if (
    canonicalRole === "customer" ||
    canonicalRole === "driver" ||
    canonicalRole === "unknown"
  ) {
    throw new ShopAssistantHttpError(
      403,
      "Your role does not have access to the shop-wide assistant",
    );
  }

  const capabilities = getActorCapabilities({ role: profile.role });

  return {
    userId: user.id,
    shopId: profile.shop_id,
    role: profile.role,
    canonicalRole,
    capabilities,
    supabase,
  };
}

export function shopAssistantErrorStatus(error: unknown): number {
  return error instanceof ShopAssistantHttpError ? error.status : 500;
}

export function shopAssistantErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Shop assistant request failed";
}
