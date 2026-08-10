import { redirect } from "next/navigation";
import { FLEET_PRODUCT_ORIGIN } from "@/features/fleet/lib/fleetProductRouting";

export default function LegacyFleetTowerPage() {
  redirect(FLEET_PRODUCT_ORIGIN);
}
