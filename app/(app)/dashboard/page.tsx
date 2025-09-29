export const dynamic = "force-dynamic";
export const revalidate = 0;

import HomeScreen from "@/features/launcher/components/HomeScreen";
import WelcomeBanner from "@/features/launcher/components/WelcomeBanner";

export default function DashboardHome() {
  return (
    <>
      <div className="px-3 pt-1">
        <WelcomeBanner />
      </div>
      <HomeScreen />
    </>
  );
}
