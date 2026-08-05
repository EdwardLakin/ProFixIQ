import { CalendarDays, Clock3, Wrench } from "lucide-react";

import FleetModuleFoundation from "@/features/fleet/components/FleetModuleFoundation";

export default function FleetCalendarPage() {
  return (
    <FleetModuleFoundation
      eyebrow="Maintenance planning"
      title="Maintenance Calendar"
      description="A fleet-wide planning surface for preventive maintenance, booked repairs, inspections and expected downtime. The calendar will schedule assets—not shop technicians."
      capabilities={[
        {
          title: "Upcoming maintenance",
          description: "PM due dates and forecasted mileage, hour or calendar thresholds.",
          icon: CalendarDays,
        },
        {
          title: "Service appointments",
          description: "Connected-shop bookings and externally recorded maintenance events.",
          icon: Wrench,
        },
        {
          title: "Downtime planning",
          description: "Expected out-of-service windows and asset availability conflicts.",
          icon: Clock3,
        },
      ]}
      primaryHref="/portal/fleet/maintenance"
      primaryLabel="Open PM queue"
    />
  );
}
