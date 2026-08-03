import FleetBillingWorkspace from "@/features/fleet/components/FleetBillingWorkspace";

type Props = {
  searchParams: Promise<{ workOrderId?: string; filter?: string }>;
};

export default async function PortalFleetBillingPage({ searchParams }: Props) {
  const query = await searchParams;
  return (
    <FleetBillingWorkspace
      routePrefix="/portal/fleet"
      initialWorkOrderId={query.workOrderId}
      initialFilter={query.filter}
    />
  );
}
