import BillingRecoveryClient from "@/features/stripe/components/BillingRecoveryClient";
import { requireShopPageAccess } from "@/features/shared/lib/server/admin-access";

export const dynamic = "force-dynamic";

export default async function AccountBillingPage() {
  const { profile } = await requireShopPageAccess({
    allowRoles: ["owner", "admin"],
    requiredCapability: "canManageBilling",
    requiredProductCapabilities: [],
    redirectTo: "/shop/sign-in",
  });

  return <BillingRecoveryClient shopId={profile.shop_id} />;
}
