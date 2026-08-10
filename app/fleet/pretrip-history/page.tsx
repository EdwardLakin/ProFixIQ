import { redirect } from "next/navigation";
import { FLEET_PRODUCT_ORIGIN } from "@/features/fleet/lib/fleetProductRouting";

export default function LegacyFleetPretripHistoryPage() {
  redirect(new URL("/pre-trips", FLEET_PRODUCT_ORIGIN).toString());
}
