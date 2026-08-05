import { Building2, Settings, UsersRound } from "lucide-react";

import FleetModuleFoundation from "@/features/fleet/components/FleetModuleFoundation";

export default function FleetSettingsPage() {
  return (
    <FleetModuleFoundation
      eyebrow="Fleet administration"
      title="Fleet Settings"
      description="Fleet configuration belongs to the fleet organization. Workspace details, users, permissions and maintenance preferences remain separate from ProFixIQ Shop settings."
      capabilities={[
        {
          title: "Fleet workspace",
          description: "Organization profile, operating locations and fleet preferences.",
          icon: Building2,
        },
        {
          title: "Users & roles",
          description: "Managers, maintenance coordinators, approvers, drivers and viewers.",
          icon: UsersRound,
        },
        {
          title: "Maintenance defaults",
          description: "Approval rules, measurements, notification and scheduling preferences.",
          icon: Settings,
        },
      ]}
      primaryHref="/portal/fleet"
      primaryLabel="Return to Control Tower"
    />
  );
}
