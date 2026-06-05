import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { canonicalizeRole } from "@/features/shared/lib/rbac";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

type DB = Database;

type ProfileRow = Pick<
  DB["public"]["Tables"]["profiles"]["Row"],
  "id" | "role" | "shop_id" | "business_name" | "shop_name"
>;

type ShopRow = Pick<
  DB["public"]["Tables"]["shops"]["Row"],
  "id" | "business_name" | "email" | "city"
>;

type ShopMemberRow = Pick<
  DB["public"]["Tables"]["shop_members"]["Row"],
  "shop_id" | "role"
>;

type AuditLogInsert = DB["public"]["Tables"]["audit_logs"]["Insert"];

export type AvailableShop = {
  id: string;
  name: string;
  current: boolean;
  membershipRole: string | null;
};

export type ShopSwitchContext = {
  profile: ProfileRow;
  currentShop: AvailableShop | null;
  shops: AvailableShop[];
  canSwitch: boolean;
};

const ACTOR_SWITCH_ROLES = new Set(["owner", "admin"]);
const MANAGEABLE_MEMBERSHIP_ROLES = new Set(["owner", "admin"]);

function shopDisplayName(shop: ShopRow | null | undefined, profile?: ProfileRow | null): string {
  const name =
    shop?.business_name?.trim() ||
    profile?.shop_name?.trim() ||
    profile?.business_name?.trim() ||
    shop?.email?.trim() ||
    shop?.city?.trim();

  return name || "Current shop";
}

function uniqueShopIds(ids: Array<string | null | undefined>): string[] {
  return Array.from(new Set(ids.filter((id): id is string => Boolean(id))));
}

async function loadCurrentShop(admin: SupabaseClient<DB>, profile: ProfileRow) {
  if (!profile.shop_id) return null;

  const { data } = await admin
    .from("shops")
    .select("id, business_name, email, city")
    .eq("id", profile.shop_id)
    .maybeSingle<ShopRow>();

  return data ?? null;
}

async function loadShopsById(admin: SupabaseClient<DB>, shopIds: string[]) {
  if (shopIds.length === 0) return new Map<string, ShopRow>();

  const { data } = await admin
    .from("shops")
    .select("id, business_name, email, city")
    .in("id", shopIds);

  return new Map((data ?? []).map((shop) => [shop.id, shop as ShopRow]));
}

async function loadManageableMemberships(admin: SupabaseClient<DB>, actorProfileId: string) {
  const { data, error } = await admin
    .from("shop_members")
    .select("shop_id, role")
    .eq("user_id", actorProfileId)
    .in("role", Array.from(MANAGEABLE_MEMBERSHIP_ROLES));

  if (error) {
    console.warn("[shop-switcher] shop_members lookup failed; falling back to current shop only", {
      code: error.code,
      message: error.message,
    });
    return [] as ShopMemberRow[];
  }

  return (data ?? []) as ShopMemberRow[];
}

export function canActorSwitchShops(role: string | null | undefined): boolean {
  return ACTOR_SWITCH_ROLES.has(canonicalizeRole(role));
}

export async function getAvailableShopContext(params: {
  admin?: SupabaseClient<DB>;
  profile: ProfileRow;
}): Promise<ShopSwitchContext> {
  const admin = params.admin ?? createAdminSupabase();
  const profile = params.profile;
  const actorCanSwitch = canActorSwitchShops(profile.role);

  const [currentShop, memberships] = await Promise.all([
    loadCurrentShop(admin, profile),
    actorCanSwitch ? loadManageableMemberships(admin, profile.id) : Promise.resolve([] as ShopMemberRow[]),
  ]);

  const manageableShopIds = actorCanSwitch
    ? uniqueShopIds(memberships.map((membership) => membership.shop_id))
    : [];
  const shopIds = uniqueShopIds([profile.shop_id, ...manageableShopIds]);
  const shopsById = await loadShopsById(admin, shopIds);

  if (currentShop && !shopsById.has(currentShop.id)) {
    shopsById.set(currentShop.id, currentShop);
  }

  const roleByShopId = new Map(
    memberships.map((membership) => [membership.shop_id, membership.role]),
  );

  const shops = shopIds.map((shopId) => {
    const shop = shopsById.get(shopId) ?? null;
    return {
      id: shopId,
      name: shopDisplayName(shop, shopId === profile.shop_id ? profile : null),
      current: shopId === profile.shop_id,
      membershipRole: roleByShopId.get(shopId) ?? null,
    };
  });

  const currentShopOption = profile.shop_id
    ? shops.find((shop) => shop.id === profile.shop_id) ?? {
        id: profile.shop_id,
        name: shopDisplayName(currentShop, profile),
        current: true,
        membershipRole: roleByShopId.get(profile.shop_id) ?? null,
      }
    : null;

  return {
    profile,
    currentShop: currentShopOption,
    shops,
    canSwitch: actorCanSwitch && shops.length > 1,
  };
}

export async function switchActiveShop(params: {
  admin?: SupabaseClient<DB>;
  actorProfile: ProfileRow;
  requestedShopId: string;
}): Promise<
  | { ok: true; currentShop: AvailableShop; shops: AvailableShop[] }
  | { ok: false; status: 400 | 403 | 404 | 500; error: string }
> {
  const requestedShopId = params.requestedShopId.trim();
  if (!requestedShopId) {
    return { ok: false, status: 400, error: "shop_id is required" };
  }

  if (!canActorSwitchShops(params.actorProfile.role)) {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  const admin = params.admin ?? createAdminSupabase();
  const beforeContext = await getAvailableShopContext({ admin, profile: params.actorProfile });
  const authorizedShop = beforeContext.shops.find((shop) => shop.id === requestedShopId);

  if (!authorizedShop || !authorizedShop.membershipRole) {
    return { ok: false, status: 403, error: "Requested shop is not authorized for this user" };
  }

  const { data: updatedProfile, error: updateError } = await admin
    .from("profiles")
    .update({ shop_id: requestedShopId, updated_at: new Date().toISOString() })
    .eq("id", params.actorProfile.id)
    .select("id, role, shop_id, business_name, shop_name")
    .maybeSingle<ProfileRow>();

  if (updateError) {
    return { ok: false, status: 500, error: updateError.message };
  }

  if (!updatedProfile?.shop_id) {
    return { ok: false, status: 404, error: "Updated profile not found" };
  }

  await admin.from("audit_logs").insert({
    actor_id: params.actorProfile.id,
    action: "shop_context_switched",
    target: "profiles.shop_id",
    metadata: {
      profile_id: params.actorProfile.id,
      from_shop_id: params.actorProfile.shop_id,
      to_shop_id: requestedShopId,
    },
  } satisfies AuditLogInsert);

  const afterContext = await getAvailableShopContext({ admin, profile: updatedProfile });
  const currentShop = afterContext.currentShop;

  if (!currentShop) {
    return { ok: false, status: 404, error: "Current shop not found" };
  }

  return { ok: true, currentShop, shops: afterContext.shops };
}
