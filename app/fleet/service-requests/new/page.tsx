import { redirect } from "next/navigation";

import { FLEET_PRODUCT_ORIGIN } from "@/features/fleet/lib/fleetProductRouting";

type Props = {
  searchParams: Promise<{ unitId?: string }>;
};

export default async function LegacyFleetNewRequestPage({
  searchParams,
}: Props) {
  const { unitId } = await searchParams;
  const target = new URL("/requests/new", FLEET_PRODUCT_ORIGIN);
  if (unitId) target.searchParams.set("unitId", unitId);
  redirect(target.toString());
}
