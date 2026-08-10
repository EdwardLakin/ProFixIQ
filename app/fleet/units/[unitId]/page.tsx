import { redirect } from "next/navigation";
import { FLEET_PRODUCT_ORIGIN } from "@/features/fleet/lib/fleetProductRouting";

type Props = { params: Promise<{ unitId: string }> };

export default async function FleetUnitDetailPage({ params }: Props) {
  const { unitId } = await params;
  redirect(
    new URL(
      `/assets/${encodeURIComponent(unitId)}`,
      FLEET_PRODUCT_ORIGIN,
    ).toString(),
  );
}
