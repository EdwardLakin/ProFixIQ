import { redirect } from "next/navigation";

export default function LegacyFleetProgramsPage() {
  redirect("/dashboard/owner/fleet-access");
}
