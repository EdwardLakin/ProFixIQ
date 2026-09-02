import MobileCommandRoute from "@/features/mobile/layout/MobileCommandRoute";
import { requireCanonicalShopOrFieldPageAccess } from "@/features/mobile/service/server/access";

export default async function MobileAppointmentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireCanonicalShopOrFieldPageAccess({
    requiredCapability: "canManageScheduling",
    redirectTo: "/mobile",
  });
  return <MobileCommandRoute surface="appointments">{children}</MobileCommandRoute>;
}
