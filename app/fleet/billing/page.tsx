import { redirect } from "next/navigation";
import { FLEET_PRODUCT_ORIGIN } from "@/features/fleet/lib/fleetProductRouting";

type Props = {
  searchParams: Promise<{ workOrderId?: string; filter?: string }>;
};

export default async function FleetBillingPage({ searchParams }: Props) {
  const query = await searchParams;
  const target = new URL("/history", FLEET_PRODUCT_ORIGIN);
  if (query.workOrderId)
    target.searchParams.set("workOrderId", query.workOrderId);
  if (query.filter) target.searchParams.set("filter", query.filter);
  redirect(target.toString());
}
