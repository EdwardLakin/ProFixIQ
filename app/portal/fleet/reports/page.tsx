import { ChartNoAxesCombined, CircleDollarSign, ShieldCheck } from "lucide-react";

import FleetModuleFoundation from "@/features/fleet/components/FleetModuleFoundation";

export default function FleetReportsPage() {
  return (
    <FleetModuleFoundation
      eyebrow="Fleet intelligence"
      title="Reports"
      description="Operational reporting for the fleet manager: maintenance compliance, downtime, asset cost and repair performance across every connected or external service provider."
      capabilities={[
        {
          title: "PM compliance",
          description: "Due, overdue, deferred and completed preventive maintenance.",
          icon: ShieldCheck,
        },
        {
          title: "Cost performance",
          description: "Maintenance spend by asset, category, kilometre and engine hour.",
          icon: CircleDollarSign,
        },
        {
          title: "Downtime & reliability",
          description: "Unavailable time, repeat repairs and recurring asset issues.",
          icon: ChartNoAxesCombined,
        },
      ]}
      primaryHref="/portal/fleet/billing"
      primaryLabel="Review history & costs"
    />
  );
}
