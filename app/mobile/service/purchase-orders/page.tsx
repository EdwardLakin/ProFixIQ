import { PackagePlus } from "lucide-react";

import MobilePurchaseOrders from "@/features/parts/mobile/MobilePurchaseOrders";
import { FIELD_PRODUCT_CAPABILITIES } from "@/features/shared/lib/product-access";
import { requireShopPageAccess } from "@/features/shared/lib/server/admin-access";

export const dynamic = "force-dynamic";

export default async function FieldPurchaseOrdersPage() {
  const { profile } = await requireShopPageAccess({
    requiredCapability: "canManageParts",
    requiredProductCapabilities: FIELD_PRODUCT_CAPABILITIES,
    redirectTo: "/mobile/service",
  });

  return (
    <main className="mx-auto w-full max-w-5xl space-y-3 px-3 py-3 sm:px-4">
      <section className="mobile-dashboard-hero">
        <div className="flex items-start gap-3">
          <span className="inline-grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/15 bg-white/10 text-[#8ed4ff]">
            <PackagePlus aria-hidden className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="mobile-dashboard-hero__eyebrow">
              Field purchasing
            </div>
            <h1 className="mobile-dashboard-hero__title">Purchase orders</h1>
            <p className="mobile-dashboard-hero__subtitle">
              Turn approved parts into supplier orders, then receive them into
              the exact Field inventory location.
            </p>
          </div>
        </div>
      </section>

      <MobilePurchaseOrders shopId={profile.shop_id} />
    </main>
  );
}
