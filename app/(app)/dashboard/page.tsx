// app/(app)/dashboard/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import WelcomeBanner from "@/features/launcher/components/WelcomeBanner";
import WidgetGrid from "@/features/launcher/components/WidgetGrid";
import IconMenu from "@/features/launcher/components/IconMenu";

export default function DashboardHome() {
  return (
    <div className="px-2 pt-1 md:px-4">
      <WelcomeBanner />
      <div className="mt-3">
        <WidgetGrid />
      </div>
      <div className="mt-4">
        <IconMenu />
      </div>
    </div>
  );
}