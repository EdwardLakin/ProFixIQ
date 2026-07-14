import PropertyMaintenanceDashboard from "@/features/property/components/PropertyMaintenanceDashboard";
import { getPropertyOperationsDashboardData } from "@/features/property/server/propertyOperationsQueries";

export default async function PropertyPage() {
  const dashboardData = await getPropertyOperationsDashboardData();

  return (
    <main className="min-h-screen bg-[var(--theme-gradient-panel)] px-4 py-6 text-[color:var(--theme-text-primary)] md:px-8">
      <div className="mx-auto max-w-7xl">
        <PropertyMaintenanceDashboard liveData={dashboardData} />
      </div>
    </main>
  );
}
