"use client";

import FeaturePage from "@/features/dashboard/app/dashboard/advisor/page";
import QuickActions from "@shared/components/QuickActions";

export default function advisorDashboardPage() {
  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-white">advisor Dashboard</h1>
      <QuickActions role="advisor" />
      <FeaturePage />
    </div>
  );
}
