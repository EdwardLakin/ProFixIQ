"use client";

import FeaturePage from "@/features/dashboard/app/dashboard/manager/page";
import QuickActions from "@shared/components/QuickActions";

export default function managerDashboardPage() {
  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-white">manager Dashboard</h1>
      <QuickActions role="manager" />
      <FeaturePage />
    </div>
  );
}
