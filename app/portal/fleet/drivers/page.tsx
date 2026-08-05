import { ClipboardCheck, Route, UsersRound } from "lucide-react";

import FleetModuleFoundation from "@/features/fleet/components/FleetModuleFoundation";

export default function FleetDriversPage() {
  return (
    <FleetModuleFoundation
      eyebrow="Fleet operations"
      title="Drivers"
      description="Manage the people connected to fleet assets without mixing them into shop staffing. Driver assignments, pre-trips and defect reporting belong to the fleet workspace."
      capabilities={[
        {
          title: "Driver directory",
          description: "Fleet-owned driver identities, access roles and current status.",
          icon: UsersRound,
        },
        {
          title: "Asset assignments",
          description: "Current and historical unit assignments with clear responsibility.",
          icon: Route,
        },
        {
          title: "Inspection compliance",
          description: "Pre-trip completion, missed inspections and submitted defects.",
          icon: ClipboardCheck,
        },
      ]}
      primaryHref="/portal/fleet/pretrip-history"
      primaryLabel="Review pre-trips"
    />
  );
}
