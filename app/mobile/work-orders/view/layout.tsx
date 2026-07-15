import { requireShopPageAccess } from "@/features/shared/lib/server/admin-access";

export default async function MobileWorkOrdersViewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireShopPageAccess({ requiredCapability: "canViewShopWideData" });
  return children;
}
