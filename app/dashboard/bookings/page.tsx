import BookingsTableWrapper from "./BookingsTableWrapper";

export const dynamic = "force-dynamic";

export default function DashboardBookingsPage() {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 p-6 text-foreground">
      <header className="space-y-1">
        <h1 className="text-2xl font-blackops text-orange-500">Bookings</h1>
        <p className="text-sm text-neutral-400">
          View and manage appointments across your shop.
        </p>
      </header>

      <BookingsTableWrapper />
    </div>
  );
}
