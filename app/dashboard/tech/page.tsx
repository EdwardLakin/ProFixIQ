"use client";

import FeaturePage from "@/features/dashboard/app/dashboard/tech/page";
import QuickActions from "@shared/components/QuickActions";

export default function techDashboardPage() {
  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-white">tech Dashboard</h1>
      <QuickActions role="tech" />
      <FeaturePage />
    </div>
  );
}
