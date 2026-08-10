import { redirect } from "next/navigation";
import { FLEET_PRODUCT_ORIGIN } from "@/features/fleet/lib/fleetProductRouting";

export default function LegacyFleetUnitsPage() {
  redirect(new URL("/assets", FLEET_PRODUCT_ORIGIN).toString());
}
