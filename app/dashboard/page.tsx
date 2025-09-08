"use client"

import NavFromTiles from "@/features/shared/components/nav/NavFromTiles";
import { useUserRole } from "@/features/shared/hooks/useUserRole";

// Optional role panels (kept empty for now; grow as needed)
import AdvisorPanel from "@/features/dashboard/components/role-panels/AdvisorPanel";
import ManagerPanel from "@/features/dashboard/components/role-panels/ManagerPanel";
import TechPanel from "@/features/dashboard/components/role-panels/TechPanel";
import OwnerPanel from "@/features/dashboard/components/role-panels/OwnerPanel";
import PartsPanel from "@/features/dashboard/components/role-panels/PartsPanel";
import AdminPanel from "@/features/dashboard/components/role-panels/AdminPanel";

export default function DashboardHome() {
  const { role, loading } = useUserRole();

  return (
    <div className="space-y-8">
      {/* Role-aware CTA hub */}
      <NavFromTiles
        scope="all"
        heading="Dashboard"
        description="Quick actions matched to your role. Use the tabs bar to hop between recently opened pages."
      />

      {/* Optional role-specific widgets/panels below the CTA hub */}
      {!loading && role === "advisor" && <AdvisorPanel />}
      {!loading && role === "manager" && <ManagerPanel />}
      {!loading && role === "mechanic" && <TechPanel />}
      {!loading && role === "owner" && <OwnerPanel />}
      {!loading && role === "parts" && <PartsPanel />}
      {!loading && role === "admin" && <AdminPanel />}
    </div>
  );
}
