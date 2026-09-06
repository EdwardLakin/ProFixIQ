import BillingRecoveryClient from "@/features/stripe/components/BillingRecoveryClient";
import { requireShopPageAccess } from "@/features/shared/lib/server/admin-access";

export const dynamic = "force-dynamic";

export default async function AccountBillingPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string | string[] }>;
}) {
  const { profile } = await requireShopPageAccess({
    allowRoles: ["owner", "admin"],
    requiredCapability: "canManageBilling",
    redirectTo: "/shop/sign-in",
  });

  const params = await searchParams;
  const rawSessionId =
    typeof params.session_id === "string" ? params.session_id.trim() : "";
  const recoverySessionId = /^cs_[A-Za-z0-9_]+$/.test(rawSessionId)
    ? rawSessionId
    : null;

  return (
    <BillingRecoveryClient
      shopId={profile.shop_id}
      recoverySessionId={recoverySessionId}
    />
  );
}
