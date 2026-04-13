import { redirect } from "next/navigation";

// Legacy route ownership shim.
// Canonical Parts requests surface is /parts/requests under app/parts/*.
export default function LegacyDashboardPartsPage() {
  redirect("/parts/requests");
}
