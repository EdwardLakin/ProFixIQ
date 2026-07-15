import { requireShopPageAccess } from "@/features/shared/lib/server/admin-access";

export default async function MobileAppointmentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireShopPageAccess({ requiredCapability: "canManageScheduling" });
  return children;
}
