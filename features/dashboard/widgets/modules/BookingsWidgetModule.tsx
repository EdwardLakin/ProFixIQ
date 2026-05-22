import BookingsWidget from "@/features/dashboard/widgets/BookingsWidget";
import type { DashboardWidgetModule } from "@/features/dashboard/types/widget";

export const bookingsWidgetModule: DashboardWidgetModule = {
  id: "bookings",
  title: "Bookings",
  description: "Upcoming appointment activity",
  roles: ["owner", "admin", "manager", "advisor", "lead_hand", "foreman"],
  defaultW: 4,
  defaultH: 4,
  minW: 3,
  minH: 3,
  selfContained: true,
  render: () => <BookingsWidget />,
};
