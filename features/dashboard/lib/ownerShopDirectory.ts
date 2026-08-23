import type { Database } from "@shared/types/types/supabase";
import { getPlanDisplayLabel } from "@/features/stripe/lib/stripe/constants";
import {
  PRODUCT_PACKAGE_BILLING_MODEL,
  PRODUCT_PACKAGE_CATALOG,
  normalizeProductPackageKey,
} from "@/features/stripe/lib/stripe/product-packages";

type ShopTableRow = Database["public"]["Tables"]["shops"]["Row"];
type ShopProfileTableRow = Database["public"]["Tables"]["shop_profiles"]["Row"];
type ProfileTableRow = Database["public"]["Tables"]["profiles"]["Row"];

export type OwnerShopDirectoryShop = Pick<
  ShopTableRow,
  | "id"
  | "name"
  | "city"
  | "province"
  | "email"
  | "phone_number"
  | "timezone"
  | "plan"
  | "owner_id"
  | "created_at"
  | "stripe_pricing_model"
  | "subscription_package"
>;

export type OwnerShopDirectoryProfile = Pick<
  ShopProfileTableRow,
  "shop_id" | "city" | "province" | "email" | "phone" | "updated_at"
>;

export type OwnerShopDirectoryOwner = Pick<
  ProfileTableRow,
  "id" | "shop_id" | "full_name" | "email" | "role" | "user_id"
>;

export type OwnerShopPlan = {
  label: string | null;
  source:
    | "subscription_package"
    | "legacy_billing_plan"
    | "billing_sync_required"
    | "restricted";
};

export type OwnerShopHealth = "Complete" | "Needs profile" | "Unavailable";

export type OwnerShopDirectoryRow = {
  id: string;
  name: string;
  city: string | null;
  province: string | null;
  email: string | null;
  phone: string | null;
  timezone: string | null;
  ownerId: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  ownerSummaryAvailable: boolean;
  plan: OwnerShopPlan;
  health: OwnerShopHealth;
  profileHealthAvailable: boolean;
  profileUpdatedAt: string | null;
  createdAt: string | null;
};

export type OwnerShopHealthFilter = "all" | OwnerShopHealth;

function clean(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

export function resolveOwnerShopPlan(
  shop: Pick<
    OwnerShopDirectoryShop,
    "plan" | "stripe_pricing_model" | "subscription_package"
  >,
  canViewBilling: boolean,
): OwnerShopPlan {
  if (!canViewBilling) {
    return { label: null, source: "restricted" };
  }

  const packageKey = normalizeProductPackageKey(shop.subscription_package);
  if (packageKey) {
    return {
      label: PRODUCT_PACKAGE_CATALOG[packageKey].name,
      source: "subscription_package",
    };
  }

  if (shop.stripe_pricing_model === PRODUCT_PACKAGE_BILLING_MODEL) {
    return { label: "Billing sync required", source: "billing_sync_required" };
  }

  const legacyPlan = clean(shop.plan);
  return legacyPlan
    ? {
        label: getPlanDisplayLabel(legacyPlan),
        source: "legacy_billing_plan",
      }
    : { label: "Billing sync required", source: "billing_sync_required" };
}

export function buildOwnerShopDirectoryRows(input: {
  shops: readonly OwnerShopDirectoryShop[];
  shopProfiles: readonly OwnerShopDirectoryProfile[] | null;
  ownerProfiles: readonly OwnerShopDirectoryOwner[] | null;
  canViewBilling: boolean;
}): OwnerShopDirectoryRow[] {
  const profilesByShop = new Map(
    (input.shopProfiles ?? []).map((profile) => [profile.shop_id, profile]),
  );
  const ownersByShop = new Map(
    (input.ownerProfiles ?? [])
      .filter((owner) => owner.shop_id)
      .map((owner) => [owner.shop_id as string, owner]),
  );

  return [...input.shops]
    .sort((left, right) =>
      (clean(left.name) ?? left.id).localeCompare(
        clean(right.name) ?? right.id,
      ),
    )
    .map((shop) => {
      const profile = profilesByShop.get(shop.id);
      const owner = ownersByShop.get(shop.id);
      const profileAvailable = input.shopProfiles !== null;
      const profileComplete = Boolean(
        clean(profile?.email) && clean(profile?.phone) && clean(shop.timezone),
      );

      return {
        id: shop.id,
        name: clean(shop.name) ?? shop.id,
        city: clean(profile?.city) ?? clean(shop.city),
        province: clean(profile?.province) ?? clean(shop.province),
        email: clean(profile?.email) ?? clean(shop.email),
        phone: clean(profile?.phone) ?? clean(shop.phone_number),
        timezone: clean(shop.timezone),
        ownerId: clean(shop.owner_id),
        ownerName: clean(owner?.full_name),
        ownerEmail: clean(owner?.email),
        ownerSummaryAvailable: input.ownerProfiles !== null,
        plan: resolveOwnerShopPlan(shop, input.canViewBilling),
        health: profileAvailable
          ? profileComplete
            ? "Complete"
            : "Needs profile"
          : "Unavailable",
        profileHealthAvailable: profileAvailable,
        profileUpdatedAt: clean(profile?.updated_at),
        createdAt: clean(shop.created_at),
      } satisfies OwnerShopDirectoryRow;
    });
}

export function filterOwnerShopDirectoryRows(
  rows: readonly OwnerShopDirectoryRow[],
  search: string,
  healthFilter: OwnerShopHealthFilter,
): OwnerShopDirectoryRow[] {
  const query = search.trim().toLowerCase();
  return rows.filter((row) => {
    const matchesHealth = healthFilter === "all" || row.health === healthFilter;
    const matchesSearch =
      !query ||
      [row.name, row.city, row.province, row.email, row.phone, row.ownerName]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(query));
    return matchesHealth && matchesSearch;
  });
}
