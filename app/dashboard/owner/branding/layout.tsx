import { requireShopPageAccess } from "@/features/shared/lib/server/admin-access";

export default async function OwnerBrandingLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireShopPageAccess({
    allowRoles: ["owner", "admin"],
    requiredCapability: "canManageBranding",
  });

  return children;
}
