import { requireShopPageAccess } from "@/features/shared/lib/server/admin-access";

export default async function OwnerPaymentsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireShopPageAccess({
    allowRoles: ["owner", "admin"],
    requiredCapability: "canManageBilling",
  });

  return children;
}
