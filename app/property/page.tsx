import PropertyMaintenanceDashboard from "@/features/property/components/PropertyMaintenanceDashboard";
import { getPropertyOperationsDashboardData } from "@/features/property/server/propertyOperationsQueries";

export default async function PropertyPage() {
  const dashboardData = await getPropertyOperationsDashboardData();

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(193,122,74,0.18),transparent_34%),#020617] px-4 py-6 text-white md:px-8">
      <div className="mx-auto max-w-7xl">
        <PropertyMaintenanceDashboard liveData={dashboardData} />
      </div>
    </main>
  );
}
