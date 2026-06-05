import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { canonicalizeRole } from "@/features/shared/lib/rbac";

export type DB = Database;

export type AssignmentActorProfile = Pick<
  DB["public"]["Tables"]["profiles"]["Row"],
  "id" | "role" | "shop_id"
>;

type ShopMemberScope = Pick<
  DB["public"]["Tables"]["shop_members"]["Row"],
  "shop_id" | "role" | "user_id"
>;

const ASSIGNMENT_ACTOR_ROLES = new Set([
  "owner",
  "admin",
  "manager",
  "advisor",
  "lead_hand",
  "foreman",
]);

const CROSS_SHOP_ACTOR_ROLES = new Set(["owner", "admin"]);
const CROSS_SHOP_MEMBER_ROLES = new Set(["owner", "admin", "manager"]);

export const ASSIGNABLE_TECHNICIAN_ROLES = [
  "mechanic",
  "tech",
  "technician",
  "lead_hand",
  "foreman",
] as const;

const ASSIGNABLE_TECHNICIAN_ROLE_SET = new Set<string>(ASSIGNABLE_TECHNICIAN_ROLES);

function normalizeRole(role: string | null | undefined): string {
  return String(role ?? "").trim().toLowerCase();
}

export function canRoleAssignWorkOrders(role: string | null | undefined): boolean {
  return ASSIGNMENT_ACTOR_ROLES.has(canonicalizeRole(role));
}

export function isAssignableTechnicianRole(role: string | null | undefined): boolean {
  return ASSIGNABLE_TECHNICIAN_ROLE_SET.has(normalizeRole(role));
}

export async function canActorAssignInShop(params: {
  admin: SupabaseClient<DB>;
  profile: AssignmentActorProfile;
  targetShopId: string | null | undefined;
}): Promise<boolean> {
  const targetShopId = params.targetShopId;
  if (!targetShopId) return false;

  const actorRole = canonicalizeRole(params.profile.role);
  if (!ASSIGNMENT_ACTOR_ROLES.has(actorRole)) return false;

  if (params.profile.shop_id === targetShopId) return true;

  if (!CROSS_SHOP_ACTOR_ROLES.has(actorRole)) return false;

  const { data, error } = await params.admin
    .from("shop_members")
    .select("user_id, shop_id, role")
    .eq("user_id", params.profile.id)
    .eq("shop_id", targetShopId)
    .in("role", Array.from(CROSS_SHOP_MEMBER_ROLES))
    .maybeSingle<ShopMemberScope>();

  if (error) {
    console.warn("[work-order-assignment] shop_members authorization lookup failed", {
      actorPresent: true,
      actorProfileId: params.profile.id,
      actorRole,
      activeShopId: params.profile.shop_id,
      targetShopId,
      reason: "shop_members_lookup_failed",
      code: error.code,
      message: error.message,
    });
    return false;
  }

  return Boolean(data);
}

export async function canActorAccessWorkOrderShop(params: {
  admin: SupabaseClient<DB>;
  profile: AssignmentActorProfile;
  targetShopId: string | null | undefined;
}): Promise<boolean> {
  const targetShopId = params.targetShopId;
  if (!targetShopId) return false;
  if (params.profile.shop_id === targetShopId) return true;

  const actorRole = canonicalizeRole(params.profile.role);
  if (!CROSS_SHOP_ACTOR_ROLES.has(actorRole)) return false;

  const { data, error } = await params.admin
    .from("shop_members")
    .select("user_id, shop_id, role")
    .eq("user_id", params.profile.id)
    .eq("shop_id", targetShopId)
    .in("role", Array.from(CROSS_SHOP_MEMBER_ROLES))
    .maybeSingle<ShopMemberScope>();

  if (error) {
    console.warn("[work-order-access] shop_members authorization lookup failed", {
      actorPresent: true,
      actorProfileId: params.profile.id,
      actorRole,
      activeShopId: params.profile.shop_id,
      targetShopId,
      reason: "shop_members_lookup_failed",
      code: error.code,
      message: error.message,
    });
    return false;
  }

  return Boolean(data);
}

export function logAssignmentDiagnostic(context: {
  actorPresent: boolean;
  actorProfileId?: string | null;
  actorRole?: string | null;
  activeShopId?: string | null;
  targetShopId?: string | null;
  workOrderId?: string | null;
  lineId?: string | null;
  reason: string;
}) {
  console.warn("[work-order-assignment] validation", {
    actorPresent: context.actorPresent,
    actorProfileId: context.actorProfileId ?? null,
    actorRole: context.actorRole ?? null,
    activeShopId: context.activeShopId ?? null,
    targetShopId: context.targetShopId ?? null,
    workOrderId: context.workOrderId ?? null,
    lineId: context.lineId ?? null,
    reason: context.reason,
  });
}
