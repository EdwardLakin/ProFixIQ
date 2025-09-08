"use client";

import NavFromTiles from "@/features/shared/components/nav/NavFromTiles";

export default function DashboardHome() {
  return (
    <div className="space-y-8">
      <NavFromTiles
        scope="all"
        heading="Dashboard"
        description="Quick actions matched to your role. Use the tabs bar to hop between recently opened pages."
      />
    </div>
  );
}