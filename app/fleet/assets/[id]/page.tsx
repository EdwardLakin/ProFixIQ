import { redirect } from "next/navigation";
import { FLEET_PRODUCT_ORIGIN } from "@/features/fleet/lib/fleetProductRouting";

type Props = { params: Promise<{ id: string }> };

export default async function LegacyFleetAssetPage({ params }: Props) {
  const { id } = await params;
  redirect(
    new URL(
      `/assets/${encodeURIComponent(id)}`,
      FLEET_PRODUCT_ORIGIN,
    ).toString(),
  );
}
