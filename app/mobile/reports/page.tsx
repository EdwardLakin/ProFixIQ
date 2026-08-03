import OwnerIntelligenceClient from "@/features/owner/reports/OwnerIntelligenceClient";
import { requireShopPageAccess } from "@/features/shared/lib/server/admin-access";

export default async function MobileReportsPage() {
  await requireShopPageAccess({
    requiredCapability: "canViewFinancials",
    allowRoles: ["owner", "admin", "manager"],
  });
  return (
    <main className="min-h-screen bg-[var(--theme-gradient-page)] text-[color:var(--theme-text-primary)]">
      <OwnerIntelligenceClient mobile />
    </main>
  );
}
