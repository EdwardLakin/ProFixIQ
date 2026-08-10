import { redirect } from "next/navigation";
import { FLEET_PRODUCT_ORIGIN } from "@/features/fleet/lib/fleetProductRouting";

export default function FleetIndexPage() {
  redirect(FLEET_PRODUCT_ORIGIN);
}
