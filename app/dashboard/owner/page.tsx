"use client";

import FeaturePage from "@/features/dashboard/app/dashboard/owner/page";
import QuickActions from "@shared/components/QuickActions";

export default function ownerDashboardPage() {
  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-white">owner Dashboard</h1>
      <QuickActions role="owner" />
      <FeaturePage />
    </div>
  );
}
