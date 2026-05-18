import PropertyMaintenanceDashboard from "@/features/property/components/PropertyMaintenanceDashboard";

export default function PropertyPage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(193,122,74,0.18),transparent_34%),#020617] px-4 py-6 text-white md:px-8">
      <div className="mx-auto max-w-7xl">
        <PropertyMaintenanceDashboard />
      </div>
    </main>
  );
}
