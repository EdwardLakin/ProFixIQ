import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

const globals = read("app/globals.css");
const appShell = read("features/shared/components/AppShell.tsx");
const operationalSwitcher = read(
  "features/dashboard/components/OperationalViewSwitcher.tsx",
);
const appointmentsPage = read("app/dashboard/appointments/page.tsx");
const weeklyCalendar = read("app/dashboard/appointments/WeeklyCalendar.tsx");
const fullCalendar = read("app/dashboard/appointments/FullCalendarModal.tsx");
const staffBookingsRoute = read("app/api/portal/bookings/route.ts");
const staffBookingRoute = read("app/api/portal/bookings/[id]/route.ts");
const requestSubmitRoute = read("app/api/portal/request/submit/route.ts");
const customerBookingPage = read("app/portal/booking/BookingPageClient.tsx");
const customerAppointmentsPage = read(
  "app/portal/customer-appointments/page.tsx",
);

describe("premium UI foundation regressions", () => {
  it("keeps light-mode pill text readable without changing dark-mode tokens", () => {
    for (const color of [
      "red",
      "rose",
      "amber",
      "yellow",
      "green",
      "emerald",
      "cyan",
      "sky",
      "blue",
      "violet",
      "purple",
      "orange",
    ]) {
      expect(globals).toContain(
        `html[data-theme-mode="light"] [class*="rounded"][class~="text-${color}`,
      );
    }

    expect(globals).toContain('html[data-theme-mode="light"] .accent-chip');
    expect(globals).toContain(
      'html[data-theme-mode="light"] .app-shell-action',
    );
    expect(appShell).toContain("app-shell-action");
    expect(operationalSwitcher).toContain("text-orange-900");
    expect(operationalSwitcher).toContain("dark:text-orange-100");
  });

  it("keeps the compact five-day schedule and the detailed calendar modal", () => {
    expect(weeklyCalendar).toContain("Array.from({ length: 5 }");
    expect(appointmentsPage).toContain("<FullCalendarModal");
    expect(appointmentsPage).toContain("Full calendar");
    expect(fullCalendar).toContain("Array.from({ length: 42 }");
    expect(fullCalendar).toContain("Review capacity by month");
  });

  it("keeps appointment mutations compatible with the atomic lifecycle", () => {
    expect(appointmentsPage).toContain('"Idempotency-Key"');
    expect(customerBookingPage).toContain('"Idempotency-Key"');
    expect(customerAppointmentsPage).toContain('"Idempotency-Key"');
    expect(staffBookingRoute).toContain('action: "cancel"');
    expect(staffBookingRoute).not.toContain('.from("bookings").delete');
    expect(appointmentsPage).toContain("Cancel appointment");
  });

  it("keeps customer requests pending until staff approval", () => {
    expect(requestSubmitRoute).toMatch(
      /const bookingUpdate:[\s\S]*?status: "pending"/,
    );
    expect(appointmentsPage).toContain("status=pending");
    expect(staffBookingsRoute).toContain('status === "pending"');
    expect(staffBookingRoute).toContain("notifyBookingConfirmation");
  });
});
