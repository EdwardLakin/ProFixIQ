import { redirect } from "next/navigation";
import { FLEET_PRODUCT_ORIGIN } from "@/features/fleet/lib/fleetProductRouting";

export default function LegacyFleetPretripPage() {
  redirect(new URL("/pre-trips/start", FLEET_PRODUCT_ORIGIN).toString());
}
