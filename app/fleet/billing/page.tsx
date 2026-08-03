import FleetBillingWorkspace from "@/features/fleet/components/FleetBillingWorkspace";

type Props = {
  searchParams: Promise<{ workOrderId?: string; filter?: string }>;
};

export default async function FleetBillingPage({ searchParams }: Props) {
  const query = await searchParams;
  return (
    <FleetBillingWorkspace
      routePrefix="/fleet"
      initialWorkOrderId={query.workOrderId}
      initialFilter={query.filter}
    />
  );
}
