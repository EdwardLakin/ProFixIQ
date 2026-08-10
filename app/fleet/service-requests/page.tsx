import { redirect } from "next/navigation";

export default function LegacyFleetServiceRequestsPage() {
  redirect("/work-orders/fleet-requests");
}
