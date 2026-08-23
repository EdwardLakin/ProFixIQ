import crypto from "node:crypto";
import { NextResponse } from "next/server";
import type { PostgrestError } from "@supabase/supabase-js";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import {
  buildOwnerShopDirectoryRows,
  type OwnerShopDirectoryOwner,
  type OwnerShopDirectoryProfile,
  type OwnerShopDirectoryShop,
} from "@/features/dashboard/lib/ownerShopDirectory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SHOP_FIELDS =
  "id,name,city,province,email,phone_number,timezone,plan,owner_id,created_at,stripe_pricing_model,subscription_package";

type OptionalRead<T> = {
  data: T[] | null;
  error: PostgrestError | null;
};

function responseHeaders(requestId: string) {
  return {
    "Cache-Control": "private, no-store",
    "X-Request-Id": requestId,
  };
}

function databaseFailure(requestId: string, operation: string, error: unknown) {
  console.error("[admin/shops] database operation failed", {
    requestId,
    operation,
    error,
  });
  return NextResponse.json(
    { error: "The shop directory could not be loaded.", requestId },
    { status: 500, headers: responseHeaders(requestId) },
  );
}

export async function GET() {
  const requestId = crypto.randomUUID();
  const access = await requireShopScopedApiAccess({
    allowRoles: ["owner", "admin"],
  });
  if (!access.ok) {
    access.response.headers.set("Cache-Control", "private, no-store");
    access.response.headers.set("X-Request-Id", requestId);
    return access.response;
  }

  const { data: currentShop, error: currentShopError } = await access.supabase
    .from("shops")
    .select(`${SHOP_FIELDS},organization_id`)
    .eq("id", access.profile.shop_id)
    .maybeSingle<OwnerShopDirectoryShop & { organization_id: string | null }>();

  if (currentShopError || !currentShop) {
    return databaseFailure(
      requestId,
      "resolve authenticated shop scope",
      currentShopError ?? new Error("Authenticated shop not found"),
    );
  }

  const admin = createAdminSupabase();
  let primaryResult: OptionalRead<OwnerShopDirectoryShop>;

  if (access.canonicalRole === "admin") {
    const result = await admin
      .from("shops")
      .select(SHOP_FIELDS)
      .eq("id", currentShop.id)
      .limit(1);
    primaryResult = result as OptionalRead<OwnerShopDirectoryShop>;
  } else if (currentShop.organization_id) {
    const result = await admin
      .from("shops")
      .select(SHOP_FIELDS)
      .eq("organization_id", currentShop.organization_id)
      .order("name", { ascending: true })
      .limit(200);
    primaryResult = result as OptionalRead<OwnerShopDirectoryShop>;
  } else {
    const ownerIds = [...new Set([access.authUserId, access.profile.id])];
    const result = await admin
      .from("shops")
      .select(SHOP_FIELDS)
      .in("owner_id", ownerIds)
      .order("name", { ascending: true })
      .limit(200);
    primaryResult = result as OptionalRead<OwnerShopDirectoryShop>;
  }

  if (primaryResult.error) {
    return databaseFailure(
      requestId,
      "load tenant shop directory",
      primaryResult.error,
    );
  }

  const shops = primaryResult.data ?? [];
  if (!shops.some((shop) => shop.id === currentShop.id)) {
    shops.push(currentShop);
  }
  const shopIds = shops.map((shop) => shop.id);

  const [profileResult, ownerResult] = await Promise.allSettled([
    shopIds.length
      ? admin
          .from("shop_profiles")
          .select("shop_id,city,province,email,phone,updated_at")
          .in("shop_id", shopIds)
      : Promise.resolve({ data: [], error: null }),
    shopIds.length
      ? admin
          .from("profiles")
          .select("id,shop_id,full_name,email,role,user_id")
          .in("shop_id", shopIds)
          .eq("role", "owner")
      : Promise.resolve({ data: [], error: null }),
  ]);

  const profileRead =
    profileResult.status === "fulfilled" && !profileResult.value.error
      ? (profileResult.value.data as OwnerShopDirectoryProfile[] | null)
      : null;
  const ownerRead =
    ownerResult.status === "fulfilled" && !ownerResult.value.error
      ? (ownerResult.value.data as OwnerShopDirectoryOwner[] | null)
      : null;
  const warnings: string[] = [];

  if (profileRead === null) {
    warnings.push("Profile health is temporarily unavailable.");
    console.warn("[admin/shops] optional profile-health read failed", {
      requestId,
      error:
        profileResult.status === "rejected"
          ? profileResult.reason
          : profileResult.value.error,
    });
  }
  if (ownerRead === null) {
    warnings.push("Owner summaries are temporarily unavailable.");
    console.warn("[admin/shops] optional owner-summary read failed", {
      requestId,
      error:
        ownerResult.status === "rejected"
          ? ownerResult.reason
          : ownerResult.value.error,
    });
  }

  return NextResponse.json(
    {
      shops: buildOwnerShopDirectoryRows({
        shops,
        shopProfiles: profileRead,
        ownerProfiles: ownerRead,
        canViewBilling: access.canonicalRole === "owner",
      }),
      secondary: {
        profileHealth: profileRead === null ? "unavailable" : "available",
        ownerSummary: ownerRead === null ? "unavailable" : "available",
      },
      warnings,
      requestId,
      loadedAt: new Date().toISOString(),
    },
    { headers: responseHeaders(requestId) },
  );
}
