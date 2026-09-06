import Link from "next/link";

import BillingRecoveryPlansClient from "@/features/stripe/components/BillingRecoveryPlansClient";
import { requireShopPageAccess } from "@/features/shared/lib/server/admin-access";

export const dynamic = "force-dynamic";

export default async function BillingRecoveryPlansPage() {
  const { profile } = await requireShopPageAccess({
    allowRoles: ["owner", "admin"],
    requiredCapability: "canManageBilling",
    redirectTo: "/shop/sign-in",
  });

  return (
    <main className="min-h-screen bg-white px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto mb-8 max-w-[88rem]">
        <Link
          href="/account/billing"
          className="text-sm font-semibold text-slate-600 hover:text-slate-950"
        >
          ← Back to billing
        </Link>

        <h1 className="mt-5 text-3xl font-semibold tracking-tight text-slate-950">
          Choose your ProFixIQ product
        </h1>

        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          Restore product access with a paid subscription for this account.
        </p>
      </div>

      <BillingRecoveryPlansClient shopId={profile.shop_id} />
    </main>
  );
}
