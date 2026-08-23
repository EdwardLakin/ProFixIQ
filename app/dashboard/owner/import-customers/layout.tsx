import { requireShopPageAccess } from "@/features/shared/lib/server/admin-access";

export default async function OwnerCustomerImportLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireShopPageAccess({ allowRoles: ["owner", "admin"] });

  return children;
}
