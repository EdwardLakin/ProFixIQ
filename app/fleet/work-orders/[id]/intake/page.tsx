import { redirect } from "next/navigation";
import { FLEET_PRODUCT_ORIGIN } from "@/features/fleet/lib/fleetProductRouting";

type Props = { params: Promise<{ id: string }> };

export default async function LegacyFleetWorkOrderIntakePage({
  params,
}: Props) {
  const { id } = await params;
  const target = new URL("/history", FLEET_PRODUCT_ORIGIN);
  target.searchParams.set("workOrderId", id);
  redirect(target.toString());
}
