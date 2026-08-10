import { redirect } from "next/navigation";
import { FLEET_PRODUCT_ORIGIN } from "@/features/fleet/lib/fleetProductRouting";

export default function LegacyFleetServiceRequestsPage() {
  redirect(new URL("/requests", FLEET_PRODUCT_ORIGIN).toString());
}
