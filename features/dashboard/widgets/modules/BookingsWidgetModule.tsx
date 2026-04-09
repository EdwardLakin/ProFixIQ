import BookingsWidget from "@/features/dashboard/widgets/BookingsWidget";
import type { DashboardWidgetModule } from "@/features/dashboard/types/widget";

export const bookingsWidgetModule: DashboardWidgetModule = {
  id: "bookings",
  title: "Bookings",
  description: "Upcoming appointment activity",
  roles: ["owner", "admin", "manager", "advisor"],
  defaultW: 4,
  defaultH: 5,
  minW: 3,
  minH: 4,
  render: () => <BookingsWidget />,
};
