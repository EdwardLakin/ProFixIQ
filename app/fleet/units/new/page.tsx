import { redirect } from "next/navigation";
import { FLEET_PRODUCT_ORIGIN } from "@/features/fleet/lib/fleetProductRouting";

export default function LegacyFleetUnitEnrollmentPage() {
  redirect(new URL("/assets/new", FLEET_PRODUCT_ORIGIN).toString());
}
