import { redirect } from "next/navigation";
import { FLEET_PRODUCT_ORIGIN } from "@/features/fleet/lib/fleetProductRouting";

export default function LegacyFleetMaintenancePage() {
  redirect(new URL("/maintenance", FLEET_PRODUCT_ORIGIN).toString());
}
