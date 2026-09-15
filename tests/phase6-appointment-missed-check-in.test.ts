import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const opsNotificationsModule = readFileSync(
  "features/agent/server/getOpsNotifications.ts",
  "utf8",
);
const shopStateModule = readFileSync(
  "features/shop-assistant/server/state/buildShopState.ts",
  "utf8",
);
const syncShopBlockerObservations = readFileSync(
  "features/operations/server/syncShopBlockerObservations.ts",
  "utf8",
);

function section(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("Phase 6 — missed check-in, the second day-of deterministic-orchestration notification", () => {
  it("registers a durable notification code in the shared ops-notification vocabulary", () => {
    expect(opsNotificationsModule).toContain('"appointment_missed_check_in"');
  });

  it("queries bookings not yet converted to a work order, excluding cancelled/completed ones — matching syncAppointmentPreparations.ts's own exclusion set", () => {
    expect(opsNotificationsModule).toContain('.from("bookings")');
    expect(opsNotificationsModule).toContain('.is("work_order_id", null)');
    expect(opsNotificationsModule).toContain(
      'const EXCLUDED_BOOKING_STATUSES_FOR_MISSED_CHECK_IN = new Set([\n  "cancelled",\n  "canceled",\n  "completed",\n]);',
    );
  });

  describe("detection block", () => {
    const block = section(
      opsNotificationsModule,
      "for (const row of overdueBookingRows) {",
      "const loadMetrics = await getTechnicianLoadMetricsWithClient",
    );

    it("only fires once the promised time has passed the threshold, bounded to a recent lookback window rather than unbounded history", () => {
      expect(opsNotificationsModule).toContain(
        "const MISSED_CHECK_IN_MIN_HOURS = 1;",
      );
      expect(opsNotificationsModule).toContain(
        "const MISSED_CHECK_IN_LOOKBACK_HOURS = 72;",
      );
      expect(opsNotificationsModule).toContain(
        ".gte(\"starts_at\", missedCheckInLookbackStart)",
      );
      expect(opsNotificationsModule).toContain(
        ".lt(\"starts_at\", missedCheckInCutoff)",
      );
    });

    it("escalates to urgent past a longer threshold", () => {
      expect(opsNotificationsModule).toContain(
        "const MISSED_CHECK_IN_URGENT_HOURS = 3;",
      );
      expect(block).toContain(
        "hours >= MISSED_CHECK_IN_URGENT_HOURS ? \"urgent\" : \"warning\"",
      );
    });

    it("links to the same create-work-order-from-booking flow the day-of readiness signal uses", () => {
      expect(block).toContain(
        "const hrefParams = new URLSearchParams({ bookingId: row.id });",
      );
      expect(block).toContain('hrefParams.set("vehicleId", row.vehicle_id)');
      expect(block).toContain("href: `/work-orders/create?${hrefParams.toString()}`");
    });

    it("carries booking entity identity and the promised time as createdAt", () => {
      expect(block).toContain('code: "appointment_missed_check_in"');
      expect(block).toContain('entityType: "booking"');
      expect(block).toContain("entityId: row.id");
      expect(block).toContain("createdAt: row.starts_at");
    });
  });

  it("never mutates a booking or creates a work order — purely a read/detect signal like every other ops notification", () => {
    const block = section(
      opsNotificationsModule,
      "for (const row of overdueBookingRows) {",
      "const loadMetrics = await getTechnicianLoadMetricsWithClient",
    );
    expect(block).not.toMatch(
      /\.from\(\s*["'](bookings|work_orders)["']\)[\s\S]{0,200}\.\s*(insert|update|upsert|delete)\(/,
    );
  });

  it("flows automatically through the shadow-mode blocker observer with no extra wiring — it consumes getOpsNotifications generically", () => {
    expect(syncShopBlockerObservations).toContain("getOpsNotifications(");
    expect(syncShopBlockerObservations).not.toContain(
      '"appointment_missed_check_in"',
    );
  });

  it("is visible on the shop-assistant alert surface to booking- and work-order-facing roles, alongside the day-of readiness signal", () => {
    expect(shopStateModule).toContain(
      'alert.code === "appointment_day_of_readiness" ||\n    alert.code === "appointment_missed_check_in"',
    );
  });
});
