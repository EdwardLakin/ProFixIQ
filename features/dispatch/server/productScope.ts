import "server-only";

import type { DispatchBoardSnapshot } from "@/features/dispatch/lib/contracts";
import type { ShopAccess } from "@/features/mobile/service/server/access";
import { getMobileFieldServiceAccess } from "@/features/mobile/service/server/access";
import {
  FIELD_PRODUCT_CAPABILITIES,
  resolveShopProductAccess,
  SHOP_PRODUCT_CAPABILITIES,
} from "@/features/shared/lib/product-access";
import { getActorCapabilities } from "@/features/shared/lib/rbac";
import type { ServiceVisitMode } from "@/features/scheduling/lib/service-visit-contract";

export type DispatchProductScope = "shop" | "field";

export async function resolveDispatchProductScope(
  access: ShopAccess,
): Promise<DispatchProductScope> {
  const [shopProduct, fieldProduct] = await Promise.all([
    resolveShopProductAccess({
      supabase: access.supabase,
      shopId: access.profile.shop_id,
      capabilities: SHOP_PRODUCT_CAPABILITIES,
    }),
    resolveShopProductAccess({
      supabase: access.supabase,
      shopId: access.profile.shop_id,
      capabilities: FIELD_PRODUCT_CAPABILITIES,
    }),
  ]);

  if (shopProduct.entitled) return "shop";
  if (fieldProduct.entitled) {
    const fieldAccess = await getMobileFieldServiceAccess(access);
    if (fieldAccess.canAccessFieldService) return "field";
  }
  throw new Error(
    shopProduct.error ?? fieldProduct.error ?? "Product access required",
  );
}

export function canCreateDispatchMode(
  scope: DispatchProductScope,
  mode: ServiceVisitMode,
): boolean {
  return scope === "shop" || mode === "mobile";
}

export function filterDispatchBoardForProduct(
  board: DispatchBoardSnapshot,
  scope: DispatchProductScope,
): DispatchBoardSnapshot {
  if (scope === "shop") return board;
  return {
    ...board,
    visits: board.visits.filter((visit) => visit.mode === "mobile"),
  };
}

export async function canAccessDispatchVisit(args: {
  access: ShopAccess;
  scope: DispatchProductScope;
  visitId: string;
}): Promise<boolean> {
  if (args.scope === "shop") return true;

  const actor = getActorCapabilities({ role: args.access.profile.role });
  let query = args.access.supabase
    .from("service_visits")
    .select("id")
    .eq("id", args.visitId)
    .eq("shop_id", args.access.profile.shop_id)
    .eq("mode", "mobile");
  if (!actor.canManageScheduling) {
    query = query.eq("assigned_user_id", args.access.profile.id);
  }

  const { data, error } = await query.maybeSingle<{ id: string }>();
  if (error) throw new Error(error.message);
  return Boolean(data?.id);
}
