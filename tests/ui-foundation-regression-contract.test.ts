import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

const globals = read("app/globals.css");
const appShell = read("features/shared/components/AppShell.tsx");
const actionButton = read("features/shared/components/ActionButton.tsx");
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
        `html[data-theme-mode="light"] [class*="rounded"][class*="text-${color}-"]`,
      );
    }

    expect(globals).toContain('html[data-theme-mode="light"] .accent-chip');
    expect(globals).toContain(
      'html[data-theme-mode="light"] .app-shell-action',
    );
    expect(actionButton).toContain("app-shell-action");
    expect(appShell).toContain(
      'import ActionButton from "@/features/shared/components/ActionButton"',
    );
    expect(operationalSwitcher).toContain("text-blue-800");
    expect(operationalSwitcher).toContain("dark:text-blue-100");
  });

  it("keeps saved shop branding from overriding dark-mode surfaces and text", () => {
    const darkBlock = globals.slice(
      globals.indexOf('html[data-theme-mode="dark"] {'),
      globals.indexOf("/* Legacy status pills"),
    );
    for (const token of [
      "--theme-card-bg",
      "--theme-card-border",
      "--theme-surface-2",
      "--theme-text-primary",
      "--theme-text-secondary",
      "--theme-text-muted",
      "--theme-sidebar-bg",
      "--theme-header-bg",
      "--theme-input-bg",
      "--theme-input-text",
      "--theme-surface-page",
      "--theme-surface-panel",
    ]) {
      expect(darkBlock).toMatch(new RegExp(`${token}:[^;]+!important;`));
    }
    expect(darkBlock).not.toMatch(/--brand-(primary|accent):/);
    expect(darkBlock).not.toMatch(
      /--theme-(button-primary|sidebar-active)-(bg|text):/,
    );
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
