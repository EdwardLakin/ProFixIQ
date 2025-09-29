// app/dashboard/page.tsx
"use client";

import HomeScreen from "@/features/launcher/components/HomeScreen";

// ⬇️ REMOVE these legacy imports:
// import NavFromTiles from "@/features/shared/components/nav/NavFromTiles";
// import QuickLaunch from "@/features/dashboard/components/QuickLaunch";

export default function DashboardHome() {
  return <HomeScreen />;
}